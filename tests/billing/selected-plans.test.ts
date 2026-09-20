import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSubscription, resetStripeMock, stripeMock, stripeMockModule } from "../setup/stripe-mock";
vi.mock("@/lib/stripe", () => stripeMockModule());
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { startCheckout, changePlan, getBillingSummary } from "@/lib/services/billing-service";
import { checkSeatAvailable } from "@/lib/billing/guard";
import { reconcileSeats, refreshFromStripe } from "@/lib/billing/sync";
import { applySubscription } from "@/lib/billing/apply";
import { startCheckoutInput } from "@/lib/validation/billing";
import { createOrg, createBrother } from "../setup/factories";
import { testPrisma, resetDb } from "../setup/prisma";

beforeEach(async () => { await resetDb(); resetStripeMock(); });
afterAll(() => testPrisma.$disconnect());

async function setup(members = 2) {
  const org = await createOrg("Early", "early");
  for (let i = 0; i < members; i++) await createBrother({ orgId: org.id });
  const ctx = { requestId: randomUUID(), orgId: org.id, actorId: 1, actorName: "Admin",
    actorEmail: "admin@example.test", authUserId: "test", membershipId: null, permissions: 0,
    maxRank: 100, isOrgAdmin: true, isPlatformAdmin: false, db: db(org.id) } as RequestContext;
  return { org, ctx };
}
const row = (orgId: number) => testPrisma.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
async function activate(orgId: number, quantity = 50) {
  const sub = fakeSubscription({ organizationId: orgId, quantity, billingMode: "selected" });
  await applySubscription(sub);
  stripeMock.subscriptions.retrieve.mockResolvedValue(sub);
  return sub;
}

describe("early selected-plan purchases", () => {
  it.each([["standard", 50], ["pro", 120]] as const)("charges the %s band at two members without granting capacity before payment", async (plan, quantity) => {
    const { org, ctx } = await setup();
    await startCheckout(ctx, { plan }, "https://app.test");
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_test", quantity }],
      subscription_data: { metadata: expect.objectContaining({ billingMode: "selected" }) },
    }));
    expect(await row(org.id)).toMatchObject({ status: "free", billingMode: "automatic", selectedPlan: null, billableMembers: 2 });
    await createBrother({ orgId: org.id }); await createBrother({ orgId: org.id });
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: false, action: "checkout" });
  });

  it("rejects an unknown plan and a plan smaller than the existing roster", async () => {
    expect(startCheckoutInput.safeParse({ plan: "free", quantity: 1 }).success).toBe(false);
    const { ctx } = await setup(51);
    await expect(startCheckout(ctx, { plan: "standard" }, "https://app.test")).rejects.toThrow("covers");
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("recovers a paid plan after a lost checkout webhook and keeps actual usage separate", async () => {
    const { org, ctx } = await setup();
    await startCheckout(ctx, { plan: "pro" }, "https://app.test");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [fakeSubscription({ organizationId: org.id, quantity: 120, billingMode: "selected" })] });
    stripeMock.subscriptions.retrieve.mockResolvedValue(fakeSubscription({ organizationId: org.id, quantity: 120, billingMode: "selected" }));
    expect(await refreshFromStripe(ctx.db)).toBe(true);
    await reconcileSeats(ctx.db);
    expect(await row(org.id)).toMatchObject({ status: "active", billingMode: "selected", selectedPlan: "pro", tier: "pro", billableMembers: 2, syncedQuantity: 120 });
    expect(stripeMock.subscriptionItems.update).not.toHaveBeenCalled();
    expect(await getBillingSummary(ctx)).toMatchObject({ members: 2, capacity: 120, priceCents: 6500, tier: "pro" });
  });

  it("never treats an incomplete checkout as a paid plan", async () => {
    const { org, ctx } = await setup(4);
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 50, billingMode: "selected", status: "incomplete" }));
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: false });
  });

  it("an expired first payment permits a fresh checkout", async () => {
    const { org, ctx } = await setup(4);
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 50, billingMode: "selected", status: "incomplete_expired" }));
    expect(await getBillingSummary(ctx)).toMatchObject({ hasSubscription: false, canAddMember: false });
    await startCheckout(ctx, { plan: "standard" }, "https://app.test");
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalled();
  });

  it("does not change another organization's subscription", async () => {
    const { org, ctx } = await setup();
    const other = await createOrg("Other", "other");
    await activate(other.id, 120);
    await startCheckout(ctx, { plan: "standard" }, "https://app.test");
    await activate(org.id, 50);
    await reconcileSeats(ctx.db);
    expect(await row(other.id)).toMatchObject({ selectedPlan: "pro", syncedQuantity: 120 });
  });
});

describe("selected capacity and roster changes", () => {
  it("allows the 50th member, blocks the 51st, and allows an explicit Pro upgrade", async () => {
    const { org, ctx } = await setup(49);
    await activate(org.id);
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: true, limit: 50 });
    await createBrother({ orgId: org.id });
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: false, limit: 50, action: "upgrade" });
    await activate(org.id, 120);
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: true, limit: 120 });
  });

  it("archiving members updates usage without reducing the selected price", async () => {
    const { org, ctx } = await setup(5);
    await activate(org.id);
    await testPrisma.membership.updateMany({ where: { organizationId: org.id }, data: { archivedAt: new Date() } });
    await reconcileSeats(ctx.db);
    expect(await row(org.id)).toMatchObject({ tier: "standard", selectedPlan: "standard", billableMembers: 0, syncedQuantity: 50, seatSyncPendingAt: null });
    expect(stripeMock.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it.each(["past_due", "canceled"] as const)("blocks paid growth after %s while preserving members", async status => {
    const { org, ctx } = await setup(5);
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 50, billingMode: "selected", status }));
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: false });
    expect(await ctx.db.member.count()).toBe(5);
  });
});

describe("explicit plan changes", () => {
  it("converts automatic billing to a selected plan without a second checkout", async () => {
    const { org, ctx } = await setup(2);
    const before = fakeSubscription({ organizationId: org.id, quantity: 2 });
    await applySubscription(before);
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce(before).mockResolvedValueOnce(
      fakeSubscription({ organizationId: org.id, quantity: 50, billingMode: "selected" }),
    );
    await changePlan(ctx, { action: "select", plan: "standard" });
    expect(await row(org.id)).toMatchObject({ billingMode: "selected", selectedPlan: "standard", billableMembers: 2 });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("a later automatic sync recovers a purchase whose local update was lost", async () => {
    const { org, ctx } = await setup(5);
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 4 }));
    stripeMock.subscriptions.retrieve.mockResolvedValue(fakeSubscription({ organizationId: org.id, quantity: 120, billingMode: "selected" }));
    await reconcileSeats(ctx.db);
    expect(stripeMock.subscriptionItems.update).not.toHaveBeenCalled();
    expect(await row(org.id)).toMatchObject({ billingMode: "selected", selectedPlan: "pro", syncedQuantity: 120, billableMembers: 5, seatSyncPendingAt: null });
  });

  it("ignores a delayed cancellation for a replaced subscription", async () => {
    const { org } = await setup();
    await applySubscription(fakeSubscription({ id: "sub_new", organizationId: org.id, quantity: 120, billingMode: "selected" }));
    await applySubscription(fakeSubscription({ id: "sub_old", organizationId: org.id, status: "canceled" }), { canceled: true });
    expect(await row(org.id)).toMatchObject({ stripeSubscriptionId: "sub_new", selectedPlan: "pro", status: "active" });
  });

  it("can remove a scheduled downgrade and resume a canceled-at-renewal subscription", async () => {
    const { org, ctx } = await setup();
    const before = await activate(org.id, 120);
    const scheduled = { ...before, schedule: "sched_test" };
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce(scheduled).mockResolvedValueOnce(before);
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({ metadata: { managedBy: "selected-plans" }, phases: [] });
    await changePlan(ctx, { action: "cancel_change" });
    expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith("sched_test");
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce({ ...before, cancel_at_period_end: true }).mockResolvedValueOnce(before);
    await changePlan(ctx, { action: "resume" });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_test", { cancel_at_period_end: false });
    expect(await row(org.id)).toMatchObject({ cancelAtPeriodEnd: false, scheduledPlan: null });
  });

  it("cleans up a newly attached schedule when configuring the downgrade fails", async () => {
    const { org, ctx } = await setup();
    const before = await activate(org.id, 120);
    stripeMock.subscriptionSchedules.create.mockResolvedValue({ id: "sched_new", current_phase: { start_date: before.items.data[0].current_period_start } });
    stripeMock.subscriptionSchedules.update.mockRejectedValue(new Error("network unavailable"));
    await expect(changePlan(ctx, { action: "select", plan: "standard" })).rejects.toThrow("network unavailable");
    expect(stripeMock.subscriptionSchedules.release).toHaveBeenCalledWith("sched_new");
    expect(await row(org.id)).toMatchObject({ selectedPlan: "pro", scheduledPlan: null });
  });

  it("requires admin authority", async () => {
    const { ctx } = await setup();
    await expect(changePlan({ ...ctx, isOrgAdmin: false }, { action: "select", plan: "pro" })).rejects.toThrow("admin");
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
  });

  it("upgrades an existing subscription only after Stripe accepts payment", async () => {
    const { org, ctx } = await setup();
    const before = await activate(org.id);
    const after = fakeSubscription({ organizationId: org.id, quantity: 120, billingMode: "selected" });
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    await changePlan(ctx, { action: "select", plan: "pro" });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(before.id, expect.objectContaining({
      items: [{ id: "si_test", quantity: 120 }], payment_behavior: "error_if_incomplete", proration_behavior: "always_invoice",
    }));
    expect(await row(org.id)).toMatchObject({ selectedPlan: "pro", syncedQuantity: 120 });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("failed upgrade payment leaves the paid plan intact", async () => {
    const { org, ctx } = await setup();
    await activate(org.id);
    stripeMock.subscriptions.update.mockRejectedValue({ type: "StripeCardError" });
    await expect(changePlan(ctx, { action: "select", plan: "pro" })).rejects.toThrow("plan has not changed");
    expect(await row(org.id)).toMatchObject({ selectedPlan: "standard", syncedQuantity: 50 });
  });

  it("schedules a downgrade at renewal, then enforces the new capacity without erasing members", async () => {
    const { org, ctx } = await setup(51);
    const before = await activate(org.id, 120);
    const end = before.items.data[0].current_period_end;
    const scheduled = { ...before, schedule: "sched_test" };
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce(before).mockResolvedValueOnce(scheduled);
    stripeMock.subscriptionSchedules.create.mockResolvedValue({ id: "sched_test", current_phase: { start_date: end - 2_592_000 } });
    stripeMock.subscriptionSchedules.retrieve.mockResolvedValue({ phases: [{ start_date: end - 2_592_000, items: [{ quantity: 120 }] }, { start_date: end, items: [{ quantity: 50 }] }] });
    await changePlan(ctx, { action: "select", plan: "standard" });
    expect(stripeMock.subscriptionSchedules.update).toHaveBeenCalledWith("sched_test", expect.objectContaining({
      end_behavior: "release", phases: [expect.objectContaining({ end_date: end, items: [{ price: "price_test", quantity: 120 }] }), expect.objectContaining({ start_date: end, items: [{ price: "price_test", quantity: 50 }] })],
    }));
    expect(await row(org.id)).toMatchObject({ selectedPlan: "pro", scheduledPlan: "standard" });
    await reconcileSeats(ctx.db);
    expect(stripeMock.subscriptionItems.update).not.toHaveBeenCalled();
    await applySubscription(fakeSubscription({ organizationId: org.id, quantity: 50, billingMode: "selected", currentPeriodEnd: end + 2_592_000 }));
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: false, action: "upgrade", limit: 50 });
    expect(await ctx.db.member.count()).toBe(51);
  });

  it("schedules cancellation and keeps paid capacity until it ends", async () => {
    const { org, ctx } = await setup(5);
    const before = await activate(org.id);
    stripeMock.subscriptions.retrieve.mockResolvedValueOnce(before).mockResolvedValueOnce({ ...before, cancel_at_period_end: true });
    await changePlan(ctx, { action: "cancel" });
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith("sub_test", { cancel_at_period_end: true });
    expect(await checkSeatAvailable(ctx.db)).toMatchObject({ allowed: true, limit: 50 });
    expect(await row(org.id)).toMatchObject({ cancelAtPeriodEnd: true });
  });
});
