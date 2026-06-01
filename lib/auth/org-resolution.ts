/**
 * Resolves the Organization from an HTTP request without requiring an
 * authenticated session. Used by routes that must know the org before
 * auth is established (login/claim flow, public announcement endpoint).
 *
 * Resolution priority:
 *   1. `?org=<slug>` query parameter  (login page appends this)
 *   2. X-Org-Slug request header       (useful for API clients / tests)
 *   3. Subdomain of the Host header    (e.g. "alpha.figurints.com" → "alpha")
 *   4. null — caller decides fallback
 *
 * Returns the minimal org shape needed for routing. Returns null when no
 * slug can be extracted or when no matching org exists in the database.
 */

import { prisma } from "@/lib/prisma";
import { validateSlugFormat } from "@/lib/slug-rules";

export interface OrgRef {
  id:   number;
  slug: string;
  name: string;
}

export async function resolveOrgFromRequest(req: Request): Promise<OrgRef | null> {
  const slug = extractSlug(req);
  if (!slug) return null;
  return prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
}

/**
 * Same as resolveOrgFromRequest but falls back to the first Organization in
 * the database when no slug is present. Intended for single-org dev setups
 * and localhost where there is no subdomain / query param.
 *
 * In multi-org production, always prefer resolveOrgFromRequest so the caller
 * can return a 404 for unknown orgs rather than silently serving the wrong org.
 */
export async function resolveOrgFromRequestOrFirst(req: Request): Promise<OrgRef | null> {
  const explicit = await resolveOrgFromRequest(req);
  if (explicit) return explicit;
  return prisma.organization.findFirst({
    orderBy: { id: "asc" },
    select: { id: true, slug: true, name: true },
  });
}

function extractSlug(req: Request): string | null {
  const url = new URL(req.url);

  // 1. Query param — login page passes ?org=<slug>
  const param = url.searchParams.get("org");
  if (param && isValidSlug(param)) return param;

  // 2. Explicit header — useful for API clients and integration tests
  const header = req.headers.get("x-org-slug");
  if (header && isValidSlug(header)) return header;

  // 3. Subdomain — "alpha.figurints.com" → "alpha"
  //    Skipped on localhost / IP addresses (no meaningful subdomain).
  const host = (req.headers.get("host") ?? "").split(":")[0]; // strip port
  const parts = host.split(".");
  if (parts.length >= 3) {
    const sub = parts[0];
    if (isValidSlug(sub)) return sub;
  }

  return null;
}

/**
 * Gate before a DB lookup: is `s` something that could be a real org slug?
 *
 * Delegates to validateSlugFormat() in lib/slug-rules — the SAME rules orgs are
 * created under (format, 3–32 length, reserved list, profanity). Two benefits:
 *   - The resolver and the creator can't drift out of sync. Previously this had
 *     its own 1–63-char regex that accepted slugs (e.g. 2-char, or reserved
 *     names like "api") no org could ever own, so the lookup would always miss.
 *   - Reserved slugs ("www", "api", "admin", …) are rejected here for free —
 *     they live in RESERVED_SLUGS, so the old hardcoded www/api exclusions are
 *     now redundant.
 */
function isValidSlug(s: string): boolean {
  return validateSlugFormat(s).ok;
}
