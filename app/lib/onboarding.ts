/**
 * Single source of truth for "is this an onboarding screen?" — a pure check on
 * the URL, used by surfaces that want to suppress in-app chrome while the
 * founder is on the setup wizard (e.g. the Ask-Chapt widget gate,
 * app/components/ChatWidgetGate.tsx).
 *
 * This is distinct from "has onboarding been COMPLETED?", which is now an
 * explicit, persistent marker: OrganizationConfig.onboardingCompletedAt. The
 * server onboarding guard (app/[slug]/layout.tsx) gates on that column, not on
 * the route, so a founder who leaves mid-setup is still bounced back until they
 * finish. (The old proxy — enabledWorkflows.length === 0 — was unreliable
 * because provisionOrg seeds workflows non-empty at creation.) This route check
 * remains a separate, cheap client-side signal for "is the wizard on screen?".
 */
export function isOnboardingRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  // /[slug]/onboarding — the post-creation finish-setup picker.
  return /^\/[^/]+\/onboarding\/?$/.test(pathname);
}
