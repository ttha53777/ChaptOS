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

import { slugFromHost } from "@/lib/domains";

/**
 * Priority order:
 *   1. `?org=<slug>` — most reliable; that's the canonical link shape we mint.
 *   2. URL subdomain (alpha.chaptos.io → alpha), skipping reserved hosts like
 *      "www" and the platform apex — see lib/domains.ts for the canonical list.
 *   3. Bare input — whatever the user typed, lowercased.
 */
export function extractSlug(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const qp = trimmed.match(/[?&]org=([a-z0-9-]+)/i);
  if (qp?.[1]) return qp[1].toLowerCase();

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const sub = slugFromHost(url.hostname);
    if (sub) return sub;
  } catch {
    // Not a parseable URL — fall through.
  }

  return trimmed.toLowerCase();
}
