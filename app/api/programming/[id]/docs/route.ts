import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { attachProgrammingDocInput } from "@/lib/validation/programming";
import { attachProgrammingDoc, listProgrammingEventDocs } from "@/lib/services/programming-service";
import { logError } from "@/lib/observability";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  const eventId = Number((await params).id);
  if (!Number.isFinite(eventId)) return Response.json({ error: "Invalid id" }, { status: 400 });
  try {
    return Response.json(await listProgrammingEventDocs(ctx, eventId));
  } catch (e) {
    logError(e, { route: "/api/programming/[id]/docs", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
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
    const input = attachProgrammingDocInput.parse(body);
    const doc = await attachProgrammingDoc(ctx, eventId, input);
    return Response.json(doc, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/programming/[id]/docs", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
