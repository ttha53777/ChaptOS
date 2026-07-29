import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { listInviteRedemptions } from "@/lib/services/invite-service";
import { logError } from "@/lib/observability";

// Who actually joined through a given link — the drill-down behind the "N joins"
// count. Same MANAGE_SETTINGS gate as the rest of /api/invites: it names members
// and reveals who joined from outside the roster.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS", rateLimit: false });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    return Response.json(await listInviteRedemptions(ctx, numId));
  } catch (e) {
    logError(e, { route: "/api/invites/[id]/redemptions", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
