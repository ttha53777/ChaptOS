import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { issueDuesCharge } from "@/lib/services/dues-charge-service";
import { issueDuesChargeInput } from "@/lib/validation/dues";

// Hand out dues: one charge, a line per person billed, every balance raised in
// the same transaction. Writes no ledger row — money lands when they pay.
export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = issueDuesChargeInput.parse(body);
    return Response.json(await issueDuesCharge(ctx, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/dues/charges", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
