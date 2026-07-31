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
import { flushPendingSeatSync, reconcileSeats, refreshFromStripe, refreshIfStale, type SeatSyncResult } from "@/lib/billing/sync";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, formatRange, tierForCount } from "@/lib/billing/tiers";
import type { OpenPortalInput, RequestQuoteInput, StartCheckoutInput } from "@/lib/validation/billing";

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
  blockedBy: "checkout" | "quote" | null;
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
      select: { status: true, tier: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    countBillableMembers(ctx.db),
    checkSeatAvailable(ctx.db),
    countAdministeredOrgs(ctx.actorId),
  ]);

  const band = tierForCount(members);

  return {
    members,
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
 * Start a Stripe Checkout session for the org's current headcount.
 *
 * The quantity is read from the roster, never from the client — a caller cannot
 * ask to be billed for fewer people than they have.
 */
export async function startCheckout(
  ctx: RequestContext,
  input: StartCheckoutInput,
  origin: string,
): Promise<{ url: string }> {
  assertCanManageBilling(ctx);
  if (!stripeEnabled()) throw new ValidationError("Billing is not configured on this deployment");

  const members = await countBillableMembers(ctx.db);
  const band = tierForCount(members);

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
  if (existing?.stripeSubscriptionId) {
    throw new ValidationError("This organization already has a subscription — manage it in the billing portal.");
  }

  const customerId = existing?.stripeCustomerId ?? await createCustomer(ctx, org);

  const back = input.returnPath ?? `/${org.slug}/billing`;
  const session = await stripe().checkout.sessions.create({
    mode:     "subscription",
    customer: customerId,
    line_items: [{ price: stripePriceId(), quantity: members }],
    // Metadata on the SUBSCRIPTION (not just the session) is what lets every
    // later webhook — renewals, failures, cancellations — resolve the org
    // without a lookup table.
    subscription_data: {
      metadata: { organizationId: String(ctx.orgId), orgSlug: org.slug },
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
    tier:             band.id,
  });

  await emit(ctx, "billing.checkout_started", { type: "Subscription", id: ctx.orgId }, {
    tier: band.id, priceCents: band.priceCents, members,
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
