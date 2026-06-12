import { requireUser } from "./require-user";
import { computePermissions } from "@/lib/permissions";

type AuthedUser = NonNullable<Awaited<ReturnType<typeof requireUser>>>;

/**
 * Resolve a brother's permissions + max rank without a permission check —
 * used by /api/auth/me to populate the client's ChapterContext, and by the
 * role-management routes to enforce hierarchy.
 *
 * No I/O: requireUser() already loaded every role assignment in its Brother
 * query (roleRows); this just filters to the active org. Kept async so callers'
 * await sites stay valid.
 */
export async function resolvePermissions(user: AuthedUser): Promise<{ permissions: number; maxRank: number; roles: { id: number; name: string; color: string | null; rank: number; permissions: number }[] }> {
  const roles = user.roleRows
    .filter(r => r.organizationId === user.orgId)
    .map(({ organizationId: _orgId, ...role }) => role);

  if (user.isPlatformAdmin) {
    return {
      permissions: ~0 >>> 0,
      maxRank: Number.POSITIVE_INFINITY,
      roles,
    };
  }
  return {
    permissions: computePermissions(roles),
    maxRank: roles.reduce((m, r) => Math.max(m, r.rank), 0),
    roles,
  };
}
