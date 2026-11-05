import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listParticipationForOrg } from "@/lib/services/service-participation-service";
import { logError } from "@/lib/observability";

// GET: every event's participation in one list. Read-only — any member of the org may view.
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listParticipationForOrg(ctx)); }
  catch (e) {
    logError(e, { route: "/api/service-participation", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
