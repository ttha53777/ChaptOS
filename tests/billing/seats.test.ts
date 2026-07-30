/**
 * Billable headcount.
 *
 * The whole reason countBillableMembers isn't just Brother.count() is that this
 * app has two divergent notions of "member" and each one alone gets the bill
 * wrong in a different direction:
 *
 *   roster-only member   Brother row, no Membership. Never signed in, but a real
 *                        managed person. Counting only Memberships would bill an
 *                        org with 100 members for the 3 officers who log in.
 *   multi-org member     Membership here, Brother homed in another org. Counting
 *                        only Brothers would miss them entirely.
 *
 * These tests pin both directions plus the two exclusions (ghost, archived).
 * Deliberately built with testPrisma rather than the createBrother factory,
 * because that factory always creates a Membership and the interesting cases are
 * the ones where the two sources disagree.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { countBillableMembers } from "@/lib/billing/seats";
import { createOrg } from "../setup/factories";
import { resetDb, testPrisma } from "../setup/prisma";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/** A Brother row homed in `orgId`, with no Membership unless asked for. */
async function makeBrother(orgId: number, opts: {
  isGhost?: boolean;
  archived?: boolean;
  withMembership?: boolean;
} = {}) {
  const brother = await testPrisma.brother.create({
    data: {
      organizationId: orgId,
      name:           `M${Math.random().toString(36).slice(2, 8)}`,
      role:           "Brother",
      attendance:     0, duesOwed: 0, gpa: 0, serviceHours: 0,
      isGhost:        opts.isGhost ?? false,
      archivedAt:     opts.archived ? new Date() : null,
    },
  });
  if (opts.withMembership) {
    await testPrisma.membership.create({
      data: { brotherId: brother.id, organizationId: orgId },
    });
  }
  return brother;
}

describe("countBillableMembers", () => {
  it("counts roster-only members who have never signed in", async () => {
    const org = await createOrg("Roster Only", "roster-only");
    await makeBrother(org.id);
    await makeBrother(org.id);
    await makeBrother(org.id);

    expect(await countBillableMembers(db(org.id))).toBe(3);
  });

  it("counts a person with both a Brother row and a Membership exactly once", async () => {
    const org = await createOrg("Dedupe", "dedupe");
    await makeBrother(org.id, { withMembership: true });

    expect(await countBillableMembers(db(org.id))).toBe(1);
  });

  it("counts a multi-org member whose home org is elsewhere", async () => {
    const home = await createOrg("Home", "home");
    const other = await createOrg("Other", "other");

    // Brother lives in `home`; they hold a Membership in `other`. Phase 1 roster
    // reads scope by Brother.organizationId, so `other` cannot see them on its
    // roster — but they can sign in and use it, so `other` is billed for them.
    const roamer = await makeBrother(home.id);
    await testPrisma.membership.create({
      data: { brotherId: roamer.id, organizationId: other.id },
    });

    expect(await countBillableMembers(db(home.id))).toBe(1);
    expect(await countBillableMembers(db(other.id))).toBe(1);
  });

  it("excludes ghosts from both sources", async () => {
    const org = await createOrg("Ghosts", "ghosts");
    await makeBrother(org.id);
    await makeBrother(org.id, { isGhost: true });
    await makeBrother(org.id, { isGhost: true, withMembership: true });

    expect(await countBillableMembers(db(org.id))).toBe(1);
  });

  it("excludes archived members from both sources", async () => {
    const org = await createOrg("Archived", "archived");
    await makeBrother(org.id);
    await makeBrother(org.id, { archived: true });
    await makeBrother(org.id, { archived: true, withMembership: true });

    expect(await countBillableMembers(db(org.id))).toBe(1);
  });

  it("does not count an archived member who is only reachable via membership", async () => {
    // The exclusion has to be re-applied on the membership arm too: that query
    // starts from Membership, so the Brother row was never filtered.
    const home = await createOrg("H", "h2");
    const other = await createOrg("O", "o2");
    const roamer = await makeBrother(home.id, { archived: true });
    await testPrisma.membership.create({
      data: { brotherId: roamer.id, organizationId: other.id },
    });

    expect(await countBillableMembers(db(other.id))).toBe(0);
  });

  it("never counts another org's members", async () => {
    const a = await createOrg("A", "a-org");
    const b = await createOrg("B", "b-org");
    await makeBrother(a.id, { withMembership: true });
    await makeBrother(a.id, { withMembership: true });
    await makeBrother(b.id, { withMembership: true });

    expect(await countBillableMembers(db(a.id))).toBe(2);
    expect(await countBillableMembers(db(b.id))).toBe(1);
  });

  it("returns 0 for an empty org", async () => {
    const org = await createOrg("Empty", "empty");
    expect(await countBillableMembers(db(org.id))).toBe(0);
  });
});
