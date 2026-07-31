/**
 * Route classification shared by client components that must distinguish org
 * dashboards (/[slug]/…) from platform/auth routes (/login, /welcome, …).
 *
 * The dashboard is the only place whose first path segment is a real org slug;
 * every platform route is a known reserved segment. Excluding those keeps the
 * check from drifting as routes are added.
 */

// First-path segments that are platform/auth routes, NOT org dashboards.
//
// Missing one here is not cosmetic: isDashboardRoute() gates the chat widget,
// the no-active-semester modal and the org header on api calls, so a public page
// left out of this set gets the signed-in app's dark chrome bolted onto an ivory
// marketing page.
export const RESERVED_SEGMENTS = new Set([
  "login",
  "welcome",
  "create",
  "pending-access",
  "join",
  "auth",
  "admin",
  "api",
  // Public marketing/disclosure pages (see PUBLIC_PATHS in proxy.ts). They
  // render the same signed in, and none of them belongs to an org.
  "trust",
  "help",
  "contact",
  "for",
  "pricing",
]);

/**
 * True when `pathname` is an org dashboard route (/[slug]/…) — i.e. its first
 * segment is a real org slug, not a reserved platform segment or the root.
 */
export function isDashboardRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const seg = pathname.split("/")[1] ?? ""; // "" for "/"
  if (seg === "") return false; // root redirect
  return !RESERVED_SEGMENTS.has(seg);
}
