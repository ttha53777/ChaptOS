/**
 * Helpful? feedback on Ask Chapt answers. Pure telemetry: one OperationalEvent
 * per rating (feed-silent via { activity: false }), no dedicated table — the
 * event stream is queryable enough for "what % of answers were helpful" and
 * "which questions get thumbed down", which is all this needs to answer.
 */

import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import type { AssistantFeedbackInput } from "@/lib/validation/ai";

export async function recordAssistantFeedback(ctx: RequestContext, input: AssistantFeedbackInput): Promise<void> {
  // No subject row exists for a chat answer — anchor on the org itself.
  await emit(ctx, "assistant.feedback", { type: "Organization", id: ctx.orgId }, {
    helpful: input.helpful,
    question: input.question,
    answerKind: input.answerKind,
  }, { activity: false });
}
