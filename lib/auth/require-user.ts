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

export async function requireUser() {
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

  // Active-org resolution: cookie wins if it points to a real membership;
  // otherwise the Brother.organizationId (legacy default).
  const activeCookie = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const cookieOrgId = activeCookie ? Number(activeCookie) : NaN;
  const cookieValid = Number.isInteger(cookieOrgId) &&
    memberships.some(m => m.organizationId === cookieOrgId);
  const activeOrgId = cookieValid ? cookieOrgId : brother.organizationId;

  return {
    id: brother.id,
    role: brother.role,
    name: brother.name,
    /** @deprecated use isPlatformAdmin. Kept for compatibility during Phase 0→1 migration. */
    isAdmin: brother.isAdmin,
    isPlatformAdmin,
    orgId: activeOrgId,
    memberships,
    authUserId: user.id,
    email: user.email ?? null,
  };
}
