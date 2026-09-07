import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { selfCheckIn, undoSelfCheckIn } from "@/lib/services/attendance-service";
import { logError } from "@/lib/observability";

// The acting member marks themself present / undoes it. No requirePerm and no
// request body: brotherId is taken from ctx.actorId, never the client, so a
// member can only ever check themself in. The service enforces that the window
// is open and that they don't already hold an approved excuse. Officers
// recording the whole room still use POST /api/attendance.

function eventIdFrom(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid eventId");
  return id;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const { eventId } = await params;
    return Response.json(await selfCheckIn(ctx, eventIdFrom(eventId)), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/attendance/[eventId]/check-in", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const { eventId } = await params;
    return Response.json(await undoSelfCheckIn(ctx, eventIdFrom(eventId)));
  } catch (e) {
    logError(e, { route: "/api/attendance/[eventId]/check-in", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
