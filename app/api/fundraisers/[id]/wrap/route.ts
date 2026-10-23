import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { wrapFundraiserInput } from "@/lib/validation/fundraiser";
import { reopenFundraiser, wrapUpFundraiser } from "@/lib/services/fundraiser-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

async function idOf(params: Params["params"]) {
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Invalid ID");
  return n;
}

// POST wraps up with the total that came in; DELETE reopens.
export async function POST(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    const id = await idOf(params);
    const body = await req.json().catch(() => ({}));
    return Response.json(await wrapUpFundraiser(ctx, id, wrapFundraiserInput.parse(body)));
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]/wrap", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    return Response.json(await reopenFundraiser(ctx, await idOf(params)));
  } catch (e) {
    logError(e, { route: "/api/fundraisers/[id]/wrap", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
