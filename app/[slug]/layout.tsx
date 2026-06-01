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
 *   - Signed in, member of <slug>    → render; sync active_org_id cookie ← slug
 *   - Signed in, NOT a member, but
 *       the slug is a real org        → access-denied page (request access)
 *   - Signed in, slug isn't a real
 *       org for this user             → bounce to their own org / /welcome
 *   - Platform admin                 → always allowed (cross-org access)
 *
 * Cookie sync note: Next forbids writing cookies during Server Component render
 * (see node_modules/next/dist/docs/.../cookies.md). So when the URL slug differs
 * from the cookie-resolved active org, we can't set the cookie here. Instead we
 * render <ActiveOrgSync> — a client component that POSTs /api/auth/active-org to
 * align the cookie, then refreshes data. For the common case (cookie already
 * matches the URL) it's a no-op.
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
      // Platform admins may view any org. The data layer follows the active_org
      // cookie, so they must explicitly switch via the cookie to load this org's
      // data — ActiveOrgSync can't help them (they have no membership row to
      // resolve an orgId from the slug). Cross-org admin viewing by URL is a
      // follow-up; for now allow the chrome to render.
      return <>{children}</>;
    }
    // Member of nothing → onboarding. Member of something else → access-denied
    // (the slug is a real org, just not theirs).
    if (user.memberships.length === 0) {
      redirect("/welcome");
    }
    return <AccessDenied slug={slug} homeSlug={homeSlug} />;
  }

  // Authorized. Align the active-org cookie to this URL if it's stale (e.g. a
  // bookmarked deep-link into a different org than the cookie remembers).
  const needsSync = user.orgId !== membership.organizationId;

  return (
    <>
      {needsSync && <ActiveOrgSync organizationId={membership.organizationId} />}
      {children}
    </>
  );
}
