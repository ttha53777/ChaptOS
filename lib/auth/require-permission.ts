import { requireUser } from "./require-user";
import { prisma } from "@/lib/prisma";
import { type Permission, computePermissions, hasPermission } from "@/lib/permissions";

type AuthedUser = NonNullable<Awaited<ReturnType<typeof requireUser>>>;

/**
 * The user returned by requirePermission. Carries the effective permission
 * bitfield (union of all assigned roles' permissions) and the highest rank
 * the caller holds — both useful for downstream checks in the same request
 * without re-querying.
 */
export interface PermittedUser extends AuthedUser {
  permissions: number;
  maxRank: number;
}

type RequireResult =
  | { user: PermittedUser; error?: undefined }
  | { user?: undefined; error: Response };

/**
 * Returns { user } when the caller is authenticated AND either has the named
 * permission OR is a platform admin (isPlatformAdmin = true). Returns
 * { error: Response } with the appropriate 401/403 the route should return verbatim.
 *
 *   const { user, error } = await requirePermission("MANAGE_TREASURY");
 *   if (error) return error;
 *
 * Platform admins bypass the bitfield check entirely and are reported with
 * permissions = ALL_PERMISSIONS, maxRank = +Infinity. This is the safety hatch:
 * as long as one platform admin exists, the role system can never lock the
 * chapter out of its own settings.
 */
export async function requirePermission(perm: Permission): Promise<RequireResult> {
  const user = await requireUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  // Platform-admin bypass: no DB hit for roles, no bitfield check.
  if (user.isPlatformAdmin) {
    return {
      user: { ...user, permissions: ~0 >>> 0, maxRank: Number.POSITIVE_INFINITY },
    };
  }

  // Non-admin: resolve roles and check the bit. One query, one join. If the
  // BrotherRole table doesn't exist yet (pre-migration), treat the caller as
  // having no roles — they'll be denied below, which is the safe default.
  let flatRoles: { permissions: number; rank: number }[] = [];
  try {
    const rows = await prisma.brotherRole.findMany({
      where: { brotherId: user.id },
      select: { role: { select: { permissions: true, rank: true } } },
    });
    flatRoles = rows.map(r => r.role);
  } catch (e) {
    console.warn("requirePermission: BrotherRole lookup failed (run prisma migrate?):", (e as Error).message);
  }
  const permissions = computePermissions(flatRoles);
  const maxRank = flatRoles.reduce((m, r) => Math.max(m, r.rank), 0);

  if (!hasPermission(permissions, perm)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user: { ...user, permissions, maxRank } };
}

/**
 * Like requirePermission but ALSO allows the caller when they are the brother
 * whose id matches `selfBrotherId`. Use for routes where a member is allowed
 * to act on their own record (e.g. PATCH /api/brothers/[id] for profile edits).
 *
 * The returned `permissions` bitfield is still the caller's actual permissions
 * — self-access doesn't grant the permission, it just lets the request through.
 */
export async function requirePermissionOrSelf(
  perm: Permission,
  selfBrotherId: number,
): Promise<RequireResult> {
  const user = await requireUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };

  if (user.isPlatformAdmin) {
    return { user: { ...user, permissions: ~0 >>> 0, maxRank: Number.POSITIVE_INFINITY } };
  }

  let flatRoles: { permissions: number; rank: number }[] = [];
  try {
    const rows = await prisma.brotherRole.findMany({
      where: { brotherId: user.id },
      select: { role: { select: { permissions: true, rank: true } } },
    });
    flatRoles = rows.map(r => r.role);
  } catch (e) {
    console.warn("requirePermissionOrSelf: BrotherRole lookup failed (run prisma migrate?):", (e as Error).message);
  }
  const permissions = computePermissions(flatRoles);
  const maxRank = flatRoles.reduce((m, r) => Math.max(m, r.rank), 0);

  if (user.id === selfBrotherId || hasPermission(permissions, perm)) {
    return { user: { ...user, permissions, maxRank } };
  }
  return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
}

/**
 * Resolve a brother's permissions + max rank without a permission check —
 * used by /api/auth/me to populate the client's ChapterContext, and by the
 * role-management routes to enforce hierarchy.
 */
export async function resolvePermissions(user: AuthedUser): Promise<{ permissions: number; maxRank: number; roles: { id: number; name: string; color: string | null; rank: number; permissions: number }[] }> {
  let rows: { role: { id: number; name: string; color: string | null; rank: number; permissions: number } }[] = [];
  try {
    rows = await prisma.brotherRole.findMany({
      where: { brotherId: user.id },
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
