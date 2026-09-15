import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listPendingRequests, listPendingRequestPage } from "@/lib/services/join-request-service";
import { joinRequestPageInput } from "@/lib/validation/join-request";
import { logError } from "@/lib/observability";

// The review queue. Gated on MANAGE_BROTHERS rather than MANAGE_SETTINGS
// (which creates the links): approving one writes a roster row, so it takes
// roster authority. The two bits are deliberately separate — see lib/permissions.ts.

export async function GET(req: Request) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS", rateLimit: false });
  if (error) return error;
  try {
    const query = new URL(req.url).searchParams;
    // Keep the original array contract for existing clients while the queue
    // opts into bounded pages explicitly.
    return Response.json(query.get("page") === "1"
      ? await listPendingRequestPage(ctx, joinRequestPageInput.parse(Object.fromEntries(query)))
      : await listPendingRequests(ctx));
  } catch (e) {
    logError(e, { route: "/api/join-requests", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
