import { parseAvatarFromMetadata } from "@/lib/avatar";
import { logError } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type BrotherRow = {
  id: number;
  authUserId: string | null;
  avatarUrl: string | null;
};

/** Persist avatar URL on the linked brother row (best-effort). */
export async function syncBrotherAvatar(authUserId: string, avatarUrl: string | null) {
  try {
    // Account-level identity keyed by authUserId (one avatar per Google account,
    // cross-org by design), not org-scoped domain data. No org context here, only
    // authUserId, so ctx.db doesn't apply — same rationale as the auth bootstrap.
    await prisma.brother.updateMany({ where: { authUserId }, data: { avatarUrl } }); // lint-direct-prisma:ignore
  } catch (e) {
    // Best-effort avatar cache write; never fail the caller. Route through the
    // structured pipeline instead of a bare console.error.
    logError(e, { route: "lib/brother-avatar", extra: { fn: "syncBrotherAvatar" } });
  }
}

/** Fill missing avatarUrl from Supabase auth metadata and cache on Brother. */
export async function hydrateBrotherAvatars<T extends BrotherRow>(brothers: T[]): Promise<T[]> {
  const admin = getSupabaseAdmin();
  const needsLookup = brothers.filter(b => !b.avatarUrl && b.authUserId && admin);
  if (needsLookup.length === 0) return brothers;

  const urlByAuthId = new Map<string, string | null>();
  await Promise.all(
    needsLookup.map(async b => {
      const authUserId = b.authUserId!;
      try {
        const { data, error } = await admin!.auth.admin.getUserById(authUserId);
        if (error || !data.user) {
          urlByAuthId.set(authUserId, null);
          return;
        }
        const { avatarUrl } = parseAvatarFromMetadata(data.user.user_metadata);
        urlByAuthId.set(authUserId, avatarUrl);
        if (avatarUrl) {
          // Best-effort avatar cache write by id; the row was already fetched
          // org-scoped by the caller (app/api/brothers uses ctx.db), and avatar is
          // account-level identity, not tenant data.
          await prisma.brother.update({ where: { id: b.id }, data: { avatarUrl } }).catch(() => undefined); // lint-direct-prisma:ignore
        }
      } catch {
        urlByAuthId.set(authUserId, null);
      }
    }),
  );

  return brothers.map(b => {
    if (b.avatarUrl || !b.authUserId) return b;
    const hydrated = urlByAuthId.get(b.authUserId);
    return hydrated ? { ...b, avatarUrl: hydrated } : b;
  });
}

/** Strip server-only fields before sending brothers to the client. */
export function publicBrother<T extends Record<string, unknown>>(b: T) {
  const { authUserId: _auth, ...rest } = b;
  return rest;
}
