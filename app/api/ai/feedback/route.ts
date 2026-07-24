import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { assistantFeedbackInput } from "@/lib/validation/ai";
import { recordAssistantFeedback } from "@/lib/services/assistant-feedback-service";
import { logError } from "@/lib/observability";

// Helpful? thumbs on an Ask Chapt answer. Any active member; telemetry only —
// it writes an OperationalEvent and never touches the activity feed.

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = assistantFeedbackInput.parse(body);
    await recordAssistantFeedback(ctx, input);
    return Response.json({ ok: true });
  } catch (e) {
    logError(e, { route: "/api/ai/feedback", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
