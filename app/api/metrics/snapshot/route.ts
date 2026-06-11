import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { getMetricSnapshot } from "@/lib/services/metric-value-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await getMetricSnapshot(ctx));
  } catch (e) {
    logError(e, { route: "/api/metrics/snapshot", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
