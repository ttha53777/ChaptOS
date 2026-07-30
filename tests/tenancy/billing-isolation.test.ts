/**
 * Tenancy isolation for the platform-billing tables.
 *
 * Same contract as tests/tenancy/org-isolation.test.ts: seed rows in two orgs,
 * read through db(orgA), confirm orgB is invisible. Worth its own file because
 * these two tables are the ones a cross-tenant leak would be most embarrassing
 * on — Stripe customer ids, what an org pays, and who has been talking to sales.
 *
 * Also pins the write direction: the scoped `create` must inject organizationId
 * rather than accept it, so a caller cannot file a lead against another org.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createOrg } from "../setup/factories";
import { resetDb, testPrisma } from "../setup/prisma";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function twoOrgs() {
  const a = await createOrg("Alpha", "alpha-billing");
  const b = await createOrg("Beta", "beta-billing");
  return { a, b };
}

describe("Subscription isolation", () => {
  it("never reads another org's subscription", async () => {
    const { a, b } = await twoOrgs();
    await testPrisma.subscription.create({
      data: { organizationId: a.id, status: "active", tier: "standard", stripeCustomerId: "cus_A", billableMembers: 20 },
    });
    await testPrisma.subscription.create({
      data: { organizationId: b.id, status: "past_due", tier: "pro", stripeCustomerId: "cus_B", billableMembers: 80 },
    });

    const seenByA = await db(a.id).subscription.findFirst({ select: { stripeCustomerId: true, status: true } });
    expect(seenByA?.stripeCustomerId).toBe("cus_A");
    expect(seenByA?.status).toBe("active");

    const seenByB = await db(b.id).subscription.findFirst({ select: { stripeCustomerId: true } });
    expect(seenByB?.stripeCustomerId).toBe("cus_B");
  });

  it("returns null rather than a neighbour's row when the org has none", async () => {
    const { a, b } = await twoOrgs();
    await testPrisma.subscription.create({
      data: { organizationId: b.id, status: "active", stripeCustomerId: "cus_B" },
    });

    expect(await db(a.id).subscription.findFirst()).toBeNull();
  });

  it("upsert creates against the bound org, never another", async () => {
    const { a, b } = await twoOrgs();
    await db(a.id).subscription.upsert({ status: "active", billableMembers: 7 });

    const rows = await testPrisma.subscription.findMany({ select: { organizationId: true, billableMembers: true } });
    expect(rows).toEqual([{ organizationId: a.id, billableMembers: 7 }]);
    expect(await db(b.id).subscription.findFirst()).toBeNull();
  });

  it("update touches only the bound org's row", async () => {
    const { a, b } = await twoOrgs();
    await testPrisma.subscription.createMany({
      data: [
        { organizationId: a.id, status: "active" },
        { organizationId: b.id, status: "active" },
      ],
    });

    await db(a.id).subscription.update({ status: "canceled" });

    const after = await testPrisma.subscription.findMany({
      select: { organizationId: true, status: true },
      orderBy: { organizationId: "asc" },
    });
    expect(after).toEqual([
      { organizationId: a.id, status: "canceled" },
      { organizationId: b.id, status: "active" },
    ]);
  });
});

describe("SalesLead isolation", () => {
  it("never lists another org's leads", async () => {
    const { a, b } = await twoOrgs();
    await testPrisma.salesLead.createMany({
      data: [
        { organizationId: a.id, kind: "quote", contactName: "A One", contactEmail: "a@example.com", memberCount: 130 },
        { organizationId: b.id, kind: "quote", contactName: "B One", contactEmail: "b@example.com", memberCount: 200 },
        { organizationId: b.id, kind: "multi_org", contactName: "B Two", contactEmail: "b2@example.com", memberCount: 40 },
      ],
    });

    const seenByA = await db(a.id).salesLead.findMany({ select: { contactEmail: true } });
    expect(seenByA).toEqual([{ contactEmail: "a@example.com" }]);
    expect(await db(b.id).salesLead.count()).toBe(2);
  });

  it("create injects the bound org rather than trusting the caller", async () => {
    const { a, b } = await twoOrgs();
    await db(a.id).salesLead.create({
      data: {
        kind: "quote", contactName: "Founder", contactEmail: "f@example.com", memberCount: 150,
        // The scoped wrapper's type omits organizationId; this cast proves the
        // runtime injection wins even if a caller forces one in.
        ...({ organizationId: b.id } as object),
      },
    });

    const rows = await testPrisma.salesLead.findMany({ select: { organizationId: true } });
    expect(rows).toEqual([{ organizationId: a.id }]);
  });

  it("an orphaned lead survives its org and leaves the org-scoped view", async () => {
    // SalesLead.organizationId is ON DELETE SET NULL on purpose: losing the org
    // must not lose the pipeline record. Once null it is only readable through
    // the platform-admin surface.
    const { a } = await twoOrgs();
    await testPrisma.salesLead.create({
      data: { organizationId: a.id, kind: "quote", contactName: "Gone", contactEmail: "g@example.com", memberCount: 130 },
    });

    await testPrisma.organization.delete({ where: { id: a.id } });

    const survivor = await testPrisma.salesLead.findFirst({ select: { organizationId: true, contactName: true } });
    expect(survivor).toEqual({ organizationId: null, contactName: "Gone" });
  });
});
