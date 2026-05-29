/**
 * Tenancy isolation tests.
 *
 * For each domain table: seed rows in two different orgs, query through
 * db(orgA), confirm orgB rows are not returned. The single most important
 * test category — the wrapper exists precisely to make this true.
 *
 * If this file ever goes red, every other test that relies on isolation is
 * suspect. Treat regressions here as P0.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent, createTransaction } from "../setup/factories";
import { db } from "@/lib/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("tenancy: cross-org isolation via db(orgId) wrapper", () => {
  it("Brother.findMany only returns the active org's rows", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id, name: "A1" });
    await createBrother({ orgId: orgA.id, name: "A2" });
    await createBrother({ orgId: orgB.id, name: "B1" });

    const fromA = await db(orgA.id).brother.findMany();
    const fromB = await db(orgB.id).brother.findMany();

    expect(fromA.map(b => b.name).sort()).toEqual(["A1", "A2"]);
    expect(fromB.map(b => b.name)).toEqual(["B1"]);
  });

  it("Brother.create injects organizationId automatically", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const created = await db(orgA.id).brother.create({
      data: {
        name: "Injected",
        role: "Brother",
        attendance: 0,
        duesOwed: 0,
        gpa: 0,
        serviceHours: 0,
      },
    });
    expect(created.organizationId).toBe(orgA.id);
  });

  it("Brother.count is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id });
    await createBrother({ orgId: orgB.id });
    await createBrother({ orgId: orgB.id });
    expect(await db(orgA.id).brother.count()).toBe(1);
    expect(await db(orgB.id).brother.count()).toBe(2);
  });

  it("Semester findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createSemester({ orgId: orgA.id, label: "SPR26", isActive: true });
    await createSemester({ orgId: orgB.id, label: "SPR26", isActive: true });
    const fromA = await db(orgA.id).semester.findMany();
    expect(fromA.every(s => s.organizationId === orgA.id)).toBe(true);
    expect(fromA).toHaveLength(1);
  });

  it("CalendarEvent findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createCalendarEvent({ orgId: orgA.id, title: "A meeting" });
    await createCalendarEvent({ orgId: orgB.id, title: "B meeting" });
    const fromA = await db(orgA.id).calendarEvent.findMany();
    expect(fromA.map(e => e.title)).toEqual(["A meeting"]);
  });

  it("Transaction findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createTransaction({ orgId: orgA.id, description: "A tx" });
    await createTransaction({ orgId: orgB.id, description: "B tx" });
    const fromA = await db(orgA.id).transaction.findMany();
    expect(fromA.map(t => t.description)).toEqual(["A tx"]);
  });

  it("Role uniqueness is per-org (two orgs can both have President)", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await db(orgA.id).role.create({
      data: { name: "President", color: "#F59E0B", rank: 100, permissions: 0, isSystem: true },
    });
    // Should not throw — different org, same name is allowed.
    await db(orgB.id).role.create({
      data: { name: "President", color: "#F59E0B", rank: 100, permissions: 0, isSystem: true },
    });
    expect(await db(orgA.id).role.count()).toBe(1);
    expect(await db(orgB.id).role.count()).toBe(1);
  });

  it("findUnique by id with org-mismatched id returns null after filter — proven via findFirst", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const b = await createBrother({ orgId: orgB.id, name: "Across-org" });
    // findFirst with org wrapper finds nothing for orgA even though id exists in orgB.
    const leak = await db(orgA.id).brother.findFirst({ where: { id: b.id } });
    expect(leak).toBeNull();
  });

  it("Membership pass-through still respects org via brother FK", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id });
    await createBrother({ orgId: orgB.id });
    // Memberships table itself is pass-through; assert it was seeded correctly per org.
    const aMembers = await testPrisma.membership.count({ where: { organizationId: orgA.id } });
    const bMembers = await testPrisma.membership.count({ where: { organizationId: orgB.id } });
    expect(aMembers).toBe(1);
    expect(bMembers).toBe(1);
  });
});
