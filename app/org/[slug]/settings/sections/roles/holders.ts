import { ApiError } from "../../../../../lib/api";

// The pure helpers live in lib/settings/roles (shared with the native app).
export { NEUTRAL_ROLE_COLOR, firstName, pairKey, permTags, roleColor } from "@/lib/settings/roles";

/** A roster row as the Roles page needs it (from GET /api/auth/accounts). */
export interface Person {
  id: number;
  name: string;
  avatarUrl: string | null;
  isSelf: boolean;
  isAdmin: boolean;
}

/** The server's own sentence when it sent one ("Cannot grant a role at or above…"). */
export function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const msg = (err.body as { error?: unknown } | null)?.error;
    if (typeof msg === "string" && msg) return msg;
  }
  return fallback;
}
