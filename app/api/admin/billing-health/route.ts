// Billing health — the reader for the two dead-letter tables.
//
// ── Why this route exists ────────────────────────────────────────────────────
//
// The billing code carefully writes evidence whenever something goes wrong and
// nobody could read any of it.
//
//   OrphanedSubscription  written when deleteOrg fails to cancel a Stripe
//                         subscription. The schema comment explains the stakes:
//                         "a transient network blip becomes an invisible,
//                         indefinite charge to someone whose org no longer
//                         exists". The row is the only trace, and `resolvedAt`
//                         had nothing that could ever set it.
//
//   StripeEvent.error     written when a webhook delivery throws. "The row
//                         staying unprocessed with an error is the signal to
//                         investigate" — but nothing surfaced it, so after
//                         Stripe gives up retrying (about three days) a dropped
//                         billing event was invisible forever.
//
// Both were write-only: no route, no page, no script, discoverable only by
// someone remembering to SELECT against production.
//
// ── Privileged client ────────────────────────────────────────────────────────
//
// Same reasoning as /api/admin/orgs. Both tables are GLOBAL (no organizationId
// to scope by — the org is gone by design in the orphan case), and this handler
// has no active org, so there is no app.org_id to SET LOCAL.
import type Stripe from "stripe";
import { prismaPrivileged as prisma } from "@/lib/prisma-privileged"; // lint-modules:ignore (cross-org platform-admin surface, BYPASSRLS by design)
import { requireAdmin } from "@/lib/auth/require-admin";
import { toResponse, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { stripe, stripeEnabled } from "@/lib/stripe";

const MAX_ROWS = 100;

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    const [orphans, failedEvents] = await Promise.all([
      prisma.orphanedSubscription.findMany({ // lint-direct-prisma:ignore (global table, platform-admin surface)
        where:   { resolvedAt: null },
        orderBy: { failedAt: "desc" },
        take:    MAX_ROWS,
      }),
      // Unprocessed-with-an-error is the interesting set. A row with an error
      // that LATER succeeded has processedAt set and error cleared by
      // markProcessed, so it correctly drops out of this list on its own.
      prisma.stripeEvent.findMany({ // lint-direct-prisma:ignore (global table, platform-admin surface)
        where:   { error: { not: null } },
        orderBy: { receivedAt: "desc" },
        take:    MAX_ROWS,
      }),
    ]);

    return Response.json({
      // Non-null billing state means someone is being charged for nothing.
      orphans: orphans.map(o => ({
        id:                   o.id,
        stripeSubscriptionId: o.stripeSubscriptionId,
        stripeCustomerId:     o.stripeCustomerId,
        organizationId:       o.organizationId,
        orgName:              o.orgName,
        orgSlug:              o.orgSlug,
        lastError:            o.lastError,
        failedAt:             o.failedAt.toISOString(),
      })),
      failedEvents: failedEvents.map(e => ({
        id:          e.id,
        type:        e.type,
        receivedAt:  e.receivedAt.toISOString(),
        processedAt: e.processedAt?.toISOString() ?? null,
        error:       e.error,
      })),
      billingEnabled: stripeEnabled(),
    });
  } catch (e) {
    logError(e, { route: "/api/admin/billing-health", method: "GET", userId: user.id });
    return toResponse(e);
  }
}

/**
 * Drain the orphan queue.
 *
 * Two actions, because there are two genuinely different situations:
 *
 *   cancel  Retry the cancellation that failed during org deletion. This is the
 *           one that stops the money. A subscription Stripe reports as already
 *           gone counts as success — `resource_missing` means the original
 *           cancel probably landed and only the response was lost, which is the
 *           likeliest way one of these rows gets written in the first place.
 *
 *   resolve Mark it handled without calling Stripe, for anything cancelled by
 *           hand in the Dashboard. The row is bookkeeping; a human confirming
 *           it is a legitimate way to close it.
 *
 * Deliberately narrow. This does not refund, and it cannot touch a live org's
 * subscription — every row here belongs to an organization that no longer
 * exists.
 */
export async function POST(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    const action = String(body?.action ?? "");

    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("A numeric orphan id is required");
    if (action !== "cancel" && action !== "resolve") {
      throw new ValidationError('action must be "cancel" or "resolve"');
    }

    const row = await prisma.orphanedSubscription.findUnique({ where: { id } }); // lint-direct-prisma:ignore (global table, platform-admin surface)
    if (!row) throw new ValidationError("No such orphaned subscription");
    if (row.resolvedAt) return Response.json({ ok: true, alreadyResolved: true });

    if (action === "resolve") {
      await prisma.orphanedSubscription.update({ // lint-direct-prisma:ignore (global table, platform-admin surface)
        where: { id },
        data:  { resolvedAt: new Date() },
      });
      return Response.json({ ok: true, cancelled: false });
    }

    if (!stripeEnabled()) throw new ValidationError("Billing is not configured on this deployment");

    try {
      await stripe().subscriptions.cancel(row.stripeSubscriptionId, {
        // Matches deleteOrg: they had the service for the period they paid for.
        prorate: false,
      });
    } catch (e) {
      // Already gone is the success case, not a failure — see the note above.
      if (!isResourceMissing(e)) {
        const reason = e instanceof Error ? e.message : String(e);
        logError(e, {
          route: "/api/admin/billing-health", method: "POST", userId: user.id,
          extra: { orphanId: id, stripeSubscriptionId: row.stripeSubscriptionId },
        });
        // Record the newest reason so a repeated failure is distinguishable from
        // the original one, and leave the row open.
        await prisma.orphanedSubscription.update({ // lint-direct-prisma:ignore (global table, platform-admin surface)
          where: { id },
          data:  { lastError: reason },
        });
        return Response.json({ ok: false, error: reason }, { status: 502 });
      }
    }

    await prisma.orphanedSubscription.update({ // lint-direct-prisma:ignore (global table, platform-admin surface)
      where: { id },
      data:  { resolvedAt: new Date() },
    });
    return Response.json({ ok: true, cancelled: true });
  } catch (e) {
    logError(e, { route: "/api/admin/billing-health", method: "POST", userId: user.id });
    return toResponse(e);
  }
}

/** Stripe's "this object doesn't exist" — for us, proof the cancel already happened. */
function isResourceMissing(e: unknown): boolean {
  return typeof e === "object" && e !== null
    && (e as Stripe.errors.StripeError).code === "resource_missing";
}
