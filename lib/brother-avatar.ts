import { parseAvatarFromMetadata } from "@/lib/avatar";
import { logError } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type BrotherRow = {
  id: number;
  authUserId: string | null;
  avatarUrl: string | null;
};

// ─── Avatar-probe cache ───────────────────────────────────────────────────────
//
// hydrateBrotherAvatars asks the Supabase Admin API for a member's picture when
// Brother.avatarUrl is null. A *hit* gets persisted to the column, so it's asked
// once. A *miss* used to persist nothing — so every member without a Google
// picture cost a fresh admin round-trip on every request, forever. /api/brothers
// is on the hot path for several pages, so that was a per-request, per-member
// network fan-out that never converged.
//
// This process-local cache remembers both outcomes for a short window. It's a
// cache of remote identity state, so the TTL is deliberately short: a member who
// sets a Google picture picks it up on the next window rather than instantly,
// and an upload through our own flow bypasses the wait entirely because
// syncBrotherAvatar writes through it.

const AVATAR_PROBE_TTL_MS = 10 * 60_000;
/** Hard cap on admin lookups per request, so a large roster can't fan out unboundedly. */
const MAX_AVATAR_PROBES = 25;
/** Bound on cache size; entries evict oldest-first (Map preserves insertion order). */
const MAX_AVATAR_CACHE_ENTRIES = 5_000;

const avatarProbeCache = new Map<string, { url: string | null; at: number }>();

/** Cached probe result, or `undefined` when unknown/expired (i.e. go ask). */
function readProbeCache(authUserId: string): string | null | undefined {
  const hit = avatarProbeCache.get(authUserId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > AVATAR_PROBE_TTL_MS) {
    avatarProbeCache.delete(authUserId);
    return undefined;
  }
  return hit.url;
}

function writeProbeCache(authUserId: string, url: string | null) {
  // Re-insert so a refreshed entry moves to the back of the eviction order.
  avatarProbeCache.delete(authUserId);
  avatarProbeCache.set(authUserId, { url, at: Date.now() });
  while (avatarProbeCache.size > MAX_AVATAR_CACHE_ENTRIES) {
    const oldest = avatarProbeCache.keys().next();
    if (oldest.done) break;
    avatarProbeCache.delete(oldest.value);
  }
}

/** Persist avatar URL on the linked brother row (best-effort). */
export async function syncBrotherAvatar(authUserId: string, avatarUrl: string | null) {
  // Write through the probe cache so an upload or removal is reflected
  // immediately instead of waiting out a stale entry's TTL.
  writeProbeCache(authUserId, avatarUrl);
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
  if (!admin) return brothers;

  const urlByAuthId = new Map<string, string | null>();
  const needsLookup: T[] = [];

  for (const b of brothers) {
    if (b.avatarUrl || !b.authUserId) continue;
    const cached = readProbeCache(b.authUserId);
    if (cached !== undefined) {
      urlByAuthId.set(b.authUserId, cached);
      continue;
    }
    // Over the cap: leave the row unhydrated. The UI already falls back to the
    // gradient initials badge, and a later request picks the member up.
    if (needsLookup.length < MAX_AVATAR_PROBES) needsLookup.push(b);
  }

  if (needsLookup.length > 0) {
    await Promise.all(
      needsLookup.map(async b => {
        const authUserId = b.authUserId!;
        const record = (url: string | null) => {
          urlByAuthId.set(authUserId, url);
          writeProbeCache(authUserId, url);
        };
        try {
          const { data, error } = await admin.auth.admin.getUserById(authUserId);
          if (error || !data.user) {
            record(null);
            return;
          }
          const { avatarUrl } = parseAvatarFromMetadata(data.user.user_metadata);
          record(avatarUrl);
          if (avatarUrl) {
            // Best-effort avatar cache write by id; the row was already fetched
            // org-scoped by the caller (app/api/brothers uses ctx.db), and avatar is
            // account-level identity, not tenant data.
            await prisma.brother.update({ where: { id: b.id }, data: { avatarUrl } }).catch(() => undefined); // lint-direct-prisma:ignore
          }
        } catch {
          record(null);
        }
      }),
    );
  }

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
