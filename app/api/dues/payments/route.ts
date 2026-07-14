import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listDuesPayments, submitDuesPayment } from "@/lib/services/dues-service";
import { logError } from "@/lib/observability";
import { submitDuesPaymentInput } from "@/lib/validation/dues";

// Bare buildContext: the authz decision lives in the service (assertCanApproveDuesPayments).
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listDuesPayments(ctx));
  } catch (e) {
    logError(e, { route: "/api/dues/payments", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// Submitting only stages the request — see submitDuesPayment. Nothing posts to the
// ledger or moves duesOwed until a treasurer approves it via PATCH /api/dues/payments/[id].
export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body  = await req.json().catch(() => ({}));
    const input = submitDuesPaymentInput.parse(body);
    const result = await submitDuesPayment(ctx, input);
    return Response.json(result, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/dues/payments", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
