import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createAgendaTemplateInput } from "@/lib/validation/agenda-template";
import { createAgendaTemplate, listAgendaTemplates } from "@/lib/services/agenda-template-service";
import { logError } from "@/lib/observability";

// Gated on read too: the drawer is for whoever schedules meetings.
export async function GET() {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS", rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listAgendaTemplates(ctx));
  } catch (e) {
    logError(e, { route: "/api/calendar/agenda-templates", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createAgendaTemplateInput.parse(body);
    return Response.json(await createAgendaTemplate(ctx, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/calendar/agenda-templates", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
