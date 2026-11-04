/**
 * Route classification shared by client components that must distinguish org
 * dashboards (/org/[slug]/…) from platform/auth routes (/login, /welcome, …).
 *
 * Org workspaces live under their own /org prefix (see lib/org-paths.ts), so
 * this is a prefix check — there's no list of platform segments to keep in
 * sync as public pages are added.
 */

import { orgSlugFromPath } from "@/lib/org-paths";

/** True when `pathname` is an org dashboard route (/org/[slug]/…). */
export function isDashboardRoute(pathname: string | null): boolean {
  return orgSlugFromPath(pathname) !== null;
}
