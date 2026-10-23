import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updateFundraiserInput } from "@/lib/validation/fundraiser";
import { deleteFundraiser, getFundraiser, updateFundraiser } from "@/lib/services/fundraiser-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

async function idOf(params: Params["params"]) {
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Invalid ID");
  return n;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await getFundraiser(ctx, await idOf(params)));
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    const id = await idOf(params);
    const body = await req.json().catch(() => ({}));
    return Response.json(await updateFundraiser(ctx, id, updateFundraiserInput.parse(body)));
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    await deleteFundraiser(ctx, await idOf(params));
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
