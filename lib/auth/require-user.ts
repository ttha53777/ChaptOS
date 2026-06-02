import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

function withTimeout(ms: number): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

export const ACTIVE_ORG_COOKIE = "active_org_id";

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
 *   3. homeOrgId — the legacy Brother.organizationId default.
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

  const activeOrgId = slugMembership?.organizationId ?? cookieOrgId ?? homeOrgId;
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

  // Active-org resolution: slug hint > active_org cookie > home org. See
  // resolveActiveOrg for the full precedence rationale.
  const { activeOrgId, cookieOrgId } = resolveActiveOrg({
    memberships,
    cookieValue: cookieStore.get(ACTIVE_ORG_COOKIE)?.value,
    homeOrgId:   brother.organizationId,
    orgSlug:     opts?.orgSlug,
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
