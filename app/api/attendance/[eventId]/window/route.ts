import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { checkInWindowInput } from "@/lib/validation/attendance";
import { closeCheckIn, openCheckIn, reopenCheckIn } from "@/lib/services/attendance-service";
import { logError } from "@/lib/observability";

// Officer control of the live check-in window: open it from the room, close it
// when the meeting starts, or reopen one closed by mistake. Closing is the write
// that turns everyone who never checked in into a recorded absence, so this is
// gated on MANAGE_ATTENDANCE — the same permission as recording attendance.
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE" });
  if (error) return error;
  try {
    const { eventId } = await params;
    const id = Number(eventId);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid eventId");
    const body = await req.json().catch(() => ({}));
    const { action } = checkInWindowInput.parse(body);

    const run = action === "open" ? openCheckIn : action === "close" ? closeCheckIn : reopenCheckIn;
    return Response.json(await run(ctx, id));
  } catch (e) {
    logError(e, { route: "/api/attendance/[eventId]/window", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
