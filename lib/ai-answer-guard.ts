/**
 * Ask Chapt must always end a turn with something the user can read. Two ways a
 * turn used to end silently — the ledger ticked, then nothing:
 *
 *   1. The tool loop ran out of rounds while still reading (a long file read
 *      page by page), so the loop simply stopped.
 *   2. A reply was cut off by the output-token cap. A cut-off compose_answer is
 *      a half-written tool call nobody can render, so it was dropped.
 *
 * The guard: the last round must answer (compose_answer is forced); a turn
 * that produced nothing visible gets one more forced round with more room and
 * a note to keep it short; and if even that fails, the user gets a sentence
 * saying so rather than an empty bubble. Shared by the chat route and the eval
 * harness so the eval measures what production does. Pure.
 */
import { MAX_COMPLETION_TOKENS } from "@/lib/ai";
import { ANSWER_TOOL } from "@/lib/ai-tools";

/** Rounds of tool calls one request may take (room for broaden-and-retry and chained reads). */
export const MAX_ITERS = 10;

/** A forced answer gets twice the usual room: it has no further turn to finish in. */
const FORCED_COMPLETION_TOKENS = MAX_COMPLETION_TOKENS * 2;

/** Request options for one round: `mustAnswer` forces compose_answer. */
export function roundOptions(mustAnswer: boolean): {
  tool_choice: "auto" | { type: "function"; function: { name: string } };
  max_completion_tokens: number;
} {
  return mustAnswer
    ? { tool_choice: { type: "function", function: { name: ANSWER_TOOL } }, max_completion_tokens: FORCED_COMPLETION_TOKENS }
    : { tool_choice: "auto", max_completion_tokens: MAX_COMPLETION_TOKENS };
}

/** The last regular round: no more reading, answer from what's in hand. */
export const LAST_ROUND_NOTE =
  "This is your last step: no more tools. Answer now with compose_answer from what you've already read, and say in the verdict which parts you didn't get to.";

/** After a round that produced nothing visible (cut off, or empty). */
export const CUT_OFF_NOTE =
  "Your previous reply was cut off before it finished, so the user saw nothing. Answer now with compose_answer from what you've already read: at most 6 rows, short cells. " +
  "If there's more than fits, say so in the verdict and suggest a narrower question.";

/** Appended when a prose reply was cut off mid-sentence: the user saw part of it. */
export const CUT_SHORT_TEXT = "\n\n_(That answer was cut short. Ask about a narrower part to see the rest.)_";

/** The last resort: never an empty bubble. */
export const NO_ANSWER_TEXT =
  "I looked through what I could but couldn't put an answer together that time. Try asking about a narrower part, for example one section, page or sheet.";

/**
 * Whether a finished round is a tool round to execute. A forced tool call ends
 * with finish_reason "stop", not "tool_calls", so the calls themselves decide;
 * a round cut off by the length cap may carry half-written calls, so it isn't.
 */
export function isToolRound(finishReason: string | null, toolCallCount: number): boolean {
  return toolCallCount > 0 && finishReason !== "length";
}
