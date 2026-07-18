import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { updateEventTypeInput } from "@/lib/validation/event-types";
import { deleteEventType, updateEventType } from "@/lib/services/calendar-event-type-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateEventTypeInput.parse(body);
    const type = await updateEventType(ctx, numId, input);
    return Response.json(type);
  } catch (e) {
    logError(e, { route: `/api/calendar/event-types/${id}`, method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    await deleteEventType(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: `/api/calendar/event-types/${id}`, method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
