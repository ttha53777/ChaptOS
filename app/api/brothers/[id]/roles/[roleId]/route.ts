import { NextRequest } from "next/server";
import { Prisma } from "../../../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

/**
 * DELETE /api/brothers/[id]/roles/[roleId]
 *
 * Revoke a role from a brother. Caller needs MANAGE_ROLES and must outrank
 * the role being revoked (same hierarchy rule as granting).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  const { user, error } = await requirePermission("MANAGE_ROLES");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  const { id, roleId: roleIdStr } = await params;
  const brotherId = Number(id);
  const roleId = Number(roleIdStr);
  if (!Number.isInteger(brotherId) || brotherId <= 0 || !Number.isInteger(roleId) || roleId <= 0) {
    return Response.json({ error: "Invalid IDs" }, { status: 400 });
  }

  try {
    const [brother, role] = await Promise.all([
      prisma.brother.findUnique({ where: { id: brotherId }, select: { id: true, name: true } }),
      prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, rank: true } }),
    ]);
    if (!brother) return Response.json({ error: "Brother not found" }, { status: 404 });
    if (!role)    return Response.json({ error: "Role not found" }, { status: 404 });
    if (role.rank >= user.maxRank) {
      return Response.json({ error: "Cannot revoke a role at or above your own rank" }, { status: 403 });
    }

    await prisma.brotherRole.delete({
      where: { brotherId_roleId: { brotherId, roleId } },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} revoked role "${role.name}" from ${brother.name}`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Brother does not have that role" }, { status: 404 });
    }
    logError(e, { route: "/api/brothers/[id]/roles/[roleId]", method: "DELETE", userId: user.id });
    return Response.json({ error: "Failed to revoke role" }, { status: 500 });
  }
}
