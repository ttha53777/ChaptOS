// PRIVILEGED client (DIRECT_URL / BYPASSRLS), not the app-role one.
//
// This is a cross-tenant read with no active org, so there is no app.org_id to
// SET LOCAL — and the billing tables ship enforcing `org_isolation` with no
// permissive allow_all, so the app role sees ZERO rows through them. Reading
// with the normal client silently reported every org as free with 0 members,
// which is worse than an error because it looks like data.
//
// Organization and Brother happen to still carry a legacy allow_all policy, so
// they would read fine either way; routing the whole handler through one
// privileged client keeps it correct when that policy is eventually dropped.
import { prismaPrivileged as prisma } from "@/lib/prisma-privileged"; // lint-modules:ignore (cross-org platform-admin surface, BYPASSRLS by design)
import { requireAdmin } from "@/lib/auth/require-admin";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { SELF_SERVE_MAX, formatPrice, tierForCount } from "@/lib/billing/tiers";

// GET /api/admin/orgs — cross-org list for PlatformAdmin audit.
//
// Returns every org ordered by createdAt desc, plus the founder's display
// name (joined via Organization.createdByBrotherId) and its billing state.
// Read-only; no mutation surface. Bypasses the org-scoped db() wrapper
// deliberately — the whole point is to see across tenants.
//
// Billing figures come from the stored Subscription row rather than a live
// recount: a headcount query per org would be 200 round-trips to render one
// table, and Subscription.billableMembers is kept current by the seat-sync
// handler. An org that has never touched billing has no row and reads as free.

const MAX_ROWS = 200;

/** Fraction of the self-serve ceiling past which an org is worth a sales look. */
const NEAR_LIMIT_RATIO = 0.85;

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    // Cross-tenant audit query — db(orgId) does not fit the use case.
    const rows = await prisma.organization.findMany({ // lint-direct-prisma:ignore (cross-tenant audit)
      take: MAX_ROWS,
      orderBy: { createdAt: "desc" },
      select: {
        id:                 true,
        name:               true,
        slug:               true,
        orgType:            true,
        createdAt:          true,
        createdByBrotherId: true,
        subscription: {
          select: {
            status: true, tier: true, billableMembers: true,
            currentPeriodEnd: true, cancelAtPeriodEnd: true, seatSyncPendingAt: true,
          },
        },
      },
    });

    // Resolve founder names in one round-trip rather than N joins.
    const founderIds = rows
      .map(r => r.createdByBrotherId)
      .filter((id): id is number => id !== null);
    const founders = founderIds.length
      ? await prisma.brother.findMany({ // lint-direct-prisma:ignore (cross-tenant audit)
          where:  { id: { in: founderIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(founders.map(f => [f.id, f.name]));

    return Response.json({
      orgs: rows.map(r => {
        const members = r.subscription?.billableMembers ?? 0;
        const band = tierForCount(members);
        return {
          id:          r.id,
          name:        r.name,
          slug:        r.slug,
          orgType:     r.orgType,
          createdAt:   r.createdAt.toISOString(),
          founderName: r.createdByBrotherId !== null ? nameById.get(r.createdByBrotherId) ?? null : null,
          billing: {
            status:            r.subscription?.status ?? "free",
            tier:              r.subscription?.tier ?? band.id,
            members,
            priceLabel:        formatPrice(band.priceCents),
            currentPeriodEnd:  r.subscription?.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: r.subscription?.cancelAtPeriodEnd ?? false,
            // A push to Stripe is owed. Non-null here means seat drift that none
            // of the three reconcile paths has cleared yet — worth a look.
            seatSyncPending:   r.subscription?.seatSyncPendingAt !== null && r.subscription?.seatSyncPendingAt !== undefined,
            // Approaching the point where they stop being able to self-serve.
            nearLimit:         members >= SELF_SERVE_MAX * NEAR_LIMIT_RATIO,
          },
        };
      }),
    });
  } catch (e) {
    logError(e, { route: "/api/admin/orgs", method: "GET", userId: user.id });
    return toResponse(e);
  }
}
