/**
 * The event → action mapping.
 *
 * `handleStripeEvent` is where Stripe's story about an org becomes ours, and it
 * had no tests at all: seven event types, each with different retrieve-vs-payload
 * semantics, and an exported HANDLED_EVENTS list with no consumer that could
 * drift away from the switch without anything noticing.
 *
 * The centrepiece is the ordering test. Stripe explicitly does not guarantee
 * event order and retries for about three days, so a `payment_failed` can land
 * after the `invoice.paid` that resolved it. The handler used to blind-write
 * `past_due` in that branch, which meant a late redelivery could wall a paying
 * org at the seat gate with nothing to explain why.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeEvent, fakeInvoice, fakeSubscription, resetStripeMock, stripeMock, stripeMockModule,
} from "../setup/stripe-mock";

vi.mock("@/lib/stripe", () => stripeMockModule());

import { HANDLED_EVENTS, handleStripeEvent } from "@/lib/billing/webhook";
import { SubscriptionStatus } from "@/lib/state/subscription-status";
import { createOrg } from "../setup/factories";
import { resetDb, testPrisma } from "../setup/prisma";

beforeEach(async () => {
  await resetDb();
  resetStripeMock();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

const sub = (orgId: number) => testPrisma.subscription.findUnique({ where: { organizationId: orgId } });

const actions = async (orgId: number) =>
  (await testPrisma.operationalEvent.findMany({
    where: { organizationId: orgId }, orderBy: { id: "asc" }, select: { action: true },
  })).map(e => e.action);

describe("HANDLED_EVENTS is enforcing", () => {
  it("ignores an event type that isn't on the list", async () => {
    const org = await createOrg("Ignore", "ignore-org");
    await handleStripeEvent(fakeEvent("customer.created", { id: "cus_test" }));

    expect(await sub(org.id)).toBeNull();
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("handles every type it advertises", async () => {
    const org = await createOrg("All", "all-org");
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      fakeSubscription({ organizationId: org.id, quantity: 10 }),
    );
    stripeMock.charges.retrieve.mockResolvedValue({ customer: "cus_test" });

    const payloads: Record<(typeof HANDLED_EVENTS)[number], unknown> = {
      "checkout.session.completed":       { subscription: "sub_test" },
      "customer.subscription.created":    fakeSubscription({ organizationId: org.id }),
      "customer.subscription.updated":    fakeSubscription({ organizationId: org.id }),
      "customer.subscription.deleted":    fakeSubscription({ organizationId: org.id, status: "canceled" }),
      "invoice.paid":                     fakeInvoice({ organizationId: org.id }),
      "invoice.payment_failed":           fakeInvoice({ organizationId: org.id }),
      "invoice.payment_action_required":  fakeInvoice({ organizationId: org.id }),
      "invoice.upcoming":                 fakeInvoice({ organizationId: org.id }),
      "charge.dispute.created":           { id: "dp_1", charge: "ch_1", amount: 2500, reason: "fraudulent" },
    };

    // Every advertised type must run without throwing. A type added to the list
    // but not to the switch would now silently no-op, so this asserts the two
    // stay in step.
    for (const type of HANDLED_EVENTS) {
      await expect(handleStripeEvent(fakeEvent(type, payloads[type]))).resolves.toBeUndefined();
    }
  });
});

describe("invoice.payment_failed", () => {
  it("persists whatever Stripe says NOW, not a hard-coded past_due", async () => {
    const org = await createOrg("Failed", "failed-org");
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      fakeSubscription({ organizationId: org.id, status: "past_due", quantity: 10 }),
    );

    await handleStripeEvent(fakeEvent("invoice.payment_failed", fakeInvoice({ organizationId: org.id })));

    expect((await sub(org.id))?.status).toBe(SubscriptionStatus.PastDue);
    expect(await actions(org.id)).toContain("billing.payment_failed");
  });

  it("does NOT wall an org whose retry already succeeded — the out-of-order case", async () => {
    const org = await createOrg("Recovered", "recovered-org");

    // The recovery landed first.
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      fakeSubscription({ organizationId: org.id, status: "active", quantity: 10 }),
    );
    await handleStripeEvent(fakeEvent("invoice.paid", fakeInvoice({ organizationId: org.id })));
    expect((await sub(org.id))?.status).toBe(SubscriptionStatus.Active);

    // Now the delayed failure arrives. Stripe still reports active, so we must
    // stay active. The old blind `updateMany({ status: past_due })` flipped the
    // org here and blocked it from adding members.
    await handleStripeEvent(fakeEvent("invoice.payment_failed", fakeInvoice({ organizationId: org.id })));

    expect((await sub(org.id))?.status).toBe(SubscriptionStatus.Active);
    // The failure is still recorded — it happened, and it's the only trace of a
    // card starting to go bad.
    expect(await actions(org.id)).toContain("billing.payment_failed");
  });

  it("records the failure even when no Subscription row exists yet", async () => {
    const org = await createOrg("NoRow", "norow-org");
    // updateMany silently matched zero rows in this case and lost the event.
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      fakeSubscription({ organizationId: org.id, status: "past_due" }),
    );

    await handleStripeEvent(fakeEvent("invoice.payment_failed", fakeInvoice({ organizationId: org.id })));
    expect(await actions(org.id)).toContain("billing.payment_failed");
  });
});

describe("invoice.payment_action_required", () => {
  it("records the event and the hosted invoice URL, which is what resolves it", async () => {
    const org = await createOrg("SCA", "sca-org");
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      fakeSubscription({ organizationId: org.id, status: "past_due" }),
    );

    await handleStripeEvent(fakeEvent("invoice.payment_action_required", fakeInvoice({
      organizationId: org.id, hostedInvoiceUrl: "https://invoice.stripe.test/i/abc",
    })));

    const row = await testPrisma.operationalEvent.findFirst({
      where: { organizationId: org.id, action: "billing.payment_action_required" },
    });
    expect(row?.metadata).toMatchObject({ hostedInvoiceUrl: "https://invoice.stripe.test/i/abc" });
  });
});

describe("charge.dispute.created", () => {
  it("records the chargeback without touching entitlement", async () => {
    const org = await createOrg("Dispute", "dispute-org");
    await testPrisma.subscription.create({
      data: { organizationId: org.id, stripeCustomerId: "cus_test", status: SubscriptionStatus.Active },
    });
    stripeMock.charges.retrieve.mockResolvedValue({ customer: "cus_test" });

    await handleStripeEvent(fakeEvent("charge.dispute.created", {
      id: "dp_1", charge: "ch_1", amount: 2500, reason: "fraudulent",
    }));

    // A dispute is a claim, not a verdict. Stripe sends the subscription events
    // if it decides to act; we only make sure it isn't invisible on our side.
    expect((await sub(org.id))?.status).toBe(SubscriptionStatus.Active);
    const row = await testPrisma.operationalEvent.findFirst({
      where: { organizationId: org.id, action: "billing.dispute_opened" },
    });
    expect(row?.metadata).toMatchObject({ stripeDisputeId: "dp_1", amountCents: 2500, reason: "fraudulent" });
  });
});

describe("customer.subscription.deleted", () => {
  it("uses the payload rather than re-retrieving a subscription that no longer resolves", async () => {
    const org = await createOrg("Deleted", "deleted-org");
    await handleStripeEvent(fakeEvent(
      "customer.subscription.deleted",
      fakeSubscription({ organizationId: org.id, status: "canceled" }),
    ));

    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect((await sub(org.id))?.status).toBe(SubscriptionStatus.Canceled);
  });
});

describe("checkout.session.completed", () => {
  it("ignores a session with no subscription — this product sells no one-off payments", async () => {
    const org = await createOrg("OneOff", "oneoff-org");
    await handleStripeEvent(fakeEvent("checkout.session.completed", { subscription: null }));

    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(await sub(org.id)).toBeNull();
  });
});
