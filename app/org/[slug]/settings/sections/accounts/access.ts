import type { Permission } from "@/lib/permissions";
import { ALL_BITS, PERM_GROUPS, PERM_META, heldPermissions, permLabel } from "../roles/role-copy";

/** One row from GET /api/auth/accounts. */
export interface AccountRow {
  id: number;
  name: string;
  role: string;
  linked: boolean;
  isSelf: boolean;
  isAdmin: boolean;
  email: string | null;
  roles: { id: number; name: string; color: string | null; rank: number }[];
}

/** One row from GET /api/roles. `permissions` only comes back for MANAGE_ROLES
 *  holders (role-service withholds it from everyone else). */
export interface RoleInfo {
  id: number;
  name: string;
  color: string | null;
  rank: number;
  permissions?: number;
}

export type Tier = "admin" | "officer" | "member";

export const TIERS: { id: Tier; title: string; tint: string }[] = [
  { id: "admin",   title: "Admins",   tint: "var(--pp-lilac)" },
  { id: "officer", title: "Officers", tint: "var(--pp-butter)" },
  { id: "member",  title: "Members",  tint: "var(--pp-mint)" },
];

// Officers are people holding any role. A role can be a pure title with no
// permissions, but grouping by "has a role" reads the same for viewers who
// can't see permission bits as for those who can.
export const tierOf = (a: AccountRow): Tier => a.isAdmin ? "admin" : a.roles.length ? "officer" : "member";

/** Permissions a person holds here, or null when the viewer can't see role bits. */
export function permsOf(a: AccountRow, roles: Map<number, RoleInfo>): Permission[] | null {
  if (a.isAdmin) return heldPermissions(ALL_BITS);
  let bits = 0;
  for (const r of a.roles) {
    const p = roles.get(r.id)?.permissions;
    if (p === undefined) return null;
    bits |= p;
  }
  return heldPermissions(bits);
}

export const listJoin = (arr: string[]) =>
  arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;

export const canSentence = (perms: Permission[]) => listJoin(perms.map(p => PERM_META[p].can));

export { PERM_GROUPS, PERM_META, heldPermissions, permLabel };

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
