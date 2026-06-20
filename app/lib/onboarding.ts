/**
 * Single source of truth for "is this an onboarding screen?"
 *
 * There is currently NO persistent onboarding-complete marker: `provisionOrg`
 * seeds `enabledWorkflows` from the org-type template at creation, so that field
 * is non-empty the entire time — including while the founder is still on the
 * /[slug]/onboarding picker. The only reliable signal that setup isn't finished
 * is therefore the route itself: the founder is parked on /[slug]/onboarding
 * until they hit Continue (which navigates into the dashboard).
 *
 * Both the Ask-Chapt widget gate (app/components/ChatWidgetGate.tsx) and the
 * server onboarding guard (app/[slug]/layout.tsx) ask "are we mid-onboarding?".
 * Keeping the definition here means a future explicit completion marker (e.g. an
 * `onboardingCompletedAt` column) only changes this one function.
 */
export function isOnboardingRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  // /[slug]/onboarding — the post-creation finish-setup picker.
  return /^\/[^/]+\/onboarding\/?$/.test(pathname);
}
