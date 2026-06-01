/**
 * Same-origin guard for state-changing requests.
 *
 * Our auth cookies are SameSite=Lax, which means the browser WILL send them on
 * top-level cross-site navigations (e.g. a malicious page that auto-submits a
 * form to POST /api/auth/active-org). Lax blocks cross-site sub-resource
 * requests but not navigations, so a CSRF window exists for plain form posts.
 *
 * The defense: browsers reliably attach an `Origin` header to cross-site POSTs.
 * We compare it against the request's own host. A mismatch is a cross-origin
 * caller — reject. We also accept `Sec-Fetch-Site: same-origin/none` as a
 * positive signal where present.
 *
 * Absent Origin (some same-origin navigations, server-to-server / test clients)
 * is allowed: there's nothing to compare, and the CSRF vector specifically
 * requires a browser that DOES send Origin. Callers that need stricter behavior
 * can layer their own checks.
 */

function requestHost(req: Request): string | null {
  // Prefer the forwarded host (set by the proxy/CDN) so this works behind
  // Vercel/Supabase edge; fall back to Host.
  const fwd  = req.headers.get("x-forwarded-host");
  const host = fwd ?? req.headers.get("host");
  return host ? host.split(":")[0].toLowerCase() : null;
}

/**
 * Returns true when the request is same-origin (or origin can't be determined,
 * which is not a browser CSRF vector). Returns false for a definite cross-origin
 * browser POST.
 */
export function isSameOrigin(req: Request): boolean {
  // Fast path: Sec-Fetch-Site is set by modern browsers and is unforgeable by
  // page script. "same-origin" / "none" (user-initiated) are safe.
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "none") return true;
  if (secFetchSite === "cross-site" || secFetchSite === "same-site") return false;

  // Fallback for clients that don't send Sec-Fetch-Site: compare Origin host.
  const origin = req.headers.get("origin");
  if (!origin) return true; // nothing to compare — not a cross-origin browser POST
  let originHost: string;
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch {
    return false; // malformed Origin — treat as hostile
  }
  const host = requestHost(req);
  return host !== null && originHost === host;
}
