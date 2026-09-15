/** Membership events reconcile billable seats. Admission decisions are persisted
 * with an outbox and retry when reconciliation fails; other events retain the
 * existing best-effort dispatch and billing-page reconciliation behavior.
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
async function sync(ctx: RequestContext, retryOnFailure = false): Promise<void> {
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
    if (retryOnFailure) throw new Error("Seat sync remains pending");
  }
}

on("brother.added", async (ctx) => {
  await sync(ctx);
});

// Required follow-up: report a failed sync to the durable admission worker.
on("join_request.approved", async (ctx) => {
  await sync(ctx, true);
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
