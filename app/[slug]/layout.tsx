import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { AccessDenied } from "./AccessDenied";
import { ActiveOrgSync } from "./ActiveOrgSync";

/**
 * OrgGuard — wraps every /[slug]/* route.
 *
 * The URL slug is the source of truth for which org the page shows. This layout
 * runs server-side BEFORE any render and enforces access:
 *
 *   - Not signed in                  → /login?org=<slug>  (org-first sign-in)
 *   - Signed in, member of <slug>    → render (sync cookie ← slug if stale)
 *   - Signed in, has memberships but
 *       not this slug                 → access-denied page (request access)
 *   - Signed in, zero memberships     → /welcome (onboarding)
 *   - Platform admin (non-member)     → render chrome only (see caveat below)
 *
 * Cookie sync note: Next forbids writing cookies during Server Component render
 * (see node_modules/next/dist/docs/.../cookies.md). So when the URL's org differs
 * from the cookie-resolved active org, we can't set the cookie here. Instead we
 * render <ActiveOrgSync> in place of the page — a client component that POSTs
 * /api/auth/active-org to align the cookie, then reloads. The common case (cookie
 * already matches the URL) skips it entirely — zero overhead.
 */
export default async function OrgLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const user = await requireUser();

  if (!user) {
    redirect(`/login?org=${encodeURIComponent(slug)}`);
  }

  const membership = user.memberships.find(m => m.orgSlug === slug);
  const homeSlug =
    user.memberships.find(m => m.organizationId === user.orgId)?.orgSlug ??
    user.memberships[0]?.orgSlug ??
    null;

  if (!membership) {
    if (user.isPlatformAdmin) {
      // Platform admins may view any org's CHROME by URL, but the data layer
      // follows the active_org cookie — and requireUser() only honors that
      // cookie when it points at one of the user's OWN memberships (see
      // require-user.ts: cookieValid). A platform admin has no membership in a
      // foreign org, so we can't sync the cookie to it without reworking
      // requireUser to grant admins cross-org cookie authority (a core-auth
      // change every API depends on). Until then, cross-org admin viewing by URL
      // shows the admin's active-org data under a foreign slug — misleading, so
      // admins should use /admin/orgs for cross-org work. Tracked as a follow-up.
      return <>{children}</>;
    }
    // Member of nothing → onboarding.
    if (user.memberships.length === 0) {
      redirect("/welcome");
    }
    // Member of some org, but not this slug. We deliberately do NOT check
    // whether <slug> is a real org here: requireUser only knows the user's own
    // memberships, and a DB existence probe would leak which slugs exist. So
    // both "real org you're not in" and "nonexistent slug" land on the same
    // access-denied page — non-enumerable by design. If the slug is bogus, the
    // "Request access" link's claim call fails gracefully with "Organization
    // not found".
    return <AccessDenied slug={slug} homeSlug={homeSlug} />;
  }

  // Authorized. If the active-org cookie is stale vs this URL (e.g. a bookmarked
  // deep-link into a different org than the cookie remembers), render the sync
  // screen INSTEAD of the children — it aligns the cookie then reloads. Showing
  // the page now would flash the wrong org's data (ChapterContext would fetch
  // against the stale cookie before the reload).
  const needsSync = user.orgId !== membership.organizationId;
  if (needsSync) {
    return <ActiveOrgSync organizationId={membership.organizationId} />;
  }

  return <>{children}</>;
}
