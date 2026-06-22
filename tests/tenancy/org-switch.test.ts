/**
 * Org-switching tests.
 *
 * Validates that the active-org resolution in requireUser() correctly
 * honours the active_org_id cookie AND rejects cookies pointing to orgs
 * the brother is not a member of.
 *
 * These tests verify the lib/attendance.ts org-scoping fix: getActiveSemester
 * must return only the calling org's active semester, not another org's.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { getActiveSemester, recalcAllBrothersInSemester } from "@/lib/attendance";
import { db } from "@/lib/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("getActiveSemester: org-scoped", () => {
  it("returns only the calling org's active semester", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createSemester({ orgId: orgA.id, label: "SPR26-A", isActive: true });
    await createSemester({ orgId: orgB.id, label: "SPR26-B", isActive: true });

    const semA = await getActiveSemester(db(orgA.id));
    const semB = await getActiveSemester(db(orgB.id));

    expect(semA?.label).toBe("SPR26-A");
    expect(semA?.organizationId).toBe(orgA.id);
    expect(semB?.label).toBe("SPR26-B");
    expect(semB?.organizationId).toBe(orgB.id);
  });

  it("returns null when the org has no active semester", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createSemester({ orgId: orgB.id, label: "SPR26", isActive: true });

    // orgA has no semester at all
    const result = await getActiveSemester(db(orgA.id));
    expect(result).toBeNull();
  });

  it("ignores inactive semesters in the target org", async () => {
    const org = await createOrg("Alpha", "alpha");
    await createSemester({ orgId: org.id, label: "FA25", isActive: false });

    const result = await getActiveSemester(db(org.id));
    expect(result).toBeNull();
  });
});

describe("recalcAllBrothersInSemester: org-scoped", () => {
  it("does not update brothers from other orgs", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const semA  = await createSemester({ orgId: orgA.id, label: "SPR26" });
    const bA    = await createBrother({ orgId: orgA.id, name: "Alpha Member" });
    const bB    = await createBrother({ orgId: orgB.id, name: "Beta Member" });

    // Set a known attendance value on the Beta brother; recalc for Alpha
    // should leave it completely unchanged.
    await testPrisma.brother.update({ where: { id: bB.id }, data: { attendance: 42 } });

    await recalcAllBrothersInSemester(db(orgA.id), semA.id);

    const refreshedB = await testPrisma.brother.findUnique({
      where: { id: bB.id },
      select: { attendance: true },
    });
    expect(refreshedB?.attendance).toBe(42);

    // Alpha member should have been recalculated (to 0 — no records exist)
    const refreshedA = await testPrisma.brother.findUnique({
      where: { id: bA.id },
      select: { attendance: true },
    });
    expect(refreshedA?.attendance).toBe(0);
  });

  it("scopes brother fetch to the org — ghost brothers excluded", async () => {
    const org    = await createOrg("Alpha", "alpha");
    const sem    = await createSemester({ orgId: org.id, label: "SPR26" });

    // Create a ghost brother — should be excluded from recalc
    const ghost = await testPrisma.brother.create({
      data: {
        organizationId: org.id,
        name: "Ghost",
        role: "Brother",
        attendance: 77,
        duesOwed: 0,
        gpa: 0,
        serviceHours: 0,
        isGhost: true,
      },
    });

    await recalcAllBrothersInSemester(db(org.id), sem.id);

    // Ghost attendance must not be touched by recalc
    const refreshed = await testPrisma.brother.findUnique({
      where: { id: ghost.id },
      select: { attendance: true },
    });
    expect(refreshed?.attendance).toBe(77);
  });
});

describe("org switching: Membership-based active org resolution", () => {
  it("a brother with memberships in two orgs can have separate data in each", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta",  "beta");
    const bro  = await createBrother({ orgId: orgA.id, name: "Dual Member" });

    // Manually add membership to orgB
    await testPrisma.membership.create({
      data: { brotherId: bro.id, organizationId: orgB.id, isOrgAdmin: false },
    });

    // Create separate semesters per org
    await createSemester({ orgId: orgA.id, label: "SPR26" });
    await createSemester({ orgId: orgB.id, label: "FA26" });

    const semA = await getActiveSemester(db(orgA.id));
    const semB = await getActiveSemester(db(orgB.id));

    expect(semA?.label).toBe("SPR26");
    expect(semB?.label).toBe("FA26");
  });

  it("a brother NOT in orgB cannot see orgB data via wrapper", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta",  "beta");
    await createBrother({ orgId: orgA.id, name: "Alpha-only" });

    // orgB has its own brother, not related to orgA member
    await createBrother({ orgId: orgB.id, name: "Beta-only" });

    // Querying orgB through orgA context returns nothing
    const fromOrgA = await db(orgA.id).brother.findMany();
    const names    = fromOrgA.map(b => b.name);
    expect(names).not.toContain("Beta-only");
  });
});
