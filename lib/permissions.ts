/**
 * Discord-style per-resource permission flags. Stored as a 32-bit integer
 * bitfield on `Role.permissions`; a brother's effective bitfield is the
 * bitwise OR of every role they hold.
 *
 * Pure module — no DB, no env, safe to import from server OR client (the
 * client uses these names via ChapterContext to hide UI).
 *
 * `Brother.isAdmin = true` bypasses every check at the guard layer
 * (lib/auth/require-permission.ts); the helpers here only know about bits.
 */

export const PERMISSIONS = {
  MANAGE_BROTHERS:   1 << 0,
  MANAGE_TREASURY:   1 << 1,
  MANAGE_EVENTS:     1 << 2,
  MANAGE_PARTIES:    1 << 3,
  MANAGE_INSTAGRAM:  1 << 4,
  MANAGE_SERVICE:    1 << 5,
  MANAGE_ATTENDANCE: 1 << 6,
  MANAGE_SEMESTERS:  1 << 7,
  MANAGE_ROLES:      1 << 8,
  MANAGE_DOCS:          1 << 9,
  MANAGE_ANNOUNCEMENTS: 1 << 10,
  // Org settings: general config + invite links. Distinct from MANAGE_BROTHERS
  // (roster CRUD) so settings authority isn't bundled with roster editing.
  MANAGE_SETTINGS:      1 << 11,
  // Tasks & deadlines: create, assign (to members/roles), edit, and delete.
  // Assignees without this bit can still mark their own assigned tasks done
  // (enforced in task-service, not at the route guard).
  MANAGE_TASKS:         1 << 12,
  // Polls: create, assign (to members/roles), edit options, close/reopen, and
  // delete. Attached members without this bit can still cast/change their own
  // vote (enforced in poll-service, not at the route guard).
  MANAGE_POLLS:         1 << 13,
  // Fundraisers: plan one, keep its shopping list, wrap it up, reopen, delete.
  // Viewing needs nothing. Separate from MANAGE_TREASURY on purpose — a
  // philanthropy chair runs bake sales without touching the books.
  MANAGE_FUNDRAISING:   1 << 14,
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** Bitwise-OR every role's permission bits into a single effective bitfield. */
export function computePermissions(roles: ReadonlyArray<{ permissions: number }>): number {
  let bits = 0;
  for (const r of roles) bits |= r.permissions;
  return bits;
}

/** True when the bitfield includes the named permission. */
export function hasPermission(bits: number, perm: Permission): boolean {
  return (bits & PERMISSIONS[perm]) !== 0;
}

/**
 * The authority a permission check needs. Structural on purpose: `RequestContext`
 * satisfies it without this module importing `lib/context`, which would drag DB
 * and env code into a file the client imports.
 */
export interface PermissionActor {
  permissions: number;
  isOrgAdmin: boolean;
  isPlatformAdmin: boolean;
}

/**
 * Does this actor hold `perm`? Admins hold everything.
 *
 * The canonical form of the check that was previously re-declared in ~8 services
 * as `ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, …)`.
 * Prefer this for *soft* checks — deciding which fields to return, or whether to
 * do extra work. For hard 403s at the route boundary, keep using
 * `buildContext({ requirePerm })`, which is still the authoritative guard.
 */
export function can(actor: PermissionActor, perm: Permission): boolean {
  return actor.isPlatformAdmin || actor.isOrgAdmin || hasPermission(actor.permissions, perm);
}

/**
 * May an actor with this `maxRank` hand out a role of rank `roleRank`?
 *
 * Strictly below, never equal: a Treasurer must not be able to mint another
 * Treasurer, or the hierarchy is decorative. Shared between granting a role on
 * the roster (role-service.grantRole) and granting one while approving a join
 * request (join-request-service.approveJoinRequest), which are two doors onto
 * the same authority and must not disagree.
 *
 * A predicate rather than an assert so this module keeps its no-imports posture
 * (see PermissionActor above) — callers throw their own ForbiddenError.
 */
export function canGrantRank(maxRank: number, roleRank: number): boolean {
  return roleRank < maxRank;
}

/** Convenience: the OR of every flag — used by the seeded "President" role. */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((a, b) => a | b, 0);

/**
 * Every bit that existing full-access roles have already been given. Adding a
 * flag to PERMISSIONS does NOT reach existing orgs' President-style roles on its
 * own — `Role.permissions` is stored, and nothing rewrites it at runtime (a boot
 * sweep used to, and it reverted chapters' own role edits on every deploy). So a
 * new bit ships with a one-time migration that grants it to roles already holding
 * every bit in this mask:
 *
 *   UPDATE "Role" SET permissions = permissions | <newBit>
 *   WHERE permissions & <GRANTED_ALL_PERMISSIONS> = <GRANTED_ALL_PERMISSIONS>;
 *
 * then bump this constant to ALL_PERMISSIONS. tests/permissions pins the two
 * equal so the migration can't be forgotten.
 */
export const GRANTED_ALL_PERMISSIONS = 0x7fff;

/** Human-readable name → bit, in declared order. Used by the Roles UI. */
export const PERMISSION_LIST: ReadonlyArray<{ name: Permission; bit: number }> =
  Object.entries(PERMISSIONS).map(([name, bit]) => ({ name: name as Permission, bit }));
