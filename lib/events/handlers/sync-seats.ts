/**
 * Seat sync — keep the billable headcount (and Stripe's copy of it) in step with
 * the roster.
 *
 * Runs as an event subscriber rather than inline in brother-service for two
 * reasons: services may not call other services, and a Stripe round-trip must
 * never sit in the critical path of adding a member. dispatchHandlers isolates
 * failures, so the worst a Stripe outage can do here is leave a
 * `seatSyncPendingAt` flag for one of the reconcile paths to pick up — it can
 * never fail the roster write that triggered it.
 *
 * ── What is NOT here ─────────────────────────────────────────────────────────
 *
 * Invite redemption and account claim also add billable people, but those two
 * paths are pre-auth bootstrap routes that write their OperationalEvent rows
 * directly (they have no RequestContext, so they cannot call emit()). No emit
 * means no dispatch, which means no handler. They call reconcileSeats themselves
 * — see app/api/auth/redeem-invite/route.ts and app/api/auth/claim/route.ts.
 */

import { on } from "../dispatch";
import { emit } from "../emit";
import { reconcileSeats } from "@/lib/billing/sync";
import type { RequestContext } from "@/lib/context/request-context";

/**
 * Recompute, persist, push — then record the outcome when it's noteworthy.
 *
 * Both emits are { activity: false }: a band change and a failed sync are
 * billing telemetry, not something that belongs in the members' activity feed.
 */
async function sync(ctx: RequestContext): Promise<void> {
  const result = await reconcileSeats(ctx.db);

  if (result.tier !== result.previousTier) {
    await emit(ctx, "billing.tier_changed", { type: "Subscription", id: ctx.orgId }, {
      fromTier:   result.previousTier,
      toTier:     result.tier,
      members:    result.members,
      priceCents: null,
    }, { activity: false });
  }

  if (result.pending) {
    // reconcileSeats already swallowed and logged the Stripe error. This row is
    // the durable evidence that a reconcile is owed.
    await emit(ctx, "billing.seat_sync_failed", { type: "Subscription", id: ctx.orgId }, {
      members: result.members,
      reason:  result.error ?? "unknown",
    }, { activity: false });
  }
}

on("brother.added", async (ctx) => {
  await sync(ctx);
});

// Approving a join request is the only way a roster GAINS a member now, so this
// is the seat-relevant event. Worth noting what it replaces: /api/auth/redeem-invite
// ran pre-auth with no ctx, so it got no handler dispatch and had to call
// reconcileSeats itself — awaited, with a long comment about serverless
// instances freezing after the response and losing the seatSyncPendingAt flag
// the whole self-healing design hangs off. Approval runs with a real ctx, so
// that hazard is gone with the route.
on("join_request.approved", async (ctx) => {
  await sync(ctx);
});

on("brother.removed", async (ctx) => {
  await sync(ctx);
});

on("membership.left", async (ctx) => {
  await sync(ctx);
});

on("brother.updated", async (ctx, { metadata }) => {
  // Most member edits (name, GPA, role) don't move the headcount. Archiving does
  // — it's the mechanism by which an org sheds graduated seniors — so this is the
  // one field change worth a recount.
  if (!metadata.changedFields.includes("archivedAt")) return;
  await sync(ctx);
});
