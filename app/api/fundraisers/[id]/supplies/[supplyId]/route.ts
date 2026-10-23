import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updateSupplyInput } from "@/lib/validation/fundraiser";
import { removeSupply, updateSupply } from "@/lib/services/fundraiser-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string; supplyId: string }> };

async function idsOf(params: Params["params"]) {
  const p = await params;
  const id = Number(p.id), supplyId = Number(p.supplyId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(supplyId) || supplyId <= 0) throw new ValidationError("Invalid ID");
  return { id, supplyId };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    const { id, supplyId } = await idsOf(params);
    const body = await req.json().catch(() => ({}));
    return Response.json(await updateSupply(ctx, id, supplyId, updateSupplyInput.parse(body)));
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]/supplies/[supplyId]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    const { id, supplyId } = await idsOf(params);
    return Response.json(await removeSupply(ctx, id, supplyId));
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]/supplies/[supplyId]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
