import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listPendingRequests } from "@/lib/services/join-request-service";
import { logError } from "@/lib/observability";

// The review queue. Gated on MANAGE_BROTHERS rather than MANAGE_SETTINGS
// (which creates the links): approving one writes a roster row, so it takes
// roster authority. The two bits are deliberately separate — see lib/permissions.ts.

export async function GET() {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS", rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listPendingRequests(ctx));
  } catch (e) {
    logError(e, { route: "/api/join-requests", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
