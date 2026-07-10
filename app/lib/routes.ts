/**
 * Route classification shared by client components that must distinguish org
 * dashboards (/[slug]/…) from platform/auth routes (/login, /welcome, …).
 *
 * The dashboard is the only place whose first path segment is a real org slug;
 * every platform route is a known reserved segment. Excluding those keeps the
 * check from drifting as routes are added.
 */

// First-path segments that are platform/auth routes, NOT org dashboards.
export const RESERVED_SEGMENTS = new Set([
  "login",
  "welcome",
  "create",
  "pending-access",
  "join",
  "auth",
  "admin",
  "api",
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
