import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { pendingExcuseCountsByBrother } from "@/lib/services/excuse-service";
import { logError } from "@/lib/observability";

// Pending-excuse counts keyed by brotherId, for the /brothers roster review chip.
// MANAGE_ATTENDANCE only — members never see the chip.
export async function GET(_req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE", rateLimit: false });
  if (error) return error;
  try {
    const counts = await pendingExcuseCountsByBrother(ctx);
    return Response.json(counts);
  } catch (e) {
    logError(e, { route: "/api/excuses/pending-counts", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
