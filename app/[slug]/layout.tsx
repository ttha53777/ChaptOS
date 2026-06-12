import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser, hasSession } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";
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
  // Onboarding-gate lookup (consumed further down) starts in parallel with auth
  // so it doesn't add a sequential DB round-trip to every page render.
  // Organization.slug is unique, so this resolves the same config row the
  // post-membership findUnique used to; the result is only USED after the
  // membership gate below passes, so nothing leaks on the deny paths.
  const configPromise = prisma.organizationConfig.findFirst({
    where: { organization: { slug } },
    select: { enabledWorkflows: true },
  });
  // Pre-handle rejection for the paths that redirect before awaiting it; the
  // explicit await below still surfaces the original error when the value is used.
  configPromise.catch(() => undefined);
  // Pass the URL slug so org resolution follows the URL (the source of truth for
  // /[slug]/* routes) rather than the active_org cookie. For a member of <slug>
  // this makes user.orgId == that membership's org, so the page renders this
  // org's data immediately — no cookie-sync reload.
  const user = await requireUser({ orgSlug: slug });

  if (!user) {
    // requireUser returns null for BOTH "no session" and "session but no
    // Brother". Distinguish them so an authenticated-but-unlinked user isn't
    // bounced to /login (where they'd sit signed-in and stuck): send them to
    // the claim flow for this org instead. (The proxy no longer gates link
    // status — this layout owns it now.)
    if (await hasSession()) {
      redirect(`/pending-access?org=${encodeURIComponent(slug)}`);
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
    // Member of some org, but not this slug. We deliberately do NOT check
    // whether <slug> is a real org here: requireUser only knows the user's own
    // memberships, and a DB existence probe would leak which slugs exist. So
    // both "real org you're not in" and "nonexistent slug" land on the same
    // access-denied page — non-enumerable by design. If the slug is bogus, the
    // "Request access" link's claim call fails gracefully with "Organization
    // not found".
    return <AccessDenied slug={slug} homeSlug={homeSlug} />;
  }

  // Onboarding gate: if the org has never saved its workflow config (empty
  // enabledWorkflows), the founder hasn't finished setup. Redirect every route
  // except /[slug]/onboarding itself so a second tab can't bypass the wizard.
  const requestPath = (await headers()).get("x-pathname") ?? "";
  const isOnboardingRoute = requestPath === `/${slug}/onboarding`;
  if (!isOnboardingRoute) {
    const config = await configPromise;
    if (!config || config.enabledWorkflows.length === 0) {
      redirect(`/${slug}/onboarding`);
    }
  }

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
