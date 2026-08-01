/**
 * Stripe webhook handling — everything except signature verification, which
 * stays in the route because it needs the raw request body, and the write
 * itself, which lives in ./apply so the pull path can share it.
 *
 * This module is now just the event→action mapping: which Stripe events matter,
 * what each one should re-read, and the delivery ledger that makes replays safe.
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
import { stripe } from "@/lib/stripe";
import { applySubscription, idOf, recordEvent, resolveOrgId } from "./apply";
import { reconcileSeats } from "./sync";

/**
 * Stripe event types this endpoint acts on. Anything else is acknowledged and
 * ignored.
 *
 * This is enforcing, not documentation: `handleStripeEvent` returns early for
 * anything not on the list. It used to be an exported constant with no consumers
 * at all, free to drift away from the switch below without anything noticing.
 */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "charge.dispute.created",
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

function isHandled(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

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
  if (!isHandled(event.type)) return;

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
      // This branch used to blind-write past_due, which made it the one handler
      // whose result depended on delivery ORDER — the exact thing the module
      // header says we don't reason about. Stripe retries for three days, so a
      // delayed or redelivered failure could land *after* the recovery
      // invoice.paid and stamp past_due on an org that had already paid, walling
      // it at the seat gate with no way to tell why.
      //
      // So: re-read the subscription and persist whatever Stripe says now,
      // exactly like every other branch. If the retry already succeeded we stay
      // active, correctly.
      //
      // The event row is written either way. The failure DID happen, and it is
      // the only durable trace of a card that is starting to go bad — useful
      // even when the state recovered by the time we heard about it.
      const invoice = event.data.object as Stripe.Invoice;
      const orgId = await resolveOrgId(invoice.parent?.subscription_details?.metadata ?? null, idOf(invoice.customer));

      const subId = subscriptionIdFromInvoice(invoice);
      if (subId) await applySubscription(await stripe().subscriptions.retrieve(subId));

      if (!orgId) return;
      await recordEvent(orgId, "billing.payment_failed", orgId, {
        stripeInvoiceId: invoice.id ?? null,
        amountDueCents:  invoice.amount_due ?? null,
      });
      return;
    }

    case "invoice.payment_action_required": {
      // 3-D Secure / SCA. The card is fine; the bank wants the cardholder to
      // confirm, and no amount of retrying gets past that — a person has to act.
      // Stripe puts the subscription in `incomplete` or `past_due` depending on
      // whether this is the first invoice, so let applySubscription decide rather
      // than guessing, and record the hosted invoice URL because that link is the
      // one thing that actually resolves it.
      const invoice = event.data.object as Stripe.Invoice;
      const orgId = await resolveOrgId(invoice.parent?.subscription_details?.metadata ?? null, idOf(invoice.customer));

      const subId = subscriptionIdFromInvoice(invoice);
      if (subId) await applySubscription(await stripe().subscriptions.retrieve(subId));

      if (!orgId) return;
      await recordEvent(orgId, "billing.payment_action_required", orgId, {
        stripeInvoiceId:  invoice.id ?? null,
        amountDueCents:   invoice.amount_due ?? null,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      });
      return;
    }

    case "charge.dispute.created": {
      // A chargeback. Deliberately does NOT touch entitlement: a dispute is a
      // claim, not a verdict, and Stripe sends the subscription events if it
      // decides to cancel. What we want is simply for the relationship ending
      // badly to leave a trace on our side instead of only in the Dashboard.
      //
      // A Dispute carries no customer, so the charge has to be fetched to find
      // out whose it was. One extra read on an event that fires approximately
      // never.
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = idOf(dispute.charge);
      if (!chargeId) return;

      const charge = await stripe().charges.retrieve(chargeId);
      const orgId = await resolveOrgId(null, idOf(charge.customer));
      if (!orgId) return;

      await recordEvent(orgId, "billing.dispute_opened", orgId, {
        stripeDisputeId: dispute.id,
        amountCents:     dispute.amount ?? null,
        reason:          dispute.reason ?? null,
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

/** invoice.subscription is gone in Stripe 22.x — it lives under parent now. */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription);
}
