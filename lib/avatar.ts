export const AVATAR_CHANGED_EVENT = "chaptos_avatar_changed";

export function parseAvatarFromMetadata(meta: Record<string, unknown> | undefined) {
  const avatarUrl = typeof meta?.avatar_url === "string" ? meta.avatar_url : null;
  const hasCustomAvatar = meta?.custom_avatar === true;
  return { avatarUrl, hasCustomAvatar };
}

/** Append a cache-buster so <img> reloads after upload/remove. */
export function avatarDisplayUrl(url: string | null, revision: number): string | null {
  if (!url) return null;
  const base = url.split("?")[0]!;
  return `${base}?v=${revision}`;
}
