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
    // Exclude "www" and other well-known non-org subdomains
    if (isValidSlug(sub) && sub !== "www" && sub !== "api") return sub;
  }

  return null;
}

function isValidSlug(s: string): boolean {
  // Slugs: lowercase letters, digits, hyphens, 1–63 chars. No leading/trailing hyphens.
  return /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(s) || /^[a-z0-9]$/.test(s);
}
