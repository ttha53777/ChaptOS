/**
 * Billable headcount.
 *
 * countBillableMembers used to union two divergent notions of "member" — Brother
 * rows homed here, plus Memberships held here — because each alone got the bill
 * wrong in a different direction: counting only Memberships would bill a 100-person
 * org for its 3 officers who log in, and counting only Brothers would miss anyone
 * whose account had originated elsewhere.
 *
 * Phase 2 collapsed those two notions into one. A seat IS a roster row and a
 * roster row IS a Membership, so this is now a single count. These tests survive
 * the change deliberately: every case they pinned must still come out the same,
 * including the two that used to exercise the seams (a roster-only member who has
 * never signed in, and a member of an org their account did not originate in).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { countBillableMembers } from "@/lib/billing/seats";
import { createOrg, createBrother, joinOrg } from "../setup/factories";
import { resetDb, testPrisma } from "../setup/prisma";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * A member of `orgId` — identity row plus roster row.
 *
 * `withMembership` is retained as a no-op flag so the cases below still read as
 * the scenarios they were written for. It has no effect any more: every roster
 * row is a Membership, so there is no longer a way to be a member without one.
 * Ghost and archived remain meaningful, and are what the exclusions key on.
 */
async function makeBrother(orgId: number, opts: {
  isGhost?: boolean;
  archived?: boolean;
  withMembership?: boolean;
} = {}) {
  return createBrother({
    orgId,
    name:       `M${Math.random().toString(36).slice(2, 8)}`,
    isGhost:    opts.isGhost ?? false,
    archivedAt: opts.archived ? new Date() : null,
  });
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

    // Their account originated in `home`; they also hold a roster spot in
    // `other`. Both orgs are billed for them, because both have a person to
    // manage — and neither is billed twice.
    const roamer = await makeBrother(home.id);
    await joinOrg({ brotherId: roamer.id, orgId: other.id });

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

  it("archives per-org: each org's own row decides whether it pays", async () => {
    // Archiving is per-org now, so this asserts something sharper than it used
    // to: archiving someone in `home` does NOT archive them in `other`, and
    // `other` is still billed for them. What `other` archives is its own row.
    const home = await createOrg("H", "h2");
    const other = await createOrg("O", "o2");
    const roamer = await makeBrother(home.id, { archived: true });
    await joinOrg({ brotherId: roamer.id, orgId: other.id, archivedAt: new Date() });

    expect(await countBillableMembers(db(home.id))).toBe(0);
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
