/**
 * Keeping Stripe and our row in step, in both directions.
 *
 * Everything asserted here was previously guaranteed only by a comment, and all
 * of it is load-bearing:
 *
 *   · the local DB write happens BEFORE the Stripe call, because the seat-sync
 *     handler runs inside dispatchHandlers, which races handlers against a 3s
 *     timeout and swallows what it catches — so a slow Stripe call must not be
 *     able to lose the headcount;
 *   · `seatSyncPendingAt` is set when a push is owed and cleared when it lands,
 *     because with no cron in this app that flag IS the retry mechanism;
 *   · proration is asymmetric on purpose (charge pro-rata when growing, nothing
 *     when shrinking);
 *   · the customer-id fallback in refreshFromStripe is the only recovery path
 *     for an org that paid and whose checkout.session.completed was lost.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSubscription, resetStripeMock, stripeMock, stripeMockModule } from "../setup/stripe-mock";

vi.mock("@/lib/stripe", () => stripeMockModule());

import { db } from "@/lib/db";
import { findLiveSubscription, reconcileSeats, refreshFromStripe, refreshIfStale } from "@/lib/billing/sync";
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

async function seedMembers(orgId: number, n: number) {
  if (n === 0) return;
  await testPrisma.brother.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      organizationId: orgId, name: `Member ${i}`, role: "Brother",
      attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0,
    })),
  });
}

/** An org with a live subscription, as applySubscription would have left it. */
async function subscribedOrg(name: string, slug: string, opts: { members: number; synced: number }) {
  const org = await createOrg(name, slug);
  await seedMembers(org.id, opts.members);
  await testPrisma.subscription.create({
    data: {
      organizationId:   org.id,
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      stripeItemId:     "si_test",
      status:           SubscriptionStatus.Active,
      tier:             BillingTier.Standard,
      billableMembers:  opts.synced,
      syncedQuantity:   opts.synced,
    },
  });
  return org;
}

describe("reconcileSeats — the push", () => {
  it("persists the true headcount and pushes it to Stripe", async () => {
    const org = await subscribedOrg("Push", "push-org", { members: 8, synced: 5 });

    const result = await reconcileSeats(db(org.id));

    expect(result).toMatchObject({ members: 8, pushed: true, pending: false });
    expect(stripeMock.subscriptionItems.update).toHaveBeenCalledWith("si_test", {
      quantity: 8, proration_behavior: "create_prorations",
    });
    const row = await sub(org.id);
    expect(row?.billableMembers).toBe(8);
    expect(row?.syncedQuantity).toBe(8);
    expect(row?.seatSyncPendingAt).toBeNull();
  });

  it("does not prorate a shrink — subs bill in advance, so the saving lands next invoice", async () => {
    const org = await subscribedOrg("Shrink", "shrink-org", { members: 6, synced: 20 });

    await reconcileSeats(db(org.id));

    expect(stripeMock.subscriptionItems.update).toHaveBeenCalledWith("si_test", {
      quantity: 6, proration_behavior: "none",
    });
  });

  it("keeps the local count and leaves seatSyncPendingAt set when Stripe fails", async () => {
    const org = await subscribedOrg("Outage", "outage-org", { members: 9, synced: 5 });
    stripeMock.subscriptionItems.update.mockRejectedValue(new Error("stripe is down"));

    const result = await reconcileSeats(db(org.id));

    // Never throws: the caller is usually an event handler reacting to a member
    // being added, and a Stripe outage must not fail the roster write.
    expect(result).toMatchObject({ members: 9, pushed: false, pending: true });
    const row = await sub(org.id);
    // The count landed anyway — this is the whole point of writing locally first.
    expect(row?.billableMembers).toBe(9);
    expect(row?.syncedQuantity).toBe(5);
    // The durable "a push is owed" flag that the three drain paths look for.
    expect(row?.seatSyncPendingAt).not.toBeNull();
  });

  it("no-ops against Stripe when the quantity already matches", async () => {
    const org = await subscribedOrg("Same", "same-org", { members: 5, synced: 5 });

    const result = await reconcileSeats(db(org.id));

    expect(result).toMatchObject({ pushed: false, pending: false });
    expect(stripeMock.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it("never pushes for a cancelled org, and cannot leave a stuck pending flag", async () => {
    const org = await createOrg("Cancelled", "cancelled-sync-org");
    await seedMembers(org.id, 12);
    // Post-cancel shape: the handles are cleared, the customer id survives.
    await testPrisma.subscription.create({
      data: {
        organizationId: org.id, stripeCustomerId: "cus_test",
        status: SubscriptionStatus.Canceled, billableMembers: 12,
      },
    });

    const result = await reconcileSeats(db(org.id));

    // With stripeItemId still set this used to call subscriptionItems.update on
    // a dead item on every roster change, fail, and set seatSyncPendingAt
    // forever — a "sync owed" flag no drain path could ever clear.
    expect(stripeMock.subscriptionItems.update).not.toHaveBeenCalled();
    expect(result.pending).toBe(false);
    expect((await sub(org.id))?.seatSyncPendingAt).toBeNull();
  });
});

describe("refreshFromStripe — the pull", () => {
  it("recovers an org that paid but whose checkout webhook was lost", async () => {
    const org = await createOrg("Lost", "lost-org");
    await seedMembers(org.id, 10);
    // Exactly the broken state: startCheckout persisted the customer id before
    // redirecting, and then nothing ever wrote the subscription.
    await testPrisma.subscription.create({
      data: { organizationId: org.id, stripeCustomerId: "cus_test", status: SubscriptionStatus.Free },
    });
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [fakeSubscription({ organizationId: org.id, status: "active", quantity: 10 })],
    });

    expect(await refreshFromStripe(db(org.id))).toBe(true);

    // Looked up by CUSTOMER, because there was no subscription id to retrieve.
    expect(stripeMock.subscriptions.list).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_test", status: "all" }),
    );
    expect((await sub(org.id))?.status).toBe(SubscriptionStatus.Active);
  });

  it("retrieves directly when we do have a subscription id", async () => {
    const org = await subscribedOrg("Direct", "direct-org", { members: 5, synced: 5 });
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      fakeSubscription({ organizationId: org.id, status: "past_due" }),
    );

    expect(await refreshFromStripe(db(org.id))).toBe(true);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith("sub_test");
    expect((await sub(org.id))?.status).toBe(SubscriptionStatus.PastDue);
  });

  it("returns false rather than throwing when Stripe is unreachable", async () => {
    const org = await subscribedOrg("Down", "down-org", { members: 5, synced: 5 });
    stripeMock.subscriptions.retrieve.mockRejectedValue(new Error("network"));

    // Must not break the billing page that explains the problem.
    expect(await refreshFromStripe(db(org.id))).toBe(false);
  });
});

describe("refreshIfStale — when to bother asking", () => {
  it("skips the round-trip for a healthy subscription", async () => {
    const org = await subscribedOrg("Healthy", "healthy-org", { members: 5, synced: 5 });

    expect(await refreshIfStale(db(org.id))).toBe(false);
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
  });

  it("asks when a customer exists but no subscription was ever recorded", async () => {
    const org = await createOrg("Suspect", "suspect-org");
    await testPrisma.subscription.create({
      data: { organizationId: org.id, stripeCustomerId: "cus_test", status: SubscriptionStatus.Free },
    });
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [fakeSubscription({ organizationId: org.id, status: "active" })],
    });

    expect(await refreshIfStale(db(org.id))).toBe(true);
  });

  it("does nothing at all for an org that has never touched billing", async () => {
    const org = await createOrg("Never", "never-org");
    expect(await refreshIfStale(db(org.id))).toBe(false);
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
  });
});

describe("findLiveSubscription", () => {
  it("treats past_due as live — subscribing again on top of it would double-bill", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [fakeSubscription({ status: "past_due" })],
    });
    expect(await findLiveSubscription("cus_test")).not.toBeNull();
  });

  it("treats cancelled as terminal, so a returning org can subscribe again", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [fakeSubscription({ status: "canceled" }), fakeSubscription({ status: "incomplete_expired" })],
    });
    expect(await findLiveSubscription("cus_test")).toBeNull();
  });

  it("finds a live subscription behind a history of cancelled ones", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        fakeSubscription({ id: "sub_old", status: "canceled" }),
        fakeSubscription({ id: "sub_new", status: "active" }),
      ],
    });
    expect((await findLiveSubscription("cus_test"))?.id).toBe("sub_new");
  });
});
