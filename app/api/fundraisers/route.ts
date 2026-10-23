import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createFundraiserInput } from "@/lib/validation/fundraiser";
import { createFundraiser, listFundraisers } from "@/lib/services/fundraiser-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listFundraisers(ctx));
  } catch (e) {
    logError(e, { route: "/api/fundraisers", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_FUNDRAISING" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createFundraiserInput.parse(body);
    return Response.json(await createFundraiser(ctx, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/fundraisers", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
