import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { agendaTemplateId, updateAgendaTemplateInput } from "@/lib/validation/agenda-template";
import { archiveAgendaTemplate, updateAgendaTemplate } from "@/lib/services/agenda-template-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateAgendaTemplateInput.parse(body);
    return Response.json(await updateAgendaTemplate(ctx, agendaTemplateId.parse(id), input));
  } catch (e) {
    logError(e, { route: `/api/calendar/agenda-templates/${id}`, method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// Archives rather than erases; PATCH { archived: false } is the Undo.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  const { id } = await params;
  try {
    return Response.json(await archiveAgendaTemplate(ctx, agendaTemplateId.parse(id)));
  } catch (e) {
    logError(e, { route: `/api/calendar/agenda-templates/${id}`, method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
