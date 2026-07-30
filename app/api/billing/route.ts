import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { getBillingSummary } from "@/lib/services/billing-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true, rateLimit: false });
  if (error) return error;
  try {
    const summary = await getBillingSummary(ctx);
    return Response.json(summary);
  } catch (e) {
    logError(e, { route: "/api/billing", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
