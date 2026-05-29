import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updateCalendarInput } from "@/lib/validation/calendar";
import { deleteCalendar, updateCalendar } from "@/lib/services/calendar-service";
import { logError } from "@/lib/observability";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = updateCalendarInput.parse(body);
    const event = await updateCalendar(ctx, numId, input);
    return Response.json(event);
  } catch (e) {
    logError(e, { route: "/api/calendar/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    await deleteCalendar(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/calendar/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
