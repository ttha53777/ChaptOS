/**
 * Keeping Stripe and our row in step, in both directions.
 *
 *   push — reconcileSeats / flushPendingSeatSync: our headcount → Stripe
 *   pull — refreshFromStripe / refreshIfStale: Stripe's status → our row
 *
 * The push keeps the invoice honest. The pull keeps the seat gate honest: it
 * reads a cached status, so a lost webhook would otherwise wall a paying org
 * permanently. See refreshFromStripe for why that failure is the likely one.
 *
 * ── Ordering is the whole design ─────────────────────────────────────────────
 *
 * Local DB write first, Stripe call second. Always.
 *
 * The seat-sync handler runs inside dispatchHandlers, which races every handler
 * against a 3s timeout and swallows what it catches (lib/events/dispatch.ts). A
 * Stripe round-trip can lose that race. If Stripe went first, a slow call would
 * silently drop the headcount and the org would keep being billed for the wrong
 * number of people with nothing anywhere recording that fact.
 *
 * With the local write first, the worst case is a `seatSyncPendingAt` timestamp
 * sitting in the DB — a durable, queryable "a push is owed" flag that three
 * separate paths know how to clear:
 *
 *   GET  /api/billing          opportunistic flush when an admin opens billing
 *   POST /api/billing/sync     manual, for support
 *   invoice.upcoming webhook   before Stripe finalises the next invoice
 *
 * There is no cron in this app, which is exactly why there are three.
 *
 * ── Proration ────────────────────────────────────────────────────────────────
 *
 * Both directions push immediately; only the proration behaviour differs.
 *
 *   growing   create_prorations — charged pro-rata for the rest of the period,
 *                                 so revenue tracks reality the day it changes.
 *   shrinking none              — no mid-cycle credit; the smaller quantity is
 *                                 in effect and next month's invoice is cheaper.
 *
 * Subscriptions bill in advance, so "none" on a shrink IS the "downgrade takes
 * effect at period end" behaviour — they keep what they already paid for and the
 * saving lands on the next invoice. Nobody gets a surprise credit-then-recharge.
 */

import type Stripe from "stripe";
import type { db } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { logError } from "@/lib/observability";
import { isInGoodStanding } from "@/lib/state/subscription-status";
import { applySubscription } from "./apply";
import { tierForCount } from "./tiers";
import { countBillableMembers } from "./seats";

type ScopedDb = ReturnType<typeof db>;

export interface SeatSyncResult {
  /** True billable headcount, always freshly computed and always persisted. */
  members: number;
  /** Band that headcount implies. */
  tier: string;
  /** Band recorded before this run — differs from `tier` when a band was crossed. */
  previousTier: string;
  /** Whether a quantity update actually reached Stripe on this run. */
  pushed: boolean;
  /** Whether a push is still owed (Stripe unreachable, or nothing to push to). */
  pending: boolean;
  /** Set when the Stripe leg failed; the local write still succeeded. */
  error?: string;
}

/**
 * Recompute the headcount, persist it, and push the quantity to Stripe if there
 * is a live subscription to push to.
 *
 * Never throws for a Stripe-side failure: the caller is usually an event handler
 * reacting to a member being added, and a Stripe outage must not turn into a
 * failed roster write. Local state is authoritative and self-healing.
 */
export async function reconcileSeats(scoped: ScopedDb): Promise<SeatSyncResult> {
  const members = await countBillableMembers(scoped);
  const band = tierForCount(members);

  const existing = await scoped.subscription.findFirst({
    select: {
      status: true, tier: true, syncedQuantity: true,
      stripeSubscriptionId: true, stripeItemId: true,
    },
  });

  const previousTier = existing?.tier ?? "free";
  const canPush = Boolean(existing?.stripeItemId) && stripeEnabled();
  const needsPush = canPush && existing?.syncedQuantity !== members;

  // ── 1. Local write. Fast, always succeeds, never waits on the network. ─────
  // seatSyncPendingAt is set up-front whenever a push is owed, so a crash
  // between here and the Stripe call still leaves the "owed" flag behind.
  await scoped.subscription.upsert({
    billableMembers:   members,
    tier:              band.id,
    seatSyncPendingAt: needsPush ? new Date() : null,
  });

  if (!needsPush) {
    return { members, tier: band.id, previousTier, pushed: false, pending: false };
  }

  // ── 2. Stripe. Best-effort. ───────────────────────────────────────────────
  try {
    // No idempotency key on purpose: this is a set-to-value operation, so a
    // retry is semantically harmless, whereas a key derived from the quantity
    // would wrongly dedupe a legitimate 5 → 6 → 5 sequence against Stripe's
    // 24h idempotency cache and leave the item stuck at the stale value.
    await stripe().subscriptionItems.update(existing!.stripeItemId!, {
      quantity: members,
      proration_behavior:
        members > (existing!.syncedQuantity ?? 0) ? "create_prorations" : "none",
    });

    await scoped.subscription.upsert({
      billableMembers:   members,
      tier:              band.id,
      syncedQuantity:    members,
      seatSyncPendingAt: null,
    });

    return { members, tier: band.id, previousTier, pushed: true, pending: false };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    logError(e, { route: "lib/billing/sync", method: "reconcileSeats", extra: { orgId: scoped.orgId, members } });
    // seatSyncPendingAt is already set; one of the three reconcile paths retries.
    return { members, tier: band.id, previousTier, pushed: false, pending: true, error: reason };
  }
}

/**
 * Flush a push that a previous run left owed, and do nothing otherwise.
 *
 * The opportunistic path: cheap enough to call on every billing page load
 * because the common case is one indexed read that finds nothing to do.
 */
export async function flushPendingSeatSync(scoped: ScopedDb): Promise<SeatSyncResult | null> {
  const sub = await scoped.subscription.findFirst({ select: { seatSyncPendingAt: true } });
  if (!sub?.seatSyncPendingAt) return null;
  return reconcileSeats(scoped);
}

/**
 * Stripe statuses that mean "this subscription is still a thing".
 *
 * Wider than `isInGoodStanding`, and deliberately so — the two questions are
 * different. Good standing asks "may this org grow?"; this asks "would a second
 * checkout create a duplicate?". A `past_due` subscription is not in good
 * standing but is very much still live, and subscribing again on top of it would
 * bill the org twice.
 *
 * `incomplete` counts as live: its first payment may still succeed. Only
 * `canceled` and `incomplete_expired` are terminal.
 */
const LIVE_STRIPE_STATUSES: readonly Stripe.Subscription.Status[] = [
  "active", "trialing", "past_due", "unpaid", "paused", "incomplete",
];

/**
 * The org's live subscription according to Stripe, or null if it has none.
 *
 * Exists because our `stripeSubscriptionId` answers a subtly different question:
 * it records the last subscription we heard about, which is neither current (a
 * lost webhook) nor necessarily alive (a cancellation). Checkout has to know
 * whether charging this customer again would double-bill them, and only Stripe
 * knows that.
 *
 * Unlike the rest of this module this one DOES throw on a Stripe failure. It
 * guards a payment: refusing to answer has to block checkout, not wave it
 * through, and the caller cannot reach Stripe for the session either way.
 */
export async function findLiveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
  const { data } = await stripe().subscriptions.list({
    customer: customerId,
    status:   "all",
    // Enough to see past a history of cancelled subscriptions to a live one.
    limit:    20,
  });
  return data.find(s => LIVE_STRIPE_STATUSES.includes(s.status)) ?? null;
}

/**
 * Pull Stripe's view of the subscription back into our row.
 *
 * ── Why this has to exist ────────────────────────────────────────────────────
 *
 * Subscription.status is a cache of Stripe's state, and the seat gate reads only
 * that cache. Every other path that touches it is push-only, so a single lost
 * webhook delivery leaves the cache wrong permanently — Stripe gives up after
 * about three days, and nothing here ever asked again.
 *
 * The damaging direction is the likely one. A lost `checkout.session.completed`
 * leaves an org that just paid sitting at status "free", still blocked by the
 * seat wall, with no self-serve way out: the billing page's recheck button only
 * pushes seat counts outward, and the admin surface is read-only.
 *
 * ── Finding the subscription ─────────────────────────────────────────────────
 *
 * The customer-id fallback is the whole point, not a nicety. In exactly the case
 * above we never recorded a stripeSubscriptionId (that write is the webhook's
 * job) — but we DID record the customer id, because startCheckout persists it
 * before redirecting so a retry can't create a second Customer. That one field
 * is what makes the org recoverable.
 *
 * Never throws, for the same reason reconcileSeats doesn't: a Stripe outage must
 * not break the billing page that explains the problem.
 *
 * @returns true if Stripe returned a subscription and we applied it.
 */
export async function refreshFromStripe(scoped: ScopedDb): Promise<boolean> {
  if (!stripeEnabled()) return false;

  const existing = await scoped.subscription.findFirst({
    select: { stripeSubscriptionId: true, stripeCustomerId: true },
  });
  if (!existing?.stripeSubscriptionId && !existing?.stripeCustomerId) return false;

  try {
    const sub = existing.stripeSubscriptionId
      ? await stripe().subscriptions.retrieve(existing.stripeSubscriptionId)
      : (await stripe().subscriptions.list({
          customer: existing.stripeCustomerId!,
          status:   "all",
          limit:    1,
        })).data[0];

    if (!sub) return false;

    // applySubscription writes absolute state and only records audit events on a
    // real transition, so re-applying state that already matches is a no-op.
    await applySubscription(sub);
    return true;
  } catch (e) {
    logError(e, { route: "lib/billing/sync", method: "refreshFromStripe", extra: { orgId: scoped.orgId } });
    return false;
  }
}

/**
 * Pull only when the local row looks like it lost a delivery.
 *
 * Cheap enough for the billing page's hot path: a healthy subscription never
 * pays a Stripe round-trip, because the states worth re-checking are exactly the
 * ones a lost webhook produces — a customer with no subscription recorded
 * (checkout completed but we never heard), or a subscription that isn't in good
 * standing (a recovery we may have missed).
 */
export async function refreshIfStale(scoped: ScopedDb): Promise<boolean> {
  if (!stripeEnabled()) return false;

  const sub = await scoped.subscription.findFirst({
    select: { status: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!sub?.stripeCustomerId) return false;

  const suspect = !sub.stripeSubscriptionId || !isInGoodStanding(sub.status);
  if (!suspect) return false;

  return refreshFromStripe(scoped);
}
