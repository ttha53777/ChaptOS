import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events/emit";
import { deliverAdmissionEvents } from "@/lib/events/admission-delivery";
import { dispatchHandlers } from "@/lib/events/dispatch";

vi.mock("@/lib/events/dispatch", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/events/dispatch")>(),
  dispatchHandlers: vi.fn(),
}));
beforeEach(async () => { await resetDb(); vi.mocked(dispatchHandlers).mockReset(); });
afterAll(() => testPrisma.$disconnect());
async function setup() {
  const org = await createOrg("Alpha", "alpha");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  return { orgId: org.id, actorId: admin.id, actorName: "Officer", db: db(org.id), requestId: randomUUID() } as RequestContext;
}
async function queue(ctx: RequestContext) {
  await ctx.db.$transaction(tx => emit(ctx, "join_request.rejected", { type: "JoinRequest", id: 1 }, { name: "Applicant" }, { transaction: tx }));
}

it("rollback loses neither half of a decision: fact and delivery intent roll back too", async () => {
  const ctx = await setup();
  await expect(ctx.db.$transaction(async tx => {
    await emit(ctx, "join_request.rejected", { type: "JoinRequest", id: 1 }, { name: "Applicant" }, { transaction: tx });
    throw new Error("abort");
  })).rejects.toThrow("abort");
  expect(await testPrisma.operationalEvent.count()).toBe(0);
  expect(await testPrisma.activityLog.count()).toBe(0);
});

it("a commit without inline delivery is recovered; duplicate workers do not repeat activity", async () => {
  const ctx = await setup();
  await queue(ctx);
  expect(dispatchHandlers).not.toHaveBeenCalled();
  await Promise.all([deliverAdmissionEvents(ctx), deliverAdmissionEvents(ctx)]);
  expect(dispatchHandlers).toHaveBeenCalledTimes(1);
  expect(await testPrisma.operationalEvent.findFirst()).toMatchObject({ deliveryPending: false, deliveryAttempts: 1 });
  expect(await testPrisma.activityLog.count()).toBe(1);
});

it("failed delivery backs off and can be retried without another event or activity", async () => {
  const ctx = await setup();
  await queue(ctx);
  vi.mocked(dispatchHandlers).mockRejectedValueOnce(new Error("reaction unavailable"));
  expect(await deliverAdmissionEvents(ctx)).toMatchObject({ failed: 1 });
  const row = await testPrisma.operationalEvent.findFirstOrThrow();
  expect(row.deliveryPending).toBe(true);
  expect(row.deliveryAvailableAt!.getTime()).toBeGreaterThan(Date.now());
  await deliverAdmissionEvents(ctx);
  expect(dispatchHandlers).toHaveBeenCalledTimes(1);
  await testPrisma.operationalEvent.update({ where: { id: row.id }, data: { deliveryAvailableAt: new Date(0) } });
  await deliverAdmissionEvents(ctx);
  expect(await testPrisma.operationalEvent.findFirst()).toMatchObject({ deliveryPending: false, deliveryAttempts: 2 });
  expect(await testPrisma.activityLog.count()).toBe(1);
});

it("a worker cannot claim another org's work and expired leases recover", async () => {
  const ctx = await setup();
  await queue(ctx);
  const other = await createOrg("Beta", "beta");
  expect(await deliverAdmissionEvents({ ...ctx, orgId: other.id, db: db(other.id) })).toEqual({ delivered: 0, failed: 0 });
  await testPrisma.operationalEvent.updateMany({ data: { deliveryLeaseUntil: new Date(Date.now() + 60_000) } });
  await deliverAdmissionEvents(ctx);
  expect(dispatchHandlers).not.toHaveBeenCalled();
  await testPrisma.operationalEvent.updateMany({ data: { deliveryLeaseUntil: new Date(0) } });
  expect(await deliverAdmissionEvents(ctx)).toMatchObject({ delivered: 1 });
});
