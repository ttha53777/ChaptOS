import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { voidDuesChargeLine } from "@/lib/services/dues-charge-service";

// Take one person off a charge. 409 if they've already paid toward it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; brotherId: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const p = await params;
    const id = Number(p.id), brotherId = Number(p.brotherId);
    if (![id, brotherId].every(n => Number.isInteger(n) && n > 0)) throw new ValidationError("Invalid ID");
    await voidDuesChargeLine(ctx, id, brotherId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/dues/charges/[id]/lines/[brotherId]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
