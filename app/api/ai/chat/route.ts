import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, getOpenAI, CHAT_MODEL, MAX_COMPLETION_TOKENS } from "@/lib/ai";
import { TOOLS, runTool, isReadTool, runProposal, isProposalTool } from "@/lib/ai-tools";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { logError } from "@/lib/observability";

// Force the Node runtime — Edge would buffer SSE differently and we want full
// control over the stream lifecycle. (NOT setting runtime = "edge".)
export const dynamic = "force-dynamic";

const MAX_ITERS = 10;         // bound the tool-call loop (allows broaden-and-retry + chained queries)
const MAX_HISTORY_MSGS = 12;  // bound input size — fewer prior turns = fewer input tokens = faster
const MAX_PRIOR_CONTENT_CHARS = 600; // trim long prior messages; recent turns matter more than verbatim history

interface ClientMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!aiEnabled()) return Response.json({ enabled: false });

  // Rate-limit: 20 chat messages per minute per brother.
  const limited = checkMutationRate(user.id, 20, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { messages?: ClientMessage[] } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "Invalid request: messages required" }, { status: 400 });
  }

  // Truncate to last N for safety; the client also caps but trust nothing.
  // Also trim long prior message content — exact verbatim history rarely matters,
  // and inflating context with old verbose assistant replies adds input tokens
  // and parse time before the first new token streams. The latest user message
  // is preserved in full (it's what the model is answering right now).
  const raw = body.messages.slice(-MAX_HISTORY_MSGS).filter(m =>
    (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );
  const lastIdx = raw.length - 1;
  const history = raw.map((m, i) => {
    if (i === lastIdx) return m; // keep the new user message untouched
    if (m.content.length <= MAX_PRIOR_CONTENT_CHARS) return m;
    return { ...m, content: m.content.slice(0, MAX_PRIOR_CONTENT_CHARS) + "…" };
  });

  const openai = getOpenAI();
  if (!openai) return Response.json({ enabled: false });

  const systemPrompt = await buildSystemPrompt(user.orgId);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        for (let iter = 0; iter < MAX_ITERS; iter++) {
          // Accumulate one assistant turn from the streamed deltas
          const assistantContent: string[] = [];
          // OpenAI tool_calls stream as separate deltas keyed by index → assemble them.
          const toolCallsByIndex = new Map<number, { id: string; name: string; argsBuf: string }>();
          let finishReason: string | null = null;

          const completion = await openai.chat.completions.create({
            model: CHAT_MODEL,
            messages,
            tools: TOOLS,
            tool_choice: "auto",
            // Parallel tool calls let the model emit several calls in one turn
            // instead of round-tripping for each — big latency win on questions
            // that need two or three lookups (e.g. "how are dues and attendance?").
            parallel_tool_calls: true,
            // Lower temperature → terser, more decisive responses (less hedging).
            // Same token cost, faster perceived time-to-useful-answer.
            temperature: 0.3,
            // Cap output length. Chat answers are short by design; on gpt-5.x this
            // is max_completion_tokens (counts reasoning tokens too — see lib/ai),
            // so it's higher than the old gpt-4o cap to leave reasoning headroom.
            max_completion_tokens: MAX_COMPLETION_TOKENS,
            stream: true,
          });

          for await (const chunk of completion) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (typeof delta.content === "string" && delta.content.length > 0) {
              assistantContent.push(delta.content);
              send("text", { delta: delta.content });
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                let slot = toolCallsByIndex.get(idx);
                if (!slot) {
                  slot = { id: tc.id ?? "", name: tc.function?.name ?? "", argsBuf: "" };
                  toolCallsByIndex.set(idx, slot);
                }
                if (tc.id) slot.id = tc.id;
                if (tc.function?.name) slot.name = tc.function.name;
                if (tc.function?.arguments) slot.argsBuf += tc.function.arguments;
              }
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }

          const fullText = assistantContent.join("");
          const toolCalls = Array.from(toolCallsByIndex.entries())
            .sort(([a], [b]) => a - b)
            .map(([, v]) => v)
            .filter(v => v.name);

          if (finishReason !== "tool_calls" || toolCalls.length === 0) {
            // Done — model returned a final assistant message.
            break;
          }

          // Append the assistant turn (with its tool_calls) to message history.
          messages.push({
            role: "assistant",
            content: fullText || null,
            tool_calls: toolCalls.map(t => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: t.argsBuf || "{}" },
            })),
          });

          // Run tool calls CONCURRENTLY when the model emitted more than one in
          // this turn. Sequential awaits would add ~1 DB round trip per extra
          // tool; Promise.all collapses them. Tool messages must still appear
          // back in the SAME order as the tool_calls array, so we map → await all.
          const prepared = toolCalls.map(tc => {
            send("tool_call", { name: tc.name, status: "running" });
            let argsObj: Record<string, unknown> = {};
            try { argsObj = tc.argsBuf ? JSON.parse(tc.argsBuf) : {}; }
            catch { argsObj = { _parse_error: tc.argsBuf }; }
            return { tc, argsObj };
          });

          const results = await Promise.all(prepared.map(async ({ tc, argsObj }) => {
            let resultPayload: unknown;
            let proposalEvent: { send: true; proposal: Awaited<ReturnType<typeof runProposal>> } | null = null;
            if (isReadTool(tc.name)) {
              resultPayload = await runTool(tc.name, argsObj, user.orgId);
            } else if (isProposalTool(tc.name)) {
              const proposal = await runProposal(tc.name, argsObj, user.orgId);
              if ("error" in proposal) {
                resultPayload = proposal;
              } else {
                proposalEvent = { send: true, proposal };
                resultPayload = {
                  status: "awaiting_user_confirmation",
                  summary: proposal.summary,
                  note: "A confirm card has been shown to the user. Do not claim the action is complete. Reply briefly (≤1 short sentence) acknowledging the proposal.",
                };
              }
            } else {
              resultPayload = { error: `Unknown tool: ${tc.name}` };
            }
            return { tc, resultPayload, proposalEvent };
          }));

          // Emit results in tool_calls order so client status events stay aligned.
          for (const { tc, resultPayload, proposalEvent } of results) {
            if (proposalEvent && proposalEvent.send && !("error" in proposalEvent.proposal)) {
              send("proposal", proposalEvent.proposal);
            }
            send("tool_call", { name: tc.name, status: "done" });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(resultPayload),
            });
          }
          // Loop back: the model now sees the tool results and writes its answer.
        }

        send("done", {});
      } catch (e) {
        logError(e, { route: "/api/ai/chat", method: "POST", userId: user.id });
        send("text", { delta: "\n\n_(Sorry — I hit an error. Try again in a moment.)_" });
        send("done", {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      // Vercel/proxies: don't buffer
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  // Lightweight enabled probe so the client can hide the floating button when no key.
  return Response.json({ enabled: aiEnabled() });
}
