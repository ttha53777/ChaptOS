/**
 * Writing Stripe's view of a subscription into our row.
 *
 * Split out of webhook.ts because there are now two ways this runs:
 *
 *   push — Stripe tells us something changed (lib/billing/webhook.ts)
 *   pull — we ask Stripe what's true, because a delivery may have been lost
 *          (refreshFromStripe in lib/billing/sync.ts)
 *
 * The split is also what keeps the imports acyclic: webhook.ts already imports
 * reconcileSeats from ./sync, so sync.ts cannot import back from webhook.ts.
 * Both import from here instead.
 *
 * ── Why this runs privileged ─────────────────────────────────────────────────
 *
 * Neither caller can rely on `app.org_id` being set: a Stripe delivery has no
 * session at all, and the pull path resolves its org from the subscription
 * rather than from the request. `Subscription` ships an enforcing `org_isolation`
 * policy with no permissive fallback, so the ordinary `figurints_app` client
 * sees zero rows here rather than erroring — which reads as real data. Verified
 * against the live DB: as the app role with no app.org_id, Subscription and
 * SalesLead return 0 rows while the legacy tables still return everything.
 *
 * ── Stripe 22.x field locations ──────────────────────────────────────────────
 *
 * Two fields moved and the old paths no longer exist on the types:
 *   invoice.subscription            → invoice.parent.subscription_details.subscription
 *   subscription.current_period_end → subscription.items.data[i].current_period_end
 */

import type Stripe from "stripe";
import { logError } from "@/lib/observability";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { SubscriptionStatus } from "@/lib/state/subscription-status";
import { tierForCount } from "./tiers";

/**
 * Write Stripe's current view of a subscription into our row.
 *
 * Idempotent by construction: it stores absolute state rather than applying a
 * delta, so replaying it any number of times converges on the same result. That
 * is what makes it safe to run from both the webhook and the pull path, even
 * concurrently.
 */
export async function applySubscription(
  sub: Stripe.Subscription,
  opts: { activated?: boolean; canceled?: boolean } = {},
): Promise<void> {
  const orgId = await resolveOrgId(sub.metadata, idOf(sub.customer));
  if (!orgId) {
    // Not an error worth retrying: a subscription we can't attribute is either
    // from another product on the same Stripe account or belongs to a deleted
    // org. Log it and acknowledge.
    logError(new Error("stripe subscription could not be attributed to an org"), {
      route: "lib/billing/apply", method: "applySubscription",
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
  // This is also what keeps the pull path quiet: re-applying state that already
  // matches writes no events at all.
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
export function mapStatus(status: Stripe.Subscription.Status): string {
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
export async function resolveOrgId(
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
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Append an OperationalEvent without a RequestContext.
 *
 * emit() needs a ctx that neither caller has, so this mirrors the local helpers
 * in the pre-auth routes (emitRedeemEvent in redeem-invite, emitClaimEvent in
 * claim). Deliberately no ActivityLog dual-write: a member's feed should not
 * narrate the org's billing.
 *
 * Best-effort — telemetry must never fail an event we already applied.
 */
export async function recordEvent(
  orgId: number,
  action: string,
  subjectId: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await prismaPrivileged.operationalEvent.create({
      data: {
        organizationId: orgId,
        requestId:      `stripe-${Date.now()}`,
        actorId:        null,
        action,
        subjectType:    "Subscription",
        subjectId,
        metadata:       metadata as never,
      },
    });
  } catch (e) {
    logError(e, { route: "lib/billing/apply", method: "recordEvent", extra: { orgId, action } });
  }
}
