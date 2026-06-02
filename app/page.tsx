import { redirect } from "next/navigation";
import { requireUser, hasSession } from "@/lib/auth/require-user";

/**
 * Root entry point. Org-scoped app lives under /[slug]; this route just routes
 * the visitor to the right place:
 *
 *   - Not signed in              → /login
 *   - Signed in, no Brother yet  → /welcome (join or create)
 *   - Signed in, has an org      → /<active-org-slug>  (cookie-resolved, else first membership)
 *   - Signed in, Brother but zero memberships → /welcome
 *
 * Server-side redirect — no flash, runs before any render.
 */
export default async function RootPage() {
  const user = await requireUser();
  if (!user) {
    // null = no session OR session-without-Brother. An authenticated-but-
    // unlinked user has no org context at root, so send them to onboarding
    // rather than looping them back to /login.
    if (await hasSession()) redirect("/welcome");
    redirect("/login");
  }

  // requireUser() resolves orgId from the active_org_id cookie (falling back to
  // the brother's default org). Map it to the slug via the loaded memberships.
  const active = user.memberships.find(m => m.organizationId === user.orgId);
  const slug = active?.orgSlug ?? user.memberships[0]?.orgSlug ?? null;

  redirect(slug ? `/${slug}` : "/welcome");
}
