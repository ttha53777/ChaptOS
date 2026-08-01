/**
 * Writing Stripe's view of a subscription into our row.
 *
 * `applySubscription` is the only writer of `status`, `tier`, `currentPeriodEnd`
 * and the Stripe id columns, and the whole design rests on two claims it makes
 * about itself: that it stores absolute state (so replaying converges) and that
 * it only writes audit rows on a real transition (so a renewal storm, or the
 * pull path re-applying matching state, stays quiet). Both were asserted only by
 * a comment until now.
 *
 * The cancel branch gets the most attention here because it is the newest and
 * because getting it wrong is what left cancelled orgs unable to resubscribe.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStripeMock, stripeMockModule, fakeSubscription } from "../setup/stripe-mock";

vi.mock("@/lib/stripe", () => stripeMockModule());

import { applySubscription, mapStatus, resolveOrgId } from "@/lib/billing/apply";
import { SubscriptionStatus } from "@/lib/state/subscription-status";
import { BillingTier } from "@/lib/state/billing-tier";
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

const billingEvents = (orgId: number) =>
  testPrisma.operationalEvent.findMany({
    where:   { organizationId: orgId, action: { startsWith: "billing." } },
    orderBy: { id: "asc" },
  });

describe("mapStatus", () => {
  it("passes Stripe's own statuses through unchanged", () => {
    expect(mapStatus("active")).toBe(SubscriptionStatus.Active);
    expect(mapStatus("trialing")).toBe(SubscriptionStatus.Trialing);
    expect(mapStatus("past_due")).toBe(SubscriptionStatus.PastDue);
    expect(mapStatus("unpaid")).toBe(SubscriptionStatus.Unpaid);
    expect(mapStatus("canceled")).toBe(SubscriptionStatus.Canceled);
  });

  it("folds incomplete into free — a first payment that never landed is indistinguishable from never subscribing", () => {
    expect(mapStatus("incomplete")).toBe(SubscriptionStatus.Free);
    expect(mapStatus("incomplete_expired")).toBe(SubscriptionStatus.Free);
  });

  it("maps paused to past_due: growth blocked, data untouched", () => {
    expect(mapStatus("paused")).toBe(SubscriptionStatus.PastDue);
  });
});

describe("resolveOrgId", () => {
  it("prefers metadata, which is set on both Customer and Subscription at creation", async () => {
    const org = await createOrg("Meta", "meta-org");
    expect(await resolveOrgId({ organizationId: String(org.id) }, null)).toBe(org.id);
  });

  it("falls back to the customer id — the recovery path for a subscription we never recorded", async () => {
    const org = await createOrg("Fallback", "fallback-org");
    await testPrisma.subscription.create({
      data: { organizationId: org.id, stripeCustomerId: "cus_known" },
    });
    expect(await resolveOrgId(null, "cus_known")).toBe(org.id);
  });

  it("returns null when neither identifies an org, rather than guessing", async () => {
    expect(await resolveOrgId(null, "cus_unknown")).toBeNull();
    expect(await resolveOrgId({ organizationId: "not-a-number" }, null)).toBeNull();
  });
});

describe("applySubscription — absolute state", () => {
  it("writes Stripe's view, taking current_period_end off the ITEM (Stripe 22.x)", async () => {
    const org = await createOrg("Apply", "apply-org");
    const periodEnd = 1_800_000_000;

    await applySubscription(fakeSubscription({
      organizationId: org.id, quantity: 10, itemId: "si_a", priceId: "price_a",
      currentPeriodEnd: periodEnd,
    }));

    const row = await sub(org.id);
    expect(row?.status).toBe(SubscriptionStatus.Active);
    expect(row?.tier).toBe(BillingTier.Standard);
    expect(row?.stripeItemId).toBe("si_a");
    expect(row?.syncedQuantity).toBe(10);
    expect(row?.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
  });

  it("is idempotent: re-applying identical state writes no second audit row", async () => {
    const org = await createOrg("Idem", "idem-org");
    const s = fakeSubscription({ organizationId: org.id, quantity: 10 });

    await applySubscription(s);
    await applySubscription(s);
    await applySubscription(s);

    // One activation. Not three — this is what lets the webhook and the pull
    // path both run, even concurrently, without narrating the same event twice.
    const activated = (await billingEvents(org.id)).filter(e => e.action === "billing.subscription_activated");
    expect(activated).toHaveLength(1);
  });

  it("records a tier change when the quantity crosses a band", async () => {
    const org = await createOrg("Band", "band-org");
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 10 }));
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 60 }));

    const changed = (await billingEvents(org.id)).filter(e => e.action === "billing.tier_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0].metadata).toMatchObject({ fromTier: BillingTier.Standard, toTier: BillingTier.Pro });
    expect((await sub(org.id))?.tier).toBe(BillingTier.Pro);
  });

  it("does not throw when the subscription can't be attributed to any org", async () => {
    await expect(
      applySubscription(fakeSubscription({ customer: "cus_nobody" })),
    ).resolves.toBeUndefined();
  });
});

describe("applySubscription — the cancel branch", () => {
  it("clears the Stripe handles but keeps the customer id", async () => {
    const org = await createOrg("Cancel", "cancel-org");
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 10, itemId: "si_c" }));

    await applySubscription(
      fakeSubscription({ organizationId: org.id, quantity: 10, itemId: "si_c", status: "canceled" }),
      { canceled: true },
    );

    const row = await sub(org.id);
    expect(row?.status).toBe(SubscriptionStatus.Canceled);
    // Dead handles. Keeping stripeSubscriptionId is what used to make
    // startCheckout refuse forever; keeping stripeItemId made reconcileSeats
    // push quantity at a cancelled item on every roster change, fail, and leave
    // seatSyncPendingAt set permanently.
    expect(row?.stripeSubscriptionId).toBeNull();
    expect(row?.stripeItemId).toBeNull();
    expect(row?.syncedQuantity).toBeNull();
    // The recovery key survives: it's how refreshFromStripe finds them again,
    // and how a resubscribe avoids minting a second Customer.
    expect(row?.stripeCustomerId).toBe("cus_test");
  });

  it("clears the renewal date and the pending-cancel flag", async () => {
    const org = await createOrg("Dates", "dates-org");
    await applySubscription(fakeSubscription({
      organizationId: org.id, quantity: 10, cancelAtPeriodEnd: true,
    }));
    expect((await sub(org.id))?.cancelAtPeriodEnd).toBe(true);

    await applySubscription(
      fakeSubscription({ organizationId: org.id, quantity: 10, status: "canceled", cancelAtPeriodEnd: true }),
      { canceled: true },
    );

    const row = await sub(org.id);
    // A cancel_at_period_end that has now HAPPENED is not still pending. Leaving
    // it set rendered "cancels on <date> — you can resume any time before then"
    // to an org whose subscription was already gone.
    expect(row?.cancelAtPeriodEnd).toBe(false);
    expect(row?.currentPeriodEnd).toBeNull();
  });

  it("records the cancellation once, not on every redelivery", async () => {
    const org = await createOrg("Once", "once-org");
    const cancelled = fakeSubscription({ organizationId: org.id, status: "canceled" });

    await applySubscription(cancelled, { canceled: true });
    await applySubscription(cancelled, { canceled: true });

    const events = (await billingEvents(org.id)).filter(e => e.action === "billing.subscription_canceled");
    expect(events).toHaveLength(1);
  });
});
