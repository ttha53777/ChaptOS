/**
 * Absolute origin for Stripe redirect URLs.
 *
 * Checkout and the Billing Portal both need fully-qualified success/return URLs,
 * and the app has no configured absolute base URL — NEXT_PUBLIC_ROOT_DOMAIN is a
 * bare domain used for subdomain slug resolution, not an origin, and it defaults
 * to "localhost" with no scheme or port. So the origin is derived per-request.
 *
 * Forwarded headers are preferred because in production the app sits behind
 * Vercel's proxy, where the internal request URL is not the user-facing one.
 * Same precedence as lib/auth/same-origin.ts.
 */
export function appOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) {
    // Fall back to the request URL's own origin. Only reachable for a caller
    // that sent neither header, which in practice means a test client.
    return new URL(req.url).origin;
  }
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
