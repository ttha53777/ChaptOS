import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updateChecklistItemInput } from "@/lib/validation/programming";
import { deleteChecklistItem, updateChecklistItem } from "@/lib/services/programming-service";
import { logError } from "@/lib/observability";

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

function ids(p: { id: string; itemId: string }) {
  const eventId = Number(p.id);
  const itemId = Number(p.itemId);
  if (!Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
    throw new ValidationError("Invalid ID");
  }
  return { eventId, itemId };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const { eventId, itemId } = ids(await params);
    const body = await req.json().catch(() => ({}));
    const input = updateChecklistItemInput.parse(body);
    return Response.json(await updateChecklistItem(ctx, eventId, itemId, input));
  } catch (e) {
    logError(e, { route: "/api/programming/[id]/checklist/[itemId]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const { eventId, itemId } = ids(await params);
    await deleteChecklistItem(ctx, eventId, itemId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/programming/[id]/checklist/[itemId]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
