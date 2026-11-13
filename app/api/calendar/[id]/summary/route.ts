import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { notesId } from "@/lib/validation/meeting-notes";
import { getMeetingSummary } from "@/lib/services/meeting-summary-service";
import { logError } from "@/lib/observability";

// GET /api/calendar/[id]/summary — the published summary and action items of a
// meeting, for any member. The minutes themselves stay behind MANAGE_EVENTS on
// GET /api/calendar/[id]/notes.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const id = notesId.parse((await params).id);
    return Response.json(await getMeetingSummary(ctx, id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logError(e, { route: "/api/calendar/[id]/summary", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
