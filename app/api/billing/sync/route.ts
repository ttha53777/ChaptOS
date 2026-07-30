import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { syncSeats } from "@/lib/services/billing-service";
import { logError } from "@/lib/observability";

/**
 * Force a seat reconcile.
 *
 * One of three paths that clear an owed push (the others being the billing page
 * load and the invoice.upcoming webhook). Exists because there is no cron in
 * this app, and because support needs a button when a headcount looks wrong.
 */
export async function POST() {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    const result = await syncSeats(ctx);
    return Response.json(result);
  } catch (e) {
    logError(e, { route: "/api/billing/sync", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
