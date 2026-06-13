import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, hasSession } from "@/lib/auth/require-user";
import { LandingPage } from "./components/landing/LandingPage";
import { APP_NAME } from "@/lib/domains";

export const metadata: Metadata = {
  title: `${APP_NAME} — The AI-native operating system for student orgs`,
  description:
    "Dues, attendance, programming, people — one calm, intelligent home for " +
    "everything your fraternity, sorority, or student org runs on, with an " +
    "AI that answers from your real data and drafts the busywork for you.",
};

/**
 * Root entry point. Org-scoped app lives under /[slug]; this route shows the
 * marketing landing page to anonymous visitors and routes everyone else:
 *
 *   - Not signed in              → landing page (CTAs → /login)
 *   - Signed in, no Brother yet  → /welcome (join or create)
 *   - Signed in, has an org      → /<active-org-slug>  (cookie-resolved, else first membership)
 *   - Signed in, Brother but zero memberships → /welcome
 *
 * Redirects are server-side — no flash, run before any render.
 */
export default async function RootPage() {
  const user = await requireUser();
  if (!user) {
    // null = no session OR session-without-Brother. An authenticated-but-
    // unlinked user has no org context at root, so send them to onboarding
    // rather than showing them the marketing page again.
    if (await hasSession()) redirect("/welcome");
    return <LandingPage />;
  }

  // requireUser() resolves orgId from the active_org_id cookie (falling back to
  // the brother's default org). Map it to the slug via the loaded memberships.
  const active = user.memberships.find(m => m.organizationId === user.orgId);
  const slug = active?.orgSlug ?? user.memberships[0]?.orgSlug ?? null;

  redirect(slug ? `/${slug}` : "/welcome");
}
