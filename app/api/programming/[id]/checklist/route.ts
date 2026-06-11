import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createChecklistItemInput } from "@/lib/validation/programming";
import { addChecklistItem, listChecklist } from "@/lib/services/programming-service";
import { logError } from "@/lib/observability";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  const eventId = Number((await params).id);
  if (!Number.isFinite(eventId)) return Response.json({ error: "Invalid id" }, { status: 400 });
  try {
    return Response.json(await listChecklist(ctx, eventId));
  } catch (e) {
    logError(e, { route: "/api/programming/[id]/checklist", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  const eventId = Number((await params).id);
  if (!Number.isFinite(eventId)) return Response.json({ error: "Invalid id" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    const input = createChecklistItemInput.parse(body);
    return Response.json(await addChecklistItem(ctx, eventId, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/programming/[id]/checklist", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
