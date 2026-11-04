import { WelcomeFrame } from "./WelcomeFrame";

/**
 * /[slug]/onboarding — the founder's FIRST FRAME, where /create lands them once
 * the charter is filed (_design/Org Creation Paper Mock.html, "first frame").
 *
 * Setup itself happens pre-creation: provisionOrg applies the reviewed charter
 * atomically — pages, words, seats, tracking, timeline categories and the first
 * ACTIVE term — so there is nothing left to configure here. This page is the
 * welcome inside the real app shell: what's already done, the one step that
 * matters next (bring your people in, with the reviewed-join link), and the
 * first-week steps after it. Revisiting it later is harmless; it reads live
 * data, so finished steps show as finished.
 *
 * SemesterGate deliberately skips this path (see its isOnboarding check).
 */
export default function OnboardingWelcome() {
  return <WelcomeFrame />;
}
