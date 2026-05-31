/**
 * Pure helper for parsing slug input on the /welcome Join form.
 *
 * Accepts a bare slug ("alpha") or a pasted URL of any common shape and
 * returns the lowercased candidate. The server's validateSlugFormat() in
 * lib/slug-rules.ts has the final say on whether the result is valid.
 *
 * Lives in lib/ rather than inside the page module so it's testable without
 * pulling in the React tree.
 */

// Apex hosts we treat as the platform itself rather than as a slug source.
// Add new platform hosts as they ship.
const APEX_HOSTS = new Set(["figurints.com", "localhost"]);

/**
 * Priority order:
 *   1. `?org=<slug>` — most reliable; that's the canonical link shape we mint.
 *   2. URL subdomain (alpha.figurints.com → alpha), skipping reserved hosts
 *      like "www" and the apex itself.
 *   3. Bare input — whatever the user typed, lowercased.
 */
export function extractSlug(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const qp = trimmed.match(/[?&]org=([a-z0-9-]+)/i);
  if (qp?.[1]) return qp[1].toLowerCase();

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase();
    if (!APEX_HOSTS.has(host)) {
      const labels = host.split(".");
      if (labels.length >= 3 && labels[0] !== "www") {
        return labels[0];
      }
    }
  } catch {
    // Not a parseable URL — fall through.
  }

  return trimmed.toLowerCase();
}
