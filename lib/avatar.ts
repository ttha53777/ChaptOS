export const AVATAR_CHANGED_EVENT = "chaptos_avatar_changed";

export function parseAvatarFromMetadata(meta: Record<string, unknown> | undefined) {
  const avatarUrl = typeof meta?.avatar_url === "string" ? meta.avatar_url : null;
  const hasCustomAvatar = meta?.custom_avatar === true;
  return { avatarUrl, hasCustomAvatar };
}

/**
 * True when a URL points at a photo the member uploaded themselves. Uploads
 * always land in the `avatars` storage bucket (app/api/auth/avatar), while an
 * OAuth provider's picture lives on the provider's own host — so the persisted
 * URL alone answers "is this custom?", with no reliance on token metadata that
 * can be up to an hour stale.
 */
export function isUploadedAvatarUrl(url: string): boolean {
  return url.includes("/storage/v1/object/public/avatars/");
}

/** Append a cache-buster so <img> reloads after upload/remove. */
export function avatarDisplayUrl(url: string | null, revision: number): string | null {
  if (!url) return null;
  const base = url.split("?")[0]!;
  return `${base}?v=${revision}`;
}
