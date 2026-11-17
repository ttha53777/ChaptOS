/** The token from a pasted invite link (…/join/<token>), or the paste itself if it's a bare token. */
export function tokenFrom(pasted: string): string {
  const s = pasted.trim();
  const m = /\/join\/([^/?#\s]+)/.exec(s);
  try {
    return decodeURIComponent(m?.[1] ?? s);
  } catch {
    return m?.[1] ?? s;
  }
}
