import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { previewDeleteCalendar } from "@/lib/services/calendar-service";
import { logError } from "@/lib/observability";

// Same gate as DELETE /api/calendar/[id]: the slip asks this when it opens, so a 401
// or 403 here is the delete's own answer, given before anything is struck out.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const numId = Number((await params).id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    return Response.json(await previewDeleteCalendar(ctx, numId));
  } catch (e) {
    logError(e, { route: "/api/calendar/[id]/delete-preview", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
