import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { requireUser } from "@/lib/auth/require-user";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, getOpenAI, CHAT_MODEL } from "@/lib/ai";
import { TOOLS, runTool, isReadTool, runProposal, isProposalTool } from "@/lib/ai-tools";
import { prisma } from "@/lib/prisma";

// Force the Node runtime — Edge would buffer SSE differently and we want full
// control over the stream lifecycle. (NOT setting runtime = "edge".)
export const dynamic = "force-dynamic";

const MAX_ITERS = 6;          // bound the tool-call loop
const MAX_HISTORY_MSGS = 30;  // bound input size from client history

interface ClientMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function buildSystemPrompt(): Promise<string> {
  // Pull a tiny bit of live context the model needs to ground itself.
  const today = new Date().toISOString().slice(0, 10);
  let semesterLine = "";
  try {
    const s = await prisma.semester.findFirst({ where: { isActive: true }, select: { label: true, startDate: true, endDate: true } });
    if (s) semesterLine = `The active semester is ${s.label} (${s.startDate} → ${s.endDate}).`;
  } catch { /* DB blip — model still works without this line */ }

  return [
    "You are the assistant for ChaptOS, a college fraternity chapter's operations dashboard.",
    "You help officers answer questions about brothers, attendance, deadlines, Instagram content, parties, treasury, and the budget.",
    "Always call the provided tools — never make up numbers or names. If no tool fits, say so.",
    "When the user wants to create or modify something, you have proposal tools (when enabled) that surface a confirm card; never claim you've written something on your own.",
    "Be terse and direct. Numbers and names beat prose. Cite the source briefly when it matters (e.g. \"per sum_transactions\").",
    `Today is ${today}.`,
    semesterLine,
  ].filter(Boolean).join(" ");
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
  const history = body.messages.slice(-MAX_HISTORY_MSGS).filter(m =>
    (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );

  const openai = getOpenAI();
  if (!openai) return Response.json({ enabled: false });

  const systemPrompt = await buildSystemPrompt();
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

          // Run each tool the model requested and append a tool message per call.
          for (const tc of toolCalls) {
            send("tool_call", { name: tc.name, status: "running" });

            let argsObj: Record<string, unknown> = {};
            try { argsObj = tc.argsBuf ? JSON.parse(tc.argsBuf) : {}; }
            catch { argsObj = { _parse_error: tc.argsBuf }; }

            let resultPayload: unknown;
            if (isReadTool(tc.name)) {
              resultPayload = await runTool(tc.name, argsObj);
            } else if (isProposalTool(tc.name)) {
              const proposal = runProposal(tc.name, argsObj);
              if ("error" in proposal) {
                // Validation failure — feed it back so the model can correct.
                resultPayload = proposal;
              } else {
                // Surface to the client as a confirm card.
                send("proposal", proposal);
                // Tell the model the user has been shown the confirm card; it
                // should NOT claim the action is done. The user is the next
                // actor — model usually just wraps with a one-liner.
                resultPayload = {
                  status: "awaiting_user_confirmation",
                  summary: proposal.summary,
                  note: "A confirm card has been shown to the user. Do not claim the action is complete. Reply briefly (≤1 short sentence) acknowledging the proposal.",
                };
              }
            } else {
              resultPayload = { error: `Unknown tool: ${tc.name}` };
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
        console.error("/api/ai/chat stream failed:", e);
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
