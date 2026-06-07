import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

function withTimeout(ms: number): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

export const ACTIVE_ORG_COOKIE = "active_org_id";

/**
 * Header the client sets on every API request, carrying the org slug from the
 * URL the user is actually viewing (/[slug]/*). The data layer trusts the URL
 * over the active_org cookie, so a freshly-switched org never shows stale data
 * while the cookie catches up. Only honored when it maps to one of the user's
 * own memberships (resolveActiveOrg) — non-enumerable, can't read a foreign org.
 */
export const ORG_SLUG_HEADER = "x-org-slug";

export interface MembershipSummary {
  id:             number;
  organizationId: number;
  isOrgAdmin:     boolean;
  orgName:        string;
  orgSlug:        string;
}

/**
 * Resolve which org is active for a request, and which org the cookie alone
 * would select. Pure (no I/O) so it can be unit-tested directly.
 *
 * Precedence for the active org:
 *   1. URL slug hint — when the user is a member of <orgSlug>. The slug is the
 *      source of truth for /[slug]/* routes, so it wins over the cookie. Only
 *      honored if it maps to one of the user's memberships (non-enumerable).
 *   2. active_org_id cookie — for slug-less entry points (/, switcher, slug-less
 *      API calls). Wins only if it points at a membership.
 *   3. homeOrgId — the legacy Brother.organizationId default, but ONLY when it's
 *      still an actual membership. A stale home org (the user was removed from
 *      that org but Brother.organizationId still points there) must NOT silently
 *      grant access, so we fall back to the first real membership instead. When
 *      there are no memberships at all we still return homeOrgId to keep the
 *      numeric contract — buildContext() denies the actual access (a non-member,
 *      non-platform-admin gets a 403 there, not here).
 *
 * `cookieOrgId` is the org the cookie alone resolves to (null if unset/invalid),
 * surfaced so a slug-driven caller can detect a stale cookie and align it.
 */
export function resolveActiveOrg(args: {
  memberships: Pick<MembershipSummary, "organizationId" | "orgSlug">[];
  cookieValue: string | undefined;
  homeOrgId:   number;
  orgSlug?:    string;
}): { activeOrgId: number; cookieOrgId: number | null } {
  const { memberships, cookieValue, homeOrgId, orgSlug } = args;

  const slugMembership = orgSlug
    ? memberships.find(m => m.orgSlug === orgSlug)
    : undefined;

  const parsed = cookieValue ? Number(cookieValue) : NaN;
  const cookieOrgId =
    Number.isInteger(parsed) && memberships.some(m => m.organizationId === parsed)
      ? parsed
      : null;

  // Only trust homeOrgId when it's still a real membership; otherwise fall back
  // to the first membership so a stale Brother.organizationId can't steer the
  // user into an org they were removed from. The trailing homeOrgId keeps the
  // return numeric when the user has zero memberships (buildContext gates that).
  const homeIsMember = memberships.some(m => m.organizationId === homeOrgId);
  const activeOrgId =
    slugMembership?.organizationId ??
    cookieOrgId ??
    (homeIsMember ? homeOrgId : memberships[0]?.organizationId ?? homeOrgId);
  return { activeOrgId, cookieOrgId };
}

/**
 * True when a valid Supabase session exists, regardless of whether it's linked
 * to a Brother. Lets callers distinguish "not signed in" (→ /login) from
 * "signed in but no Brother yet" (→ claim/onboarding) when requireUser() returns
 * null — requireUser collapses both to null. Cheap: one getUser() call, no DB.
 */
export async function hasSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
      global: { fetch: withTimeout(5_000) },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

export async function requireUser(opts?: { orgSlug?: string }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
      global: { fetch: withTimeout(5_000) },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const brother = await prisma.brother.findUnique({
    where: { authUserId: user.id },
    select: {
      id: true,
      role: true,
      name: true,
      isAdmin: true,
      organizationId: true,
      platformAdmin: { select: { id: true } },
      memberships: {
        select: {
          id: true,
          organizationId: true,
          isOrgAdmin: true,
          organization: { select: { name: true, slug: true } },
        },
      },
    },
  });
  if (!brother) return null;

  const isPlatformAdmin = brother.isAdmin || !!brother.platformAdmin;

  const memberships: MembershipSummary[] = brother.memberships.map(m => ({
    id:             m.id,
    organizationId: m.organizationId,
    isOrgAdmin:     m.isOrgAdmin,
    orgName:        m.organization.name,
    orgSlug:        m.organization.slug,
  }));

  // Slug hint precedence: an explicit opts.orgSlug (passed by /[slug]/layout,
  // which knows the URL directly) wins; otherwise fall back to the x-org-slug
  // header the API client sets from window.location. Both name the org the user
  // is actually viewing, so the data layer follows the URL — not a lagging
  // active_org cookie — and a freshly-switched org never shows stale data.
  let orgSlug = opts?.orgSlug;
  if (!orgSlug) {
    try {
      orgSlug = (await headers()).get(ORG_SLUG_HEADER) ?? undefined;
    } catch {
      // headers() is unavailable outside a request scope (shouldn't happen for
      // callers that reach here) — fall through to cookie/home resolution.
    }
  }

  // Active-org resolution: slug hint > active_org cookie > home org. See
  // resolveActiveOrg for the full precedence rationale.
  const { activeOrgId, cookieOrgId } = resolveActiveOrg({
    memberships,
    cookieValue: cookieStore.get(ACTIVE_ORG_COOKIE)?.value,
    homeOrgId:   brother.organizationId,
    orgSlug,
  });

  return {
    id: brother.id,
    role: brother.role,
    name: brother.name,
    /** @deprecated use isPlatformAdmin. Kept for compatibility during Phase 0→1 migration. */
    isAdmin: brother.isAdmin,
    isPlatformAdmin,
    orgId: activeOrgId,
    // The org the active_org cookie currently points at (null if unset/invalid).
    // Exposed so callers that resolved orgId from a slug hint can detect a stale
    // cookie and align it in the background, without re-reading the cookie.
    cookieOrgId,
    memberships,
    authUserId: user.id,
    email: user.email ?? null,
  };
}
