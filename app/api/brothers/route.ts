import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listVisibleBrothers } from "@/lib/services/brother-service";
import { hydrateBrotherAvatars, publicBrother } from "@/lib/brother-avatar";
import { logError } from "@/lib/observability";

// Read-only. There is no POST: officers can no longer type a person onto the
// roster. A roster spot is created by approving a JoinRequest
// (POST /api/join-requests/[id]/approve), which is the only path that makes one.

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const brothers = await listVisibleBrothers(ctx);
    const hydrated = await hydrateBrotherAvatars(brothers);
    return Response.json(hydrated.map(publicBrother));
  } catch (e) {
    logError(e, { route: "/api/brothers", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
