/**
 * Platform billing — what an org pays US.
 *
 * Firewalled from the dues/treasury services by design. Nothing in this file
 * reads or writes Transaction, DuesPayment, Reimbursement or Budget, and nothing
 * in those services knows this one exists. Two different kinds of money.
 *
 * Authority: every mutating entry point re-checks org-admin authority even
 * though the routes already gate on it, matching the defence-in-depth posture of
 * dues-service. A subscription is deliberately admin-only rather than gated on a
 * new MANAGE_BILLING permission bit — see assertCanManageBilling.
 */

import type Stripe from "stripe";
import { applySubscription, idOf } from "@/lib/billing/apply";
import { withBillingLock } from "@/lib/billing/lock";
import { BillingMode } from "@/lib/state/billing-mode";
import { selectedBand, subscriptionBand } from "@/lib/billing/plans";
import type { RequestContext } from "@/lib/context/request-context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { prismaPrivileged } from "@/lib/prisma-privileged"; // lint-direct-prisma:ignore cross-org membership count for group-plan detection
import { logError } from "@/lib/observability";
import { SUPPORT_EMAIL, emailAsText, gmailCompose, mailto, outlookCompose } from "@/lib/support";
import { SalesLeadKind } from "@/lib/state/sales-lead";
import { SubscriptionStatus } from "@/lib/state/subscription-status";
import { stripe, stripeEnabled, stripePriceId } from "@/lib/stripe";
import { checkSeatAvailable } from "@/lib/billing/guard";
import { countBillableMembers } from "@/lib/billing/seats";
import { findLiveSubscription, flushPendingSeatSync, reconcileSeats, refreshFromStripe, refreshIfStale, type SeatSyncResult } from "@/lib/billing/sync";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, formatRange, tierForCount } from "@/lib/billing/tiers";
import type { ChangePlanInput, OpenPortalInput, RequestQuoteInput, StartCheckoutInput } from "@/lib/validation/billing";

/**
 * Number of orgs one person must administer before we offer a group plan.
 *
 * Two rather than three: the second org is the point at which someone is paying
 * two separate invoices for what they experience as one relationship, which is
 * exactly when a conversation is worth having.
 */
const GROUP_PLAN_ORG_THRESHOLD = 2;

/**
 * Billing is org-admin authority, not a permission bit.
 *
 * Deliberately NOT a new MANAGE_BILLING flag: the bitfield has 14 of 32 bits
 * used and adding one costs a role-template migration plus a boot-time backfill
 * through instrumentation.ts, all to express something org-admin already means.
 * A Treasurer manages the chapter's money; the platform subscription is the
 * account holder's business.
 */
function assertCanManageBilling(ctx: RequestContext): void {
  if (ctx.isPlatformAdmin || ctx.isOrgAdmin) return;
  throw new ForbiddenError("Only an organization admin can manage billing");
}

export interface BillingSummary {
  members: number;
  billingMode: string;
  selectedPlan: string | null;
  capacity: number;
  scheduledPlan: string | null;
  planChangeAt: string | null;
  hasSubscription: boolean;
  tier: string;
  tierLabel: string;
  priceCents: number | null;
  priceLabel: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Can the org add one more member as things stand? */
  canAddMember: boolean;
  /** What clearing that block would take, when it is blocked. */
  blockedBy: "checkout" | "upgrade" | "quote" | null;
  /** Largest headcount reachable without talking to a human. */
  selfServeMax: number;
  /** This person administers enough orgs that a group plan is worth offering. */
  groupPlanEligible: boolean;
  /** False when the deployment has no Stripe keys — the UI hides paid affordances. */
  billingEnabled: boolean;
  /** Every band, for rendering a plan table without duplicating the numbers. */
  bands: Array<{ id: string; label: string; range: string; priceLabel: string }>;
}

/**
 * Everything the billing page needs, in one round trip.
 *
 * Also opportunistically flushes an owed seat push. That is deliberate: with no
 * cron in this app, an admin opening the billing page is one of only three
 * chances to reconcile drift, and it costs one indexed read in the common case
 * where nothing is pending.
 */
export async function getBillingSummary(ctx: RequestContext): Promise<BillingSummary> {
  assertCanManageBilling(ctx);

  // Pull first, then push. If a delivery was lost, the pull is what repairs
  // status/tier, and the push that follows is then working from a row that
  // actually reflects Stripe. Both are opportunistic and both no-op in the
  // healthy case; neither may break the page that explains the problem.
  await refreshIfStale(ctx.db).catch(e => {
    logError(e, { route: "lib/services/billing-service", method: "getBillingSummary", userId: ctx.actorId, extra: { orgId: ctx.orgId, stage: "refresh" } });
  });
  await flushPendingSeatSync(ctx.db).catch(e => {
    logError(e, { route: "lib/services/billing-service", method: "getBillingSummary", userId: ctx.actorId, extra: { orgId: ctx.orgId, stage: "seat_sync" } });
  });

  const [sub, members, seat, adminOrgCount] = await Promise.all([
    ctx.db.subscription.findFirst({
      select: { status: true, tier: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, billingMode: true, selectedPlan: true, scheduledPlan: true, planChangeAt: true, stripeSubscriptionId: true },
    }),
    countBillableMembers(ctx.db),
    checkSeatAvailable(ctx.db),
    countAdministeredOrgs(ctx.actorId),
  ]);

  const band = subscriptionBand(members, sub);

  return {
    members,
    billingMode: sub?.billingMode ?? BillingMode.Automatic,
    selectedPlan: sub?.selectedPlan ?? null,
    capacity: sub?.billingMode === BillingMode.Selected ? band.upTo ?? 4 : (sub?.status === SubscriptionStatus.Active || sub?.status === SubscriptionStatus.Trialing ? SELF_SERVE_MAX : 4),
    scheduledPlan: sub?.scheduledPlan ?? null,
    planChangeAt: sub?.planChangeAt?.toISOString() ?? null,
    hasSubscription: Boolean(sub?.stripeSubscriptionId),
    tier:              band.id,
    tierLabel:         band.label,
    priceCents:        band.priceCents,
    priceLabel:        formatPrice(band.priceCents),
    status:            sub?.status ?? SubscriptionStatus.Free,
    currentPeriodEnd:  sub?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    canAddMember:      seat.allowed,
    blockedBy:         seat.allowed ? null : seat.action,
    selfServeMax:      SELF_SERVE_MAX,
    groupPlanEligible: adminOrgCount >= GROUP_PLAN_ORG_THRESHOLD,
    billingEnabled:    stripeEnabled(),
    bands: BILLING_BANDS.map(b => ({
      id:         b.id,
      label:      b.label,
      range:      formatRange(b),
      priceLabel: formatPrice(b.priceCents),
    })),
  };
}

/**
 * How many orgs this person is an admin of.
 *
 * Necessarily a cross-org read, so it cannot go through ctx.db (which is bound
 * to one org by construction). Counts memberships only — never reads another
 * org's data, just how many rows carry this brotherId.
 *
 * Privileged on purpose. Membership lost its permissive policy in Phase 4
 * (20260622000001_phase4_drop_allow_all) and lib/prisma.ts pins app.org_id to ''
 * on every connection, so the plain client returns ZERO rows here rather than
 * erroring — which reads as "administers one org" and silently suppressed the
 * group-plan offer for everyone. Same reasoning, and the same fix, as the
 * cross-tenant reads in app/api/admin/**.
 */
async function countAdministeredOrgs(brotherId: number): Promise<number> {
  try {
    return await prismaPrivileged.membership.count({ where: { brotherId, isOrgAdmin: true } }); // lint-direct-prisma:ignore cross-org by design; counts this actor's own memberships only
  } catch (e) {
    // A group-plan nudge is not worth failing the billing page over. Returning 0
    // suppresses the offer, which is the safe direction — but log it, because
    // this is now the ONLY way a zero here can mean "we don't know".
    logError(e, { route: "lib/services/billing-service", method: "countAdministeredOrgs", userId: brotherId });
    return 0;
  }
}

/**
 * Start checkout at actual headcount (automatic) or the selected capacity.
 *
 * Amounts and quantities are derived server-side. A selected plan must cover
 * the existing roster; its entitlement is only applied from Stripe confirmation.
 */
export async function startCheckout(
  ctx: RequestContext,
  input: StartCheckoutInput,
  origin: string,
): Promise<{ url: string }> {
  assertCanManageBilling(ctx);
  if (!stripeEnabled()) throw new ValidationError("Billing is not configured on this deployment");

  const members = await countBillableMembers(ctx.db);
  const band = input.plan ? selectedBand(input.plan) : tierForCount(members);
  if (input.plan && members > band.upTo!) {
    throw new ValidationError("Choose a plan that covers your current active members.");
  }
  const quantity = input.plan ? band.upTo! : Math.max(1, members);

  if (band.priceCents === null) {
    throw new ValidationError(
      `Organizations above ${SELF_SERVE_MAX} members are priced individually — request a quote instead.`,
    );
  }

  const org = await ctx.db.organization.findFirst({ select: { id: true, name: true, slug: true } });
  if (!org) throw new NotFoundError("Organization");

  const existing = await ctx.db.subscription.findFirst({
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });

  // Ask Stripe whether a subscription is LIVE, rather than trusting our own row.
  //
  // The old guard was `if (existing?.stripeSubscriptionId) throw`, and it was
  // wrong in both directions. It read a field only the webhook writes, so a lost
  // delivery let a second checkout through; and it kept firing after a
  // cancellation, so an org that cancelled could never resubscribe — walled by
  // the seat gate and refused at the till, with the billing page pointing them at
  // a portal that has nothing to manage.
  //
  // One list call answers the question properly. It closes the common race (a
  // second admin, or a second tab, starting checkout after the first one
  // finished) but not two payments completing in the same instant — nothing
  // short of a lock would, and Stripe has no dedup for that. A duplicate that
  // does slip through is visible in /admin/orgs → billing health.
  if (existing?.stripeCustomerId) {
    const live = await findLiveSubscription(existing.stripeCustomerId);
    if (live) {
      throw new ValidationError("This organization already has a subscription — manage it in the billing portal.");
    }
  }

  const customerId = existing?.stripeCustomerId ?? await createCustomer(ctx, org);

  const back = input.returnPath ?? `/${org.slug}/billing`;
  const session = await stripe().checkout.sessions.create({
    mode:     "subscription",
    customer: customerId,
    allow_promotion_codes: true,
    line_items: [{ price: stripePriceId(), quantity }],
    // Metadata on the SUBSCRIPTION (not just the session) is what lets every
    // later webhook — renewals, failures, cancellations — resolve the org
    // without a lookup table.
    subscription_data: {
      metadata: { organizationId: String(ctx.orgId), orgSlug: org.slug, ...(input.plan ? { billingMode: BillingMode.Selected } : {}) },
    },
    metadata: { organizationId: String(ctx.orgId), orgSlug: org.slug },
    success_url: `${origin}${back}?checkout=success`,
    cancel_url:  `${origin}${back}?checkout=cancelled`,
    // Lets a returning customer reuse a saved card instead of retyping it.
    billing_address_collection: "auto",
  });

  if (!session.url) throw new ValidationError("Stripe did not return a checkout URL");

  // Persist the customer id now rather than waiting for the webhook: if the user
  // abandons checkout and starts again, we must not create a second Customer for
  // the same org.
  await ctx.db.subscription.upsert({
    stripeCustomerId: customerId,
    billableMembers:  members,
    tier:             tierForCount(members).id,
  });

  await emit(ctx, "billing.checkout_started", { type: "Subscription", id: ctx.orgId }, {
    tier: band.id, priceCents: band.priceCents, members, billingMode: input.plan ? BillingMode.Selected : BillingMode.Automatic,
  }, { activity: false });

  return { url: session.url };
}

async function createCustomer(
  ctx: RequestContext,
  org: { id: number; name: string; slug: string },
): Promise<string> {
  const customer = await stripe().customers.create({
    name:  org.name,
    email: ctx.actorEmail ?? undefined,
    metadata: { organizationId: String(org.id), orgSlug: org.slug },
  }, {
    // One Customer per org, even if two admins hit checkout simultaneously or a
    // response is lost and retried.
    idempotencyKey: `customer:org:${org.id}`,
  });
  return customer.id;
}

/**
 * Stripe-hosted Billing Portal: card updates, invoice history, cancellation.
 *
 * Everything post-conversion is deliberately Stripe's problem. Rebuilding card
 * management would mean handling PCI scope for no benefit, and the portal is
 * also where Stripe's own dunning emails send people.
 */
export async function openPortal(
  ctx: RequestContext,
  input: OpenPortalInput,
  origin: string,
): Promise<{ url: string }> {
  assertCanManageBilling(ctx);
  if (!stripeEnabled()) throw new ValidationError("Billing is not configured on this deployment");

  const [sub, org] = await Promise.all([
    ctx.db.subscription.findFirst({ select: { stripeCustomerId: true } }),
    ctx.db.organization.findFirst({ select: { slug: true } }),
  ]);
  if (!sub?.stripeCustomerId) {
    throw new ValidationError("This organization has no billing account yet — start a subscription first.");
  }

  const back = input.returnPath ?? `/${org?.slug ?? ""}/billing`;
  const session = await stripe().billingPortal.sessions.create({
    customer:   sub.stripeCustomerId,
    return_url: `${origin}${back}`,
  });

  return { url: session.url };
}

export interface QuoteResult {
  leadId: number;
  /** Prefilled compose links so the requester can also mail us directly. */
  draft: {
    to: string;
    subject: string;
    body: string;
    mailto: string;
    gmail: string;
    outlook: string;
    outlookSchool: string;
    text: string;
  };
}

/**
 * Record a "talk to us" request and hand back a prefilled mail draft.
 *
 * The row is written FIRST and is the durable record; the draft is a courtesy
 * copy. That ordering is the whole point — the existing /contact page is
 * client-side compose links only, so a lead that never gets sent is a lead that
 * never existed. Now closing the compose window loses nothing.
 */
export async function requestQuote(ctx: RequestContext, input: RequestQuoteInput): Promise<QuoteResult> {
  assertCanManageBilling(ctx);

  const [members, org] = await Promise.all([
    countBillableMembers(ctx.db),
    ctx.db.organization.findFirst({ select: { name: true, slug: true } }),
  ]);
  if (!org) throw new NotFoundError("Organization");

  const contactName  = input.name ?? ctx.actorName;
  const contactEmail = input.email ?? ctx.actorEmail;
  if (!contactEmail) {
    throw new ValidationError("An email address is required so we can reply");
  }

  const lead = await ctx.db.salesLead.create({
    data: {
      brotherId:   ctx.actorId,
      kind:        input.kind,
      memberCount: members,
      contactName,
      contactEmail,
      message:     input.message ?? null,
    },
  });

  await emit(ctx, "billing.quote_requested", { type: "SalesLead", id: lead.id }, {
    kind: input.kind, members, leadId: lead.id,
  });

  const subject = input.kind === SalesLeadKind.MultiOrg
    ? `Group plan enquiry — ${org.name}`
    : `Custom quote — ${org.name} (${members} members)`;

  const body = [
    `Organization: ${org.name} (/${org.slug})`,
    `Members: ${members}`,
    `Contact: ${contactName} <${contactEmail}>`,
    "",
    input.message?.trim() || "(no message)",
  ].join("\n");

  return {
    leadId: lead.id,
    draft: {
      to: SUPPORT_EMAIL,
      subject,
      body,
      mailto:        mailto(subject, body),
      gmail:         gmailCompose(subject, body),
      outlook:       outlookCompose(subject, body),
      outlookSchool: outlookCompose(subject, body, "school"),
      text:          emailAsText(subject, body),
    },
  };
}

/**
 * Force a full reconcile in both directions. Manual counterpart to the
 * event-driven sync, and the support lever when something looks wrong.
 *
 * Unconditionally pulls first — unlike the billing page's opportunistic
 * refreshIfStale, someone pressing this button is telling us they think the row
 * is wrong, so the staleness heuristic shouldn't get a vote. The pull repairs
 * status/tier from Stripe; the push that follows corrects the quantity.
 */
export async function syncSeats(ctx: RequestContext): Promise<SeatSyncResult> {
  assertCanManageBilling(ctx);
  await refreshFromStripe(ctx.db);
  return reconcileSeats(ctx.db);
}


/** Explicit plan changes never create a second subscription. */
export async function changePlan(ctx: RequestContext, input: ChangePlanInput): Promise<{ scheduled: boolean }> {
  assertCanManageBilling(ctx);
  if (!stripeEnabled()) throw new ValidationError("Billing is not configured on this deployment");
  return withBillingLock(ctx.db, async () => {
    const local = await ctx.db.subscription.findFirst();
    if (!local?.stripeSubscriptionId) throw new ValidationError("Start a subscription first.");
    const sub = await stripe().subscriptions.retrieve(local.stripeSubscriptionId);
    if (sub.status === "canceled" || sub.status === "incomplete_expired") {
      await applySubscription(sub);
      throw new ValidationError("This subscription has ended. Start a new subscription.");
    }
    const item = sub.items.data[0];
    if (!item || sub.items.data.length !== 1 || item.price.id !== stripePriceId()) {
      throw new ValidationError("This subscription needs a custom plan change. Contact support.");
    }
    const scheduleId = idOf(sub.schedule);
    // Only replace schedules created by this flow. Never silently erase an
    // externally negotiated contract, discount schedule, or custom agreement.
    const schedule = scheduleId ? await stripe().subscriptionSchedules.retrieve(scheduleId) : null;
    if (schedule && schedule.metadata?.managedBy !== "selected-plans") {
      throw new ValidationError("This subscription has a custom schedule. Contact support to change it.");
    }
    const release = async () => {
      if (scheduleId) await stripe().subscriptionSchedules.release(scheduleId);
    };
    if (input.action === "cancel_change") {
      await release();
    } else if (input.action === "cancel" || input.action === "resume") {
      await release();
      await stripe().subscriptions.update(sub.id, { cancel_at_period_end: input.action === "cancel" });
    } else {
      if (sub.status !== "active") throw new ValidationError("Resolve your payment or trial in Manage billing before changing plans.");
      if (sub.cancel_at_period_end) throw new ValidationError("Resume your subscription before choosing a plan.");
      const target = selectedBand(input.plan);
      const members = await countBillableMembers(ctx.db);
      const current = tierForCount(item.quantity ?? 0);
      const downgrade = target.priceCents! < (current.priceCents ?? Infinity);
      if (!downgrade && members > target.upTo!) {
        throw new ValidationError("Choose a plan that covers your current active members.");
      }
      if (downgrade) {
        // Downgrades keep the purchased capacity until renewal. An over-capacity
        // roster is retained at renewal, with further admissions blocked.
        if (sub.metadata.billingMode !== BillingMode.Selected) {
          throw new ValidationError("Choose a plan covering your current members before scheduling a smaller plan.");
        }
        const managed = schedule ?? await stripe().subscriptionSchedules.create({ from_subscription: sub.id });
        const phase: Stripe.SubscriptionScheduleUpdateParams.Phase = {
          start_date: managed.current_phase?.start_date ?? item.current_period_start,
          end_date: item.current_period_end,
          items: [{ price: item.price.id, quantity: item.quantity ?? 1 }],
          metadata: { ...sub.metadata, billingMode: BillingMode.Selected },
          proration_behavior: "none",
          // Preserve payment and tax settings across phases.
          ...(sub.default_payment_method ? { default_payment_method: idOf(sub.default_payment_method)! } : {}),
          default_tax_rates: sub.default_tax_rates?.map(t => t.id) ?? [],
          discounts: sub.discounts?.map(d => ({ discount: idOf(d)! })) ?? [],
          automatic_tax: { enabled: sub.automatic_tax?.enabled ?? false },
        };
        try {
          await stripe().subscriptionSchedules.update(managed.id, {
            end_behavior: "release",
            metadata: { managedBy: "selected-plans", organizationId: String(ctx.orgId) },
            proration_behavior: "none",
            phases: [phase, {
              ...phase, start_date: item.current_period_end, end_date: undefined,
              duration: { interval: "month", interval_count: 1 },
              items: [{ price: item.price.id, quantity: target.upTo! }],
            }],
          });
        } catch (error) {
          // Creating from_subscription attaches immediately. If configuring the
          // future phase fails, undo that new attachment so retry remains usable.
          if (!schedule) await stripe().subscriptionSchedules.release(managed.id).catch(e => {
            logError(e, { route: "billing/change-plan", extra: { scheduleId: managed.id } });
          });
          throw error;
        }
      } else {
        if (schedule) throw new ValidationError("Cancel the scheduled plan change before choosing another plan.");
        // Stripe rejects the entire change if payment cannot complete. A failed
        // card or authentication requirement must not grant unpaid capacity.
        try {
          await stripe().subscriptions.update(sub.id, {
            items: [{ id: item.id, quantity: target.upTo! }],
            metadata: { ...sub.metadata, billingMode: BillingMode.Selected },
            proration_behavior: "always_invoice",
            payment_behavior: "error_if_incomplete",
          });
        } catch (error) {
          if ((error as { type?: string }).type === "StripeCardError") {
            throw new ValidationError("Payment could not complete. Update your payment method in Manage billing, then try again. Your plan has not changed.");
          }
          throw error;
        }
      }
    }
    // Always pull the final state. A client redirect never grants capacity.
    await applySubscription(await stripe().subscriptions.retrieve(sub.id));
    await emit(ctx, "billing.plan_changed", { type: "Subscription", id: ctx.orgId }, {
      action: input.action, ...("plan" in input ? { plan: input.plan } : {}),
    }, { activity: false });
    const updated = await ctx.db.subscription.findFirst();
    return { scheduled: Boolean(updated?.scheduledPlan) };
  });
}
