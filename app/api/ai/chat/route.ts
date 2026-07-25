import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { buildContext } from "@/lib/context";
import { checkMutationRate } from "@/lib/rate-limit";
import { aiEnabled, getOpenAI, CHAT_MODEL, MAX_COMPLETION_TOKENS, CHAT_REASONING_EFFORT } from "@/lib/ai";
import { TOOLS, TOOL_UI, runTool, isReadTool, runProposal, isProposalTool, isAnswerTool, parseComposeAnswer, type Proposal } from "@/lib/ai-tools";
import { buildSystemPrompt } from "@/lib/ai-prompt";
import { tryFastPath } from "@/lib/ai-fastpath";
import { withIdleTimeout, StreamIdleTimeoutError, STREAM_IDLE_MS } from "@/lib/ai-stream";
import { assembleToolCalls, stepId, stepNameSettled } from "@/lib/ai-ledger";
import { logError, logTiming } from "@/lib/observability";

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

// ── SSE protocol ─────────────────────────────────────────────────────────────
// open       {}                             — flushed immediately (paint "thinking")
// step       { id, verb, source? }          — a tool call the model has NAMED; renders PENDING.
//                                             Emitted mid-stream, the moment the name is final
//                                             (see the delta loop) — not when the batch dispatches.
// step_start { id }                         — that step is now executing; renders ACTIVE
// step_done  { id, finding? }               — that step settled; finding derived from the REAL
//                                             result, sent as each tool resolves (not per batch)
// step_drop  { ids }                        — named steps that will never run (truncated turn);
//                                             the client removes them rather than spinning forever
// composing  {}                             — the model is writing the answer, not calling tools
// proposal   Proposal                       — writ card (see lib/ai-tools.ts)
// answer     { verdict, rows, follows, sources } — structured final answer; sources are
//                                             server-derived from the read tools actually run
// text       { delta }                      — plain-prose fallback (refusals, how-to, fast-path, errors)
// done       {}
// The client renders steps as the reasoning ledger (pending → active → done on a
// ruled margin) and keeps a standing "Composing the answer" line.
//
// Step ids are `${iter}:${rawDeltaIndex}` — the RAW tool_calls delta index, never
// a position in a filtered array. A compacted index would drift the instant any
// index streamed without a usable name, and every later step_done would miss.

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  // buildContext gates on an active Membership (not just a resolvable org), which
  // requireUser() did NOT — a member removed from their only org could still
  // resolve their stale home org and reach these read tools. ctx.db is org-scoped
  // for every tool query. Rate limiting is handled explicitly below (20/min), so
  // skip buildContext's default writer limit.
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;

  if (!aiEnabled()) return Response.json({ enabled: false });

  // Rate-limit: 20 chat messages per minute per brother.
  const limited = checkMutationRate(ctx.actorId, 20, 60_000);
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

  // Kick off the prompt build but don't await it here — awaiting before
  // constructing the Response delays the SSE headers (and the client's
  // "thinking" state) by a DB round trip on cache miss. The stream awaits it.
  const systemPromptPromise = buildSystemPrompt(ctx.db, ctx.orgId, { id: ctx.actorId, name: ctx.actorName });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // enqueue throws once the client disconnects (controller closed) — and a
      // disconnect can land mid-loop, between tool results, or inside the catch
      // block itself. Swallow it: the work is already done or abandoned either
      // way, and throwing from here just turns a hangup into a logged error.
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(sseEvent(event, data))); }
        catch { closed = true; }
      };

      // ── Latency telemetry ──────────────────────────────────────────────
      // The dominant cost here is the LLM round-trips (one call per loop
      // iteration), not the DB tools. Capture per-iteration LLM ms, a TTFT
      // proxy (first streamed delta of the WHOLE request), and per-tool ms so
      // we can find the real p50/p95 hotspots and measure changes objectively.
      const reqStart = performance.now();
      const perIterMs: number[] = [];
      const toolMs: Record<string, number> = {};
      let ttftMs: number | null = null; // first visible token/tool-call across the request
      let totalIters = 0;
      let fastPathPattern: string | null = null;
      let answeredStructured = false;
      // Sources actually consulted this request (TOOL_UI labels, ordered dedup) —
      // attached to the structured answer server-side, never model-claimed.
      const consulted: string[] = [];

      try {
        // Flush a tiny event before awaiting the system prompt. buildSystemPrompt
        // can cost a DB round trip on cache miss; sending "open" first lets the
        // client paint its "thinking" state immediately instead of waiting on it.
        send("open", {});

        // ── Deterministic fast-path ─────────────────────────────────────────
        // A large fraction of questions map to exactly one DB query with no
        // params to infer ("who hasn't paid dues?", "treasury balance?"). For
        // those, skip BOTH model round-trips: answer straight from the DB. Any
        // non-match / error returns null and we fall through to the LLM loop
        // unchanged, so the worst case is "no faster than before," never wrong.
        const latest = history.at(-1);
        const fast = latest ? await tryFastPath(latest.content, ctx.db, ctx.orgId) : null;
        if (fast) {
          fastPathPattern = fast.pattern;
          ttftMs = performance.now() - reqStart;
          // One-step ledger so the thinking state never looks dead, then the text.
          const ui = TOOL_UI[fast.tool];
          if (ui) {
            send("step", { id: "fast:0", verb: ui.verb, ...(ui.source ? { source: ui.source } : {}) });
            send("step_done", { id: "fast:0" });
          }
          send("text", { delta: fast.text });
          send("done", {});
          return; // finally{} still runs: emits the timing line + closes the stream
        }

        const systemPrompt = await systemPromptPromise;
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...history.map(m => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
        ];

        for (let iter = 0; iter < MAX_ITERS; iter++) {
          totalIters = iter + 1;
          const iterStart = performance.now();
          // Accumulate one assistant turn from the streamed deltas
          const assistantContent: string[] = [];
          // OpenAI tool_calls stream as separate deltas keyed by index → assemble them.
          const toolCallsByIndex = new Map<number, { id: string; name: string; argsBuf: string }>();
          // Raw delta indices we've already announced to the client as pending steps,
          // so the batch-dispatch pass below doesn't announce them twice and the
          // truncated-turn path knows exactly what to retract.
          const sentSteps = new Set<number>();
          let composingSent = false;
          let finishReason: string | null = null;

          // The model has results from the previous round and is now writing —
          // truthful the moment we ask for iteration 2+, before a token lands.
          if (iter > 0) { send("composing", {}); composingSent = true; }

          const completion = await openai.chat.completions.create({
            model: CHAT_MODEL,
            messages,
            tools: TOOLS,
            tool_choice: "auto",
            // Parallel tool calls let the model emit several calls in one turn
            // instead of round-tripping for each — big latency win on questions
            // that need two or three lookups (e.g. "how are dues and attendance?").
            parallel_tool_calls: true,
            // Low reasoning effort: tool-selection turns don't benefit from deep
            // reasoning, and fewer reasoning tokens = faster first visible token.
            // NOTE: setting reasoning_effort makes gpt-5.2 reject any non-default
            // temperature (400: "only the default (1) value is supported"), so no
            // temperature here — terseness comes from the system prompt.
            reasoning_effort: CHAT_REASONING_EFFORT,
            // Sticky cache routing: the tools + system prompt prefix is ~5k
            // tokens and identical across an org's chat turns (the date line
            // changes daily, thresholds/semester every 5 min at most). Keying
            // by org routes repeat requests to the same cache shard, so the
            // prefix is served from OpenAI's prompt cache — lower TTFT on
            // every model call, including the per-tool-loop iterations.
            prompt_cache_key: `chat-org-${ctx.orgId}`,
            // Cap output length. Chat answers are short by design; on gpt-5.x this
            // is max_completion_tokens (counts reasoning tokens too — see lib/ai),
            // so it's higher than the old gpt-4o cap to leave reasoning headroom.
            max_completion_tokens: MAX_COMPLETION_TOKENS,
            stream: true,
          });

          // Idle watchdog: the client `timeout` bounds the connect, not the gap
          // between streamed chunks. Abort the upstream stream if it stalls so the
          // SSE response can't hang indefinitely; the throw lands in the catch below.
          for await (const chunk of withIdleTimeout(completion, STREAM_IDLE_MS, () => completion.controller.abort())) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (typeof delta.content === "string" && delta.content.length > 0) {
              if (ttftMs === null) ttftMs = performance.now() - reqStart;
              assistantContent.push(delta.content);
              send("text", { delta: delta.content });
            }
            if (delta.tool_calls) {
              if (ttftMs === null) ttftMs = performance.now() - reqStart;
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

                // Announce the step the moment the NAME is final, mid-turn —
                // ahead of the batch dispatching, and staggered by real timing
                // because each name lands after the previous call's arguments.
                // See lib/ai-ledger for why "final" needs more than a non-empty
                // name. Anything failing the gate falls through to dispatch.
                if (!sentSteps.has(idx) && stepNameSettled(slot, TOOL_UI)) {
                  if (isAnswerTool(slot.name)) {
                    // compose_answer never gets a step — the call IS the answer.
                    if (!composingSent) { send("composing", {}); composingSent = true; }
                  } else {
                    const ui = TOOL_UI[slot.name];
                    send("step", { id: stepId(iter, idx), verb: ui.verb, ...(ui.source ? { source: ui.source } : {}) });
                    sentSteps.add(idx);
                  }
                }
              }
            }
            if (choice.finish_reason) finishReason = choice.finish_reason;
          }

          perIterMs.push(Math.round(performance.now() - iterStart));

          const fullText = assistantContent.join("");
          const toolCalls = assembleToolCalls(toolCallsByIndex);

          if (finishReason !== "tool_calls" || toolCalls.length === 0) {
            // Done — model returned a final assistant message. Any step already
            // announced mid-stream will never run (a turn truncated by
            // max_completion_tokens can strand a half-streamed call), so retract
            // it rather than leave the client spinning on it forever.
            if (sentSteps.size > 0) {
              send("step_drop", { ids: [...sentSteps].map(i => stepId(iter, i)) });
            }
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

          // Each non-terminal call in this batch flips to ACTIVE as it dispatches.
          // Most were already announced pending from the delta loop above; the
          // fallback `step` covers anything that missed that gate (unknown tool
          // name, or a name that never got arguments). compose_answer gets no
          // step: the call IS the final answer (handled below); the client shows
          // its own standing "Composing the answer" line.
          const prepared = toolCalls.map(tc => {
            const id = stepId(iter, tc.idx);
            const ui = TOOL_UI[tc.name];
            if (!isAnswerTool(tc.name)) {
              if (!sentSteps.has(tc.idx)) {
                send("step", { id, verb: ui?.verb ?? tc.name, ...(ui?.source ? { source: ui.source } : {}) });
                sentSteps.add(tc.idx);
              }
              send("step_start", { id });
            }
            let argsObj: Record<string, unknown> = {};
            try { argsObj = tc.argsBuf ? JSON.parse(tc.argsBuf) : {}; }
            catch { argsObj = { _parse_error: tc.argsBuf }; }
            return { tc, argsObj, stepId: id };
          });

          const answerCall = prepared.find(p => isAnswerTool(p.tc.name));
          const execCalls = prepared.filter(p => !isAnswerTool(p.tc.name));

          // Run tool calls CONCURRENTLY when the model emitted more than one in
          // this turn. Sequential awaits would add ~1 DB round trip per extra
          // tool; Promise.all collapses them. Tool messages must still appear
          // back in the SAME order as the tool_calls array, so we map → await all.
          const results = await Promise.all(execCalls.map(async ({ tc, argsObj, stepId }) => {
            const toolStart = performance.now();
            let resultPayload: unknown;
            let proposalEvent: Proposal | null = null;
            if (isReadTool(tc.name)) {
              resultPayload = await runTool(tc.name, argsObj, ctx.db, ctx.orgId);
            } else if (isProposalTool(tc.name)) {
              const proposal = await runProposal(tc.name, argsObj, ctx.db, {
                orgId: ctx.orgId,
                actorId: ctx.actorId,
                permissions: ctx.permissions,
                isOrgAdmin: ctx.isOrgAdmin,
                isPlatformAdmin: ctx.isPlatformAdmin,
              });
              if ("error" in proposal) {
                resultPayload = proposal;
              } else {
                proposalEvent = proposal;
                // The permission gates BOTH proposing and approving: a holder's
                // draft awaits their confirm; a non-holder's draft is BLOCKED
                // (not routed) and the model must say who does hold it.
                resultPayload = proposal.perm.canApprove
                  ? {
                      status: "awaiting_user_confirmation",
                      summary: proposal.summary,
                      note: "A confirm card has been shown to the user. Do not claim the action is complete. Reply briefly (≤1 short sentence) acknowledging the proposal.",
                    }
                  : {
                      status: "blocked_missing_permission",
                      summary: proposal.summary,
                      requiredPermission: proposal.perm.label,
                      heldBy: proposal.perm.holders ?? null,
                      note: "The user does NOT hold the permission this action requires, so the draft is blocked — they cannot approve it, and it will not be routed to anyone. A blocked card is shown. In ≤2 short sentences, tell them which permission it needs and who holds it. Do not claim anything was done.",
                    };
              }
            } else {
              resultPayload = { error: `Unknown tool: ${tc.name}` };
            }
            // Sum by tool name — the same tool can be called twice in one batch.
            toolMs[tc.name] = (toolMs[tc.name] ?? 0) + Math.round(performance.now() - toolStart);
            // Settle THIS step the moment ITS OWN result lands, rather than
            // waiting on the slowest tool in the batch — a batch that settled
            // all at once read as one pop instead of a ledger being posted.
            // Only the step event moves: tool results, consulted[] order and
            // proposals all stay in tool_calls order in the loop below.
            // The finding fn is pure and already error-boxed, so it's safe here.
            let finding: string | null = null;
            try { finding = TOOL_UI[tc.name]?.finding?.(resultPayload, argsObj) ?? null; }
            catch { finding = null; }
            send("step_done", { id: stepId, ...(finding ? { finding } : {}) });
            return { tc, argsObj, stepId, resultPayload, proposalEvent };
          }));

          // Emit results in tool_calls order so client step states stay aligned.
          for (const { tc, resultPayload, proposalEvent } of results) {
            if (proposalEvent) send("proposal", proposalEvent);
            if (isReadTool(tc.name)) {
              const src = TOOL_UI[tc.name]?.source;
              if (src && !consulted.includes(src)) consulted.push(src);
            }
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(resultPayload),
            });
          }

          // Terminal structured answer: the compose_answer call IS the final
          // answer — emit it with the server-derived sources and stop, no extra
          // model round trip. A malformed call is fed back as its tool result so
          // the model retries next iteration; the abandoned message history is
          // fine on success because no further completion is requested.
          if (answerCall) {
            const parsed = parseComposeAnswer(answerCall.argsObj);
            if ("error" in parsed) {
              messages.push({ role: "tool", tool_call_id: answerCall.tc.id, content: JSON.stringify(parsed) });
            } else {
              send("answer", { ...parsed, sources: consulted });
              answeredStructured = true;
              break;
            }
          }
          // Loop back: the model now sees the tool results and writes its answer.
        }

        send("done", {});
      } catch (e) {
        if (e instanceof StreamIdleTimeoutError) {
          // A stalled upstream stream — not an app bug. Tell the client the
          // response timed out rather than the generic error copy.
          logError(e, { route: "/api/ai/chat", method: "POST", userId: ctx.actorId, extra: { reason: "stream-idle-timeout" } });
          send("text", { delta: "\n\n_(The response timed out. Please try again.)_" });
        } else {
          logError(e, { route: "/api/ai/chat", method: "POST", userId: ctx.actorId });
          send("text", { delta: "\n\n_(Sorry — I hit an error. Try again in a moment.)_" });
        }
        send("done", {});
      } finally {
        // One structured timing line per request. iters/perIterMs expose the
        // LLM round-trip cost (the dominant latency); toolMs the DB cost.
        logTiming({
          route: "/api/ai/chat",
          method: "POST",
          userId: ctx.actorId,
          message: "chat-timing",
          extra: {
            orgId: ctx.orgId,
            // On a fast-path hit there are no LLM iterations; the pattern name
            // tells us which deterministic answer served it.
            fastPath: fastPathPattern,
            // How the request resolved: structured compose_answer, fast-path, or prose.
            answered: answeredStructured ? "structured" : fastPathPattern ? "fastpath" : "text",
            iters: totalIters,
            perIterMs,
            toolMs,
            ttftMs: ttftMs === null ? null : Math.round(ttftMs),
            totalMs: Math.round(performance.now() - reqStart),
          },
        });
        try { controller.close(); } catch { /* already closed by a disconnect */ }
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
