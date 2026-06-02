import { requireUser } from "./require-user";
import { prisma } from "@/lib/prisma";
import { computePermissions } from "@/lib/permissions";

type AuthedUser = NonNullable<Awaited<ReturnType<typeof requireUser>>>;

/**
 * Resolve a brother's permissions + max rank without a permission check —
 * used by /api/auth/me to populate the client's ChapterContext, and by the
 * role-management routes to enforce hierarchy.
 */
export async function resolvePermissions(user: AuthedUser): Promise<{ permissions: number; maxRank: number; roles: { id: number; name: string; color: string | null; rank: number; permissions: number }[] }> {
  let rows: { role: { id: number; name: string; color: string | null; rank: number; permissions: number } }[] = [];
  try {
    rows = await prisma.brotherRole.findMany({
      where: { brotherId: user.id, role: { organizationId: user.orgId } },
      select: { role: { select: { id: true, name: true, color: true, rank: true, permissions: true } } },
    });
  } catch (e) {
    console.warn("resolvePermissions: BrotherRole lookup failed (run prisma migrate?):", (e as Error).message);
  }

  if (user.isPlatformAdmin) {
    return {
      permissions: ~0 >>> 0,
      maxRank: Number.POSITIVE_INFINITY,
      roles: rows.map(r => r.role),
    };
  }
  const roles = rows.map(r => r.role);
  return {
    permissions: computePermissions(roles),
    maxRank: roles.reduce((m, r) => Math.max(m, r.rank), 0),
    roles,
  };
}
