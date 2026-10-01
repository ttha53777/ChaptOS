import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { getMemberProfile } from "@/lib/services/brother-service";
import { logError } from "@/lib/observability";

// Email + join date for the member card. Any member of the org may read it —
// the same audience /api/auth/accounts already serves emails to.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { id } = await params;
    const brotherId = Number(id);
    if (!Number.isInteger(brotherId) || brotherId <= 0) throw new ValidationError("Invalid brother ID");
    return Response.json(await getMemberProfile(ctx, brotherId));
  } catch (e) {
    logError(e, { route: "/api/brothers/[id]/profile", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
