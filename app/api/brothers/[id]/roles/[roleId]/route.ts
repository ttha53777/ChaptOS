import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { revokeRole } from "@/lib/services/role-service";
import { logError } from "@/lib/observability";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ROLES" });
  if (error) return error;
  try {
    const { id, roleId: roleIdStr } = await params;
    const brotherId = Number(id);
    const roleId = Number(roleIdStr);
    if (!Number.isInteger(brotherId) || brotherId <= 0 || !Number.isInteger(roleId) || roleId <= 0) {
      throw new ValidationError("Invalid IDs");
    }
    await revokeRole(ctx, brotherId, roleId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/brothers/[id]/roles/[roleId]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
