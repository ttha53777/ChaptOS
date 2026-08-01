/**
 * Starting and managing a subscription.
 *
 * `billing-service.ts` had no tests at all, which mattered most for the guard
 * that decides whether a checkout is allowed to happen. That guard used to read
 * our own `stripeSubscriptionId` — a field only the webhook writes — and it was
 * wrong in both directions:
 *
 *   too permissive  a lost webhook meant the field was empty while a live
 *                   subscription existed, so a second checkout went through and
 *                   the org was billed twice, with the extra subscription
 *                   invisible to the app.
 *
 *   too strict      the field survived a cancellation, so a cancelled org could
 *                   never resubscribe: walled by the seat gate for being over
 *                   the free band, refused at the till, and pointed by the UI at
 *                   a portal with nothing in it. /pricing promises they can come
 *                   back.
 *
 * Both are now one question asked of Stripe.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSubscription, resetStripeMock, setStripeEnabled, stripeMock, stripeMockModule } from "../setup/stripe-mock";

vi.mock("@/lib/stripe", () => stripeMockModule());

import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { SubscriptionStatus } from "@/lib/state/subscription-status";
import { openPortal, startCheckout } from "@/lib/services/billing-service";
import { createOrg } from "../setup/factories";
import { resetDb, testPrisma } from "../setup/prisma";

beforeEach(async () => {
  await resetDb();
  resetStripeMock();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, opts?: { permissions?: number; isOrgAdmin?: boolean }): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId:         1,
    actorName:       "Tester",
    actorEmail:      "admin@example.test",
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     opts?.permissions ?? 0,
    maxRank:         0,
    isOrgAdmin:      opts?.isOrgAdmin ?? true,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

async function seedMembers(orgId: number, n: number) {
  await testPrisma.brother.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      organizationId: orgId, name: `Member ${i}`, role: "Brother",
      attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0,
    })),
  });
}

const sub = (orgId: number) => testPrisma.subscription.findUnique({ where: { organizationId: orgId } });

describe("startCheckout — authority", () => {
  it("is org-admin authority, not a permission bit: a Treasurer is refused", async () => {
    const org = await createOrg("Perm", "perm-org");
    const treasurer = ctxFor(org.id, { permissions: PERMISSIONS.MANAGE_TREASURY, isOrgAdmin: false });

    await expect(startCheckout(treasurer, {}, "https://app.test")).rejects.toThrow(ForbiddenError);
  });

  it("refuses when the deployment has no Stripe keys", async () => {
    const org = await createOrg("Off", "off-org");
    setStripeEnabled(false);

    await expect(startCheckout(ctxFor(org.id), {}, "https://app.test")).rejects.toThrow(ValidationError);
  });
});

describe("startCheckout — the quantity", () => {
  it("reads the headcount from the roster, never from the caller", async () => {
    const org = await createOrg("Qty", "qty-org");
    await seedMembers(org.id, 7);

    await startCheckout(ctxFor(org.id), {}, "https://app.test");

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_test", quantity: 7 }],
      }),
    );
  });

  it("persists the customer id before redirecting, so an abandoned checkout can't mint a second Customer", async () => {
    const org = await createOrg("Cust", "cust-org");
    await seedMembers(org.id, 7);

    await startCheckout(ctxFor(org.id), {}, "https://app.test");

    // That one field is also the whole recovery path if the completion webhook
    // is lost — refreshFromStripe looks the subscription up by it.
    expect((await sub(org.id))?.stripeCustomerId).toBe("cus_test");
    expect(stripeMock.customers.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: `customer:org:${org.id}` }),
    );
  });

  it("refuses above the self-serve ceiling and asks for a conversation instead", async () => {
    const org = await createOrg("Big", "big-org");
    await seedMembers(org.id, 130);

    await expect(startCheckout(ctxFor(org.id), {}, "https://app.test")).rejects.toThrow(ValidationError);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("startCheckout — the duplicate guard asks Stripe", () => {
  it("refuses when Stripe reports a live subscription, even if our row never recorded one", async () => {
    const org = await createOrg("Race", "race-org");
    await seedMembers(org.id, 7);
    // The lost-webhook shape: customer persisted, subscription id never written.
    await testPrisma.subscription.create({
      data: { organizationId: org.id, stripeCustomerId: "cus_test", status: SubscriptionStatus.Free },
    });
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [fakeSubscription({ organizationId: org.id, status: "active" })],
    });

    // The old guard read our empty stripeSubscriptionId and let this through,
    // leaving the org with two live subscriptions on one Customer.
    await expect(startCheckout(ctxFor(org.id), {}, "https://app.test")).rejects.toThrow(ValidationError);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses on top of a past_due subscription — not good standing, but still billing", async () => {
    const org = await createOrg("Late", "late-org");
    await seedMembers(org.id, 7);
    await testPrisma.subscription.create({
      data: { organizationId: org.id, stripeCustomerId: "cus_test", status: SubscriptionStatus.PastDue },
    });
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [fakeSubscription({ organizationId: org.id, status: "past_due" })],
    });

    await expect(startCheckout(ctxFor(org.id), {}, "https://app.test")).rejects.toThrow(ValidationError);
  });

  it("lets a cancelled org subscribe again", async () => {
    const org = await createOrg("Return", "return-org");
    await seedMembers(org.id, 7);
    // Post-cancel shape as applySubscription now leaves it.
    await testPrisma.subscription.create({
      data: {
        organizationId: org.id, stripeCustomerId: "cus_test",
        status: SubscriptionStatus.Canceled, billableMembers: 7,
      },
    });
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [fakeSubscription({ organizationId: org.id, status: "canceled" })],
    });

    const { url } = await startCheckout(ctxFor(org.id), {}, "https://app.test");

    expect(url).toBe("https://checkout.stripe.test/s");
    // Reuses the existing Customer rather than creating a second one for the
    // same org — which is exactly why the cancel branch keeps the customer id.
    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_test" }),
    );
  });

  it("skips the Stripe lookup entirely for an org that has never had a customer", async () => {
    const org = await createOrg("Fresh", "fresh-org");
    await seedMembers(org.id, 7);

    await startCheckout(ctxFor(org.id), {}, "https://app.test");

    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
  });
});

describe("startCheckout — metadata", () => {
  it("puts organizationId on the SUBSCRIPTION, so later webhooks can resolve the org", async () => {
    const org = await createOrg("Meta", "meta-checkout-org");
    await seedMembers(org.id, 7);

    await startCheckout(ctxFor(org.id), {}, "https://app.test");

    // Without this, every renewal, failure and cancellation would need a lookup
    // table — and resolveOrgId's metadata arm would never hit.
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: { metadata: { organizationId: String(org.id), orgSlug: "meta-checkout-org" } },
      }),
    );
  });
});

describe("openPortal", () => {
  it("refuses before there is a billing account to manage", async () => {
    const org = await createOrg("NoAcct", "noacct-org");
    await expect(openPortal(ctxFor(org.id), {}, "https://app.test")).rejects.toThrow(ValidationError);
  });

  it("opens against the stored customer", async () => {
    const org = await createOrg("Portal", "portal-org");
    await testPrisma.subscription.create({
      data: { organizationId: org.id, stripeCustomerId: "cus_test", status: SubscriptionStatus.Active },
    });

    const { url } = await openPortal(ctxFor(org.id), {}, "https://app.test");

    expect(url).toBe("https://portal.stripe.test/s");
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_test" }),
    );
  });
});
