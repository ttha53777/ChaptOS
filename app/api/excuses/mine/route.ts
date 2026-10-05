import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listMyExcuses } from "@/lib/services/excuse-service";
import { logError } from "@/lib/observability";

// The signed-in member's own excuses this semester — no permission beyond
// membership, because the service pins the read to ctx.actorId.
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listMyExcuses(ctx));
  } catch (e) {
    logError(e, { route: "/api/excuses/mine", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
