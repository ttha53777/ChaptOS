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

/** Convenience: the OR of every flag — used by the seeded "President" role. */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((a, b) => a | b, 0);

/** Human-readable name → bit, in declared order. Used by the Roles UI. */
export const PERMISSION_LIST: ReadonlyArray<{ name: Permission; bit: number }> =
  Object.entries(PERMISSIONS).map(([name, bit]) => ({ name: name as Permission, bit }));
