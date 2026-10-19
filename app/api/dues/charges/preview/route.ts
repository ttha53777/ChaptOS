import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { previewDuesCharge } from "@/lib/services/dues-charge-service";
import { issueDuesChargeInput } from "@/lib/validation/dues";

// The "Hand out dues" receipt, resolved by the same code that writes the charge.
// Writes nothing; called as the sheet changes, so it isn't rate-limited like a write.
export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY", rateLimit: false });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = issueDuesChargeInput.parse(body);
    return Response.json(await previewDuesCharge(ctx, input));
  } catch (e) {
    logError(e, { route: "/api/dues/charges/preview", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
