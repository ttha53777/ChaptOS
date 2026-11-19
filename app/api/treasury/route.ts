import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import type { TreasuryData } from "@/lib/api-types";
import { getTreasurySummary } from "@/lib/services/treasury-summary-service";


export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json((await getTreasurySummary(ctx)) satisfies TreasuryData);
  } catch (e) {
    logError(e, { route: "/api/treasury", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
