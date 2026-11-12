import { ApiError } from "../../../../../lib/api";
import { PERMISSION_LIST } from "@/lib/permissions";
import { heldPermissions, permLabel, type RoleRow } from "./role-copy";

/** A roster row as the Roles page needs it (from GET /api/auth/accounts). */
export interface Person {
  id: number;
  name: string;
  avatarUrl: string | null;
  isSelf: boolean;
  isAdmin: boolean;
}

/** One BrotherRole pair. The page keeps them as a Set of these keys. */
export const pairKey = (roleId: number, personId: number) => `${roleId}:${personId}`;

export const NEUTRAL_ROLE_COLOR = "#94A3B8";
export const roleColor = (r: Pick<RoleRow, "color">) => r.color ?? NEUTRAL_ROLE_COLOR;

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The pages a role opens, as short tags: at most four, then "+N". */
export function permTags(bits: number): string[] {
  const names = heldPermissions(bits).map(permLabel);
  if (names.length === 0) return ["No extra access"];
  if (names.length === PERMISSION_LIST.length) return ["Everything"];
  return names.length > 4 ? [...names.slice(0, 4), `+${names.length - 4}`] : names;
}

/** The server's own sentence when it sent one ("Cannot grant a role at or above…"). */
export function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const msg = (err.body as { error?: unknown } | null)?.error;
    if (typeof msg === "string" && msg) return msg;
  }
  return fallback;
}
