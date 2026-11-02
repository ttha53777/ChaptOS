/**
 * What a signed-in person leaves in this browser's localStorage, and how it's
 * cleared.
 *
 * Ask Chapt threads and cached digest sentences carry member data — names, dues,
 * GPA, who's at risk. On a shared machine (a chapter-house laptop) that must not
 * outlive the session or reach the next person to sign in, so:
 *
 *   - threads are keyed per person per org (chatHistoryKey), and the widget drops
 *     any other person's thread the moment it mounts (dropOtherPeoplesChats);
 *   - signing out, or deleting the account, removes all of it
 *     (clearSessionStorage).
 *
 * Interface preferences (theme, sidebar rail) aren't personal data and stay.
 */

const CHAT_PREFIX = "chaptos_chat_";
const SESSION_PREFIXES = [CHAT_PREFIX, "chaptos_digest_narration:", "chaptos_last_org"];

/** The Ask Chapt thread for one person in one org. */
export function chatHistoryKey(brotherId: number, orgSlug: string): string {
  return `${CHAT_PREFIX}v3:${brotherId}:${orgSlug}`;
}

function keysMatching(test: (key: string) => boolean): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && test(key)) out.push(key);
  }
  return out;
}

/**
 * Remove every stored thread that isn't this person's — older unscoped versions
 * included, since nobody can say whose those were. Their own threads in their
 * other orgs survive.
 */
export function dropOtherPeoplesChats(brotherId: number): void {
  try {
    const mine = `${CHAT_PREFIX}v3:${brotherId}:`;
    // The first-run "seen" flag shares the prefix but holds no content.
    const seen = `${CHAT_PREFIX}seen_`;
    for (const key of keysMatching(k => k.startsWith(CHAT_PREFIX) && !k.startsWith(mine) && !k.startsWith(seen))) {
      localStorage.removeItem(key);
    }
  } catch { /* storage unavailable — nothing stored to leak */ }
}

/** Sign-out / account deletion: remove everything personal this browser holds. */
export function clearSessionStorage(): void {
  try {
    for (const key of keysMatching(k => SESSION_PREFIXES.some(p => k.startsWith(p)))) {
      localStorage.removeItem(key);
    }
  } catch { /* storage unavailable — nothing to clear */ }
}
