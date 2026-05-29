import { NextRequest } from "next/server";
import { Prisma } from "../../../../generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

/**
 * POST /api/brothers/[id]/roles  body: { roleId: number }
 *
 * Assigns a role to a brother. Caller needs MANAGE_ROLES and must outrank the
 * role being granted (the role's `rank` must be strictly less than the
 * caller's max rank). Otherwise a Treasurer could grant the President role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requirePermission("MANAGE_ROLES");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  const { id } = await params;
  const brotherId = Number(id);
  if (!Number.isInteger(brotherId) || brotherId <= 0) {
    return Response.json({ error: "Invalid brother ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const roleId = Number(body.roleId);
  if (!Number.isInteger(roleId) || roleId <= 0) {
    return Response.json({ error: "Invalid roleId" }, { status: 400 });
  }

  try {
    const [brother, role] = await Promise.all([
      db(user.orgId).brother.findUnique({ where: { id: brotherId }, select: { id: true, name: true } }),
      db(user.orgId).role.findUnique({ where: { id: roleId }, select: { id: true, name: true, rank: true } }),
    ]);
    if (!brother) return Response.json({ error: "Brother not found" }, { status: 404 });
    if (!role)    return Response.json({ error: "Role not found" }, { status: 404 });

    if (role.rank >= user.maxRank) {
      return Response.json({ error: "Cannot grant a role at or above your own rank" }, { status: 403 });
    }

    await db(user.orgId).brotherRole.create({ data: { brotherId, roleId } });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} granted role "${role.name}" to ${brother.name}`,
      orgId: user.orgId,
    });

    return Response.json({ brotherId, roleId }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Brother already has that role" }, { status: 409 });
    }
    logError(e, { route: "/api/brothers/[id]/roles", method: "POST", userId: user.id });
    return Response.json({ error: "Failed to assign role" }, { status: 500 });
  }
}
