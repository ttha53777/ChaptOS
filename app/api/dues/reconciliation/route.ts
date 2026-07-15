import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { attributeDuesPayment, getDuesReconciliation } from "@/lib/services/dues-service";
import { logError } from "@/lib/observability";
import { attributeDuesPaymentInput } from "@/lib/validation/dues";

// Roster-owed vs ledger-collected, side by side. The view whose absence let the two
// books contradict each other in silence.
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const reconciliation = await getDuesReconciliation(ctx);
    return Response.json(reconciliation);
  } catch (e) {
    logError(e, { route: "/api/dues/reconciliation", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// Attach a pre-migration dues row to the member who actually paid it. Attribution
// only — it must not move any balance (adjustDues is for that).
export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const body  = await req.json().catch(() => ({}));
    const input = attributeDuesPaymentInput.parse(body);
    await attributeDuesPayment(ctx, input);
    const reconciliation = await getDuesReconciliation(ctx);
    return Response.json(reconciliation);
  } catch (e) {
    logError(e, { route: "/api/dues/reconciliation", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
