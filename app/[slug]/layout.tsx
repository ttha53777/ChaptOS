import { redirect } from "next/navigation";
import { requireUser, hasSession, sessionAuthUserId } from "@/lib/auth/require-user";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { JoinRequestStatus } from "@/lib/state";
import { AwaitingApproval } from "./AwaitingApproval";
import { NeedsInvite } from "./NeedsInvite";
import { ActiveOrgSync } from "./ActiveOrgSync";

/**
 * Is this Google account waiting on <slug> to let them in?
 *
 * Privileged and unscoped by necessity: the asker has no membership here (that
 * is the whole point), so there is no app.org_id to SET LOCAL and the enforcing
 * org_isolation policy on JoinRequest would silently return null for the plain
 * app role — showing a waiting person the needs-an-invite page.
 *
 * Leaks nothing about which slugs exist. A row can only be found by someone who
 * already used a link for that org, and every miss — real org, fake slug, no
 * request — renders the identical NeedsInvite page.
 */
async function hasPendingRequest(authUserId: string, slug: string): Promise<boolean> {
  const row = await prismaPrivileged.joinRequest.findFirst({
    where:  { authUserId, status: JoinRequestStatus.Pending, organization: { slug } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * OrgGuard — wraps every /[slug]/* route.
 *
 * The URL slug is the source of truth for which org the page shows. This layout
 * runs server-side BEFORE any render and enforces access:
 *
 *   - Not signed in                  → /login?org=<slug>  (org-first sign-in)
 *   - Signed in, member of <slug>    → render (sync cookie ← slug if stale)
 *   - Signed in, request pending      → the waiting wall
 *   - Signed in, no way in            → "you need an invite"
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
  // Pass the URL slug so org resolution follows the URL (the source of truth for
  // /[slug]/* routes) rather than the active_org cookie. For a member of <slug>
  // this makes user.orgId == that membership's org, so the page renders this
  // org's data immediately — no cookie-sync reload.
  const user = await requireUser({ orgSlug: slug });

  if (!user) {
    // requireUser returns null for BOTH "no session" and "session but no
    // Brother". Distinguish them so an authenticated-but-unlinked user isn't
    // bounced to /login (where they'd sit signed-in and stuck).
    //
    // "Session but no Brother" is now the NORMAL state for someone mid-join:
    // filing a request creates no identity, so a person waiting on an officer
    // has a session and nothing else. Show them the wall rather than the
    // needs-an-invite page, which would read as if their request had vanished.
    if (await hasSession()) {
      const authUserId = await sessionAuthUserId();
      if (authUserId && await hasPendingRequest(authUserId, slug)) {
        return <AwaitingApproval slug={slug} />;
      }
      return <NeedsInvite slug={slug} homeSlug={null} />;
    }
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
    // Belongs somewhere, but not here. They may still be waiting on this org —
    // someone in one chapter asking to join a second one gets the same review as
    // anyone else, deliberately, so their identity being known elsewhere buys
    // them nothing here.
    const authUserId = await sessionAuthUserId();
    if (authUserId && await hasPendingRequest(authUserId, slug)) {
      return <AwaitingApproval slug={slug} />;
    }

    // We deliberately do NOT check whether <slug> is a real org: requireUser
    // only knows the user's own memberships, and a DB existence probe would leak
    // which slugs exist. So "real org you're not in" and "nonexistent slug" land
    // on the same page — non-enumerable by design.
    return <NeedsInvite slug={slug} homeSlug={homeSlug} />;
  }

  // The post-create onboarding wizard is RETIRED. Setup now happens
  // pre-creation: the founder reviews a blueprint (workflows/vocab/roles) and
  // provisionOrg applies it atomically, stamping onboardingCompletedAt at
  // creation. So new orgs are always "complete", legacy orgs were backfilled to
  // createdAt, and /[slug]/onboarding just redirects here. There is nothing left
  // to gate on — a founder lands straight in the workspace on first entry.

  // Authorized, and org resolution already followed the URL slug (we passed it to
  // requireUser), so this page renders the right org's data now — no reload.
  //
  // The active_org cookie may still be stale relative to this URL (it lags behind
  // a bookmarked deep-link or a cross-org link). It still matters for slug-less
  // entry points (/, the org switcher, API calls without slug context), so align
  // it in the BACKGROUND — render the children immediately and let <ActiveOrgSync>
  // POST the correction without blocking or reloading. Common case (cookie already
  // matches) skips the POST entirely.
  const cookieStale = user.cookieOrgId !== membership.organizationId;
  return (
    <>
      {cookieStale && <ActiveOrgSync organizationId={membership.organizationId} />}
      {children}
    </>
  );
}
