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
import { db } from "@/lib/db"; // lint-modules:ignore (platform-admin repair lever; no active org, so no buildContext)
import { NotFoundError, ValidationError, toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { SELF_SERVE_MAX, formatPrice, tierForCount } from "@/lib/billing/tiers";
import { reconcileSeats, refreshFromStripe } from "@/lib/billing/sync";

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

/**
 * POST /api/admin/orgs — force a full billing reconcile for one org.
 *
 * The only repair lever platform admins had was cookie-switching `active_org_id`
 * into the broken org and pressing the customer's own buttons, because this
 * surface was GET-only. That is a bad shape for support: it needs an
 * undocumented trick, and it leaves no trace that support touched anything.
 *
 * Deliberately the SAME operation an org admin can already run on their own
 * billing page (`POST /api/billing/sync`) — pull Stripe's state in, push the
 * seat count back out. It grants no new power; it just makes the existing one
 * reachable from the table that shows the problem. In particular it cannot set a
 * status, comp an org, or change what anyone is charged.
 *
 * This is exactly the repair for the failure mode f9b18ac was written for: an
 * org whose `checkout.session.completed` was lost, sitting at `free` after
 * paying, walled by the seat gate.
 */
export async function POST(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = Number(body?.orgId);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      throw new ValidationError("A numeric orgId is required");
    }

    const org = await prisma.organization.findUnique({ // lint-direct-prisma:ignore (cross-tenant platform-admin surface)
      where: { id: orgId }, select: { id: true },
    });
    if (!org) throw new NotFoundError("Organization");

    // db(orgId) rather than the privileged client: reconcileSeats counts members
    // and writes the Subscription row, and both must go through the org-scoped
    // wrapper so RLS sees app.org_id. Never throws for a Stripe-side failure —
    // it reports `pending` instead.
    const scoped = db(orgId);
    const refreshed = await refreshFromStripe(scoped);
    const result = await reconcileSeats(scoped);

    return Response.json({ refreshed, ...result });
  } catch (e) {
    logError(e, { route: "/api/admin/orgs", method: "POST", userId: user.id });
    return toResponse(e);
  }
}

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
