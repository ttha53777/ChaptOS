import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { detachProgrammingDoc } from "@/lib/services/programming-service";
import { logError } from "@/lib/observability";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  const { id, docId } = await params;
  const eventId = Number(id);
  const docIdNum = Number(docId);
  if (!Number.isFinite(eventId) || !Number.isFinite(docIdNum)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    await detachProgrammingDoc(ctx, eventId, docIdNum);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/programming/[id]/docs/[docId]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
