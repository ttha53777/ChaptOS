import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updateBrotherInput } from "@/lib/validation/brother";
import { deleteBrother, updateBrother } from "@/lib/services/brother-service";
import { logError } from "@/lib/observability";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return toResponse(new ValidationError("Invalid ID"));
  }

  // Allows the brother themself OR holders of MANAGE_BROTHERS through.
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS", selfId: numId });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateBrotherInput.parse(body);
    const brother = await updateBrother(ctx, numId, input);
    return Response.json(brother);
  } catch (e) {
    logError(e, { route: "/api/brothers/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    await deleteBrother(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/brothers/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
