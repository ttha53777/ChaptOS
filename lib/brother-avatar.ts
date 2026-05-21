import { parseAvatarFromMetadata } from "@/lib/avatar";
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
    await prisma.brother.updateMany({
      where: { authUserId },
      data: { avatarUrl },
    });
  } catch (e) {
    console.error("syncBrotherAvatar failed:", e);
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
          await prisma.brother.update({ where: { id: b.id }, data: { avatarUrl } }).catch(() => undefined);
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
