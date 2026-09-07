import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { getLiveRoster } from "@/lib/services/attendance-service";
import { logError } from "@/lib/observability";

// GET: who is here and who is not — the roster behind the live band's tally.
//
// Split from /api/attendance/live on purpose. That route is polled on an
// interval by every open dashboard; this one is fetched only when a member
// opens the "Who's here" sheet, so the names don't ride along on every poll.
//
// No requirePerm: the count is already on every member's dashboard, and this
// returns only names and presence — nothing an officer-only column would show.
//
// rateLimit: false for the same reason /api/attendance/live sets it — a room
// full of members opening the sheet at once would otherwise trip the limiter.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { eventId } = await params;
    const id = Number(eventId);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid eventId");
    return Response.json(await getLiveRoster(ctx, id));
  } catch (e) {
    logError(e, { route: "/api/attendance/[eventId]/roster", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
