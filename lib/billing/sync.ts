/**
 * Keeping Stripe's idea of an org's size in step with ours.
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

import type { db } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { logError } from "@/lib/observability";
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
