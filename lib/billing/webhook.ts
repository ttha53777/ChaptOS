/**
 * Stripe webhook handling — everything except signature verification, which
 * stays in the route because it needs the raw request body.
 *
 * ── Why this runs privileged ─────────────────────────────────────────────────
 *
 * A Stripe delivery has no session, no org cookie, and no RequestContext. The
 * normal client connects as `figurints_app`, which is NOBYPASSRLS, and the new
 * billing tables carry enforcing `org_isolation` policies keyed on
 * `app.org_id` — a setting only db(orgId) issues. So webhook writes go through
 * prismaPrivileged, exactly like the other pre-auth bootstrap paths (claim,
 * redeem-invite, provisionOrg). Seat recounts, which happen *after* the org is
 * resolved, go back through the ordinary org-scoped client.
 *
 * ── Ordering ─────────────────────────────────────────────────────────────────
 *
 * Stripe explicitly does not guarantee event order — customer.subscription.created
 * can arrive after invoice.paid. Rather than reasoning about every interleaving,
 * any event that implies a subscription state change causes a fresh
 * `subscriptions.retrieve()` and we persist THAT. The event is a hint that
 * something changed; Stripe's current state is the truth.
 *
 * ── Stripe 22.x field locations ──────────────────────────────────────────────
 *
 * Two fields moved and the old paths no longer exist on the types:
 *   invoice.subscription        → invoice.parent.subscription_details.subscription
 *   subscription.current_period_end → subscription.items.data[i].current_period_end
 */

import type Stripe from "stripe";
import { db } from "@/lib/db";
import { logError } from "@/lib/observability";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { SubscriptionStatus } from "@/lib/state/subscription-status";
import { stripe } from "@/lib/stripe";
import { reconcileSeats } from "./sync";
import { tierForCount } from "./tiers";

/** Stripe event types this endpoint acts on. Anything else is acknowledged and ignored. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.upcoming",
] as const;

/**
 * Record the event id, or report that we've already handled it.
 *
 * Stripe retries for up to three days and makes no at-most-once promise, so this
 * is the difference between "billing state converges" and "an org gets three
 * activation events and three audit rows". The INSERT is the claim.
 *
 * ── The subtlety that makes this correct ─────────────────────────────────────
 *
 * A unique violation is NOT by itself proof of a replay. If a previous delivery
 * claimed the row and then failed while handling it, we returned 500 and asked
 * Stripe to retry — and that retry must be allowed through. Treating "row
 * exists" as "already done" would turn every transient handler failure into a
 * permanently dropped event, which is the exact failure the ledger exists to
 * prevent.
 *
 * So a claim is only refused when a prior delivery finished *successfully*
 * (processedAt set, no error recorded).
 *
 * Two concurrent deliveries of the same event can both proceed under this rule.
 * That is deliberate and safe: every handler writes absolute state pulled fresh
 * from Stripe rather than applying a delta, so running twice converges.
 *
 * @returns true if this delivery should be processed, false if it's a replay of
 *          one that already succeeded.
 */
export async function claimEvent(id: string, type: string): Promise<boolean> {
  try {
    await prismaPrivileged.stripeEvent.create({ data: { id, type } });
    return true;
  } catch (e) {
    // Any non-P2002 error is a real DB problem: rethrow so the route 500s and
    // Stripe redelivers, rather than us silently dropping an unrecorded event.
    if (!isUniqueViolation(e)) throw e;

    const prior = await prismaPrivileged.stripeEvent.findUnique({
      where:  { id },
      select: { processedAt: true, error: true },
    });
    return !(prior?.processedAt && !prior.error);
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Close out an event, recording an error string when handling failed. */
export async function markProcessed(id: string, error?: string): Promise<void> {
  await prismaPrivileged.stripeEvent.update({
    where: { id },
    data:  { processedAt: new Date(), error: error ?? null },
  }).catch(e => {
    // Bookkeeping only — never turn this into a retry of an event we handled.
    logError(e, { route: "lib/billing/webhook", method: "markProcessed", extra: { id } });
  });
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId = idOf(session.subscription);
      // A completed session with no subscription is a one-off payment, which
      // this product doesn't sell. Nothing to do.
      if (!subId) return;
      await applySubscription(await stripe().subscriptions.retrieve(subId), { activated: true });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await applySubscription(await stripe().subscriptions.retrieve(sub.id));
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      // Deleted subscriptions can't be re-retrieved into a useful state, so this
      // is the one case where the payload is the source of truth.
      await applySubscription(sub, { canceled: true });
      return;
    }

    case "invoice.paid": {
      const subId = subscriptionIdFromInvoice(event.data.object as Stripe.Invoice);
      if (!subId) return;
      // invoice.paid is the authoritative "they actually paid" signal, but the
      // subscription object is where status and period end live.
      await applySubscription(await stripe().subscriptions.retrieve(subId));
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const orgId = await resolveOrgId(invoice.parent?.subscription_details?.metadata ?? null, idOf(invoice.customer));
      if (!orgId) return;

      await prismaPrivileged.subscription.updateMany({
        where: { organizationId: orgId },
        data:  { status: SubscriptionStatus.PastDue },
      });
      await recordEvent(orgId, "billing.payment_failed", orgId, {
        stripeInvoiceId: invoice.id ?? null,
        amountDueCents:  invoice.amount_due ?? null,
      });
      return;
    }

    case "invoice.upcoming": {
      // Fires ahead of renewal — the last chance to correct the quantity before
      // Stripe finalises an invoice, and the closest thing to a cron this app
      // has for seat drift.
      const invoice = event.data.object as Stripe.Invoice;
      const orgId = await resolveOrgId(invoice.parent?.subscription_details?.metadata ?? null, idOf(invoice.customer));
      if (!orgId) return;
      await reconcileSeats(db(orgId));
      return;
    }
  }
}

/**
 * Write Stripe's current view of a subscription into our row.
 *
 * Idempotent by construction: it stores absolute state rather than applying a
 * delta, so replaying it any number of times converges on the same result.
 */
async function applySubscription(
  sub: Stripe.Subscription,
  opts: { activated?: boolean; canceled?: boolean } = {},
): Promise<void> {
  const orgId = await resolveOrgId(sub.metadata, idOf(sub.customer));
  if (!orgId) {
    // Not an error worth retrying: a subscription we can't attribute is either
    // from another product on the same Stripe account or belongs to a deleted
    // org. Log it and acknowledge.
    logError(new Error("stripe subscription could not be attributed to an org"), {
      route: "lib/billing/webhook", method: "applySubscription",
      extra: { subscriptionId: sub.id, customer: idOf(sub.customer) },
    });
    return;
  }

  const item = sub.items.data[0];
  const quantity = item?.quantity ?? 0;
  const status = opts.canceled ? SubscriptionStatus.Canceled : mapStatus(sub.status);
  const tier = tierForCount(quantity).id;

  const previous = await prismaPrivileged.subscription.findUnique({
    where:  { organizationId: orgId },
    select: { status: true, tier: true },
  });

  const data = {
    stripeCustomerId:     idOf(sub.customer),
    stripeSubscriptionId: sub.id,
    stripeItemId:         item?.id ?? null,
    stripePriceId:        item?.price?.id ?? null,
    status,
    tier,
    syncedQuantity:       quantity,
    // current_period_end lives on the ITEM in Stripe 22.x, not the subscription.
    currentPeriodEnd:     item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd:    sub.cancel_at_period_end ?? false,
  };

  await prismaPrivileged.subscription.upsert({
    where:  { organizationId: orgId },
    update: data,
    create: { organizationId: orgId, billableMembers: quantity, ...data },
  });

  // ── Audit trail ───────────────────────────────────────────────────────────
  // Only on transitions, so a renewal storm doesn't write a row per delivery.
  if (opts.activated || (previous?.status !== status && status === SubscriptionStatus.Active)) {
    await recordEvent(orgId, "billing.subscription_activated", orgId, {
      tier, priceCents: tierForCount(quantity).priceCents, members: quantity,
      stripeSubscriptionId: sub.id,
    });
  }
  if (status === SubscriptionStatus.Canceled && previous?.status !== SubscriptionStatus.Canceled) {
    await recordEvent(orgId, "billing.subscription_canceled", orgId, {
      tier, atPeriodEnd: sub.cancel_at_period_end ?? false,
    });
  }
  if (previous && previous.tier !== tier) {
    await recordEvent(orgId, "billing.tier_changed", orgId, {
      fromTier: previous.tier, toTier: tier, members: quantity,
      priceCents: tierForCount(quantity).priceCents,
    });
  }
}

/**
 * Stripe status → ours.
 *
 * `incomplete` / `incomplete_expired` mean the first payment never landed, which
 * for entitlement purposes is indistinguishable from never having subscribed —
 * so they map to `free` rather than inventing states nobody acts on. `paused`
 * (no payment method) maps to past_due: growth blocked, data untouched.
 */
function mapStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":   return SubscriptionStatus.Active;
    case "trialing": return SubscriptionStatus.Trialing;
    case "past_due": return SubscriptionStatus.PastDue;
    case "unpaid":   return SubscriptionStatus.Unpaid;
    case "canceled": return SubscriptionStatus.Canceled;
    case "paused":   return SubscriptionStatus.PastDue;
    default:         return SubscriptionStatus.Free;
  }
}

/**
 * Which org does this event belong to?
 *
 * Metadata first — it's set on both the Customer and the Subscription at
 * creation, so it survives everything. The customer-id lookup is the fallback
 * for anything created outside this app (a subscription set up by hand in the
 * Dashboard, say).
 */
async function resolveOrgId(
  metadata: Stripe.Metadata | null | undefined,
  customerId: string | null,
): Promise<number | null> {
  const raw = metadata?.organizationId;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  if (!customerId) return null;

  const row = await prismaPrivileged.subscription.findFirst({
    where:  { stripeCustomerId: customerId },
    select: { organizationId: true },
  });
  return row?.organizationId ?? null;
}

/** Stripe fields are `string | Expanded | null`; we only ever want the id. */
function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Append an OperationalEvent without a RequestContext.
 *
 * emit() needs a ctx that a webhook cannot have, so this mirrors the local
 * helpers in the other pre-auth routes (emitRedeemEvent in redeem-invite,
 * emitClaimEvent in claim). Deliberately no ActivityLog dual-write: a member's
 * feed should not narrate the org's billing.
 *
 * Best-effort — telemetry must never fail an event we already applied.
 */
async function recordEvent(
  orgId: number,
  action: string,
  subjectId: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await prismaPrivileged.operationalEvent.create({
      data: {
        organizationId: orgId,
        requestId:      `stripe-webhook-${Date.now()}`,
        actorId:        null,
        action,
        subjectType:    "Subscription",
        subjectId,
        metadata:       metadata as never,
      },
    });
  } catch (e) {
    logError(e, { route: "lib/billing/webhook", method: "recordEvent", extra: { orgId, action } });
  }
}

/** invoice.subscription is gone in Stripe 22.x — it lives under parent now. */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription);
}
