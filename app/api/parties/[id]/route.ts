import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updatePartyInput } from "@/lib/validation/party";
import { deleteParty, updateParty } from "@/lib/services/party-service";
import { logError } from "@/lib/observability";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = updatePartyInput.parse(body);
    return Response.json(await updateParty(ctx, numId, input));
  } catch (e) {
    logError(e, { route: "/api/parties/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_PARTIES" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    await deleteParty(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/parties/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
