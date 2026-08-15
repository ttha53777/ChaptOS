import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { updateEventFieldInput } from "@/lib/validation/event-fields";
import { deleteEventField, updateEventField } from "@/lib/services/event-field-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateEventFieldInput.parse(body);
    const field = await updateEventField(ctx, numId, input);
    return Response.json(field);
  } catch (e) {
    logError(e, { route: `/api/events/fields/${id}`, method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    await deleteEventField(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: `/api/events/fields/${id}`, method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
