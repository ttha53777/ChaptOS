/**
 * The claim flow's name match, after names became org-local.
 *
 * /api/auth/claim links a Google account to an existing, unclaimed roster row by
 * matching a typed name case-insensitively within the resolved org. Once a person
 * can be listed under a Membership.name that differs from their Brother.name,
 * matching only the Brother row would 404 a legitimate claim — the roster shows
 * one name, the claim looks up another.
 *
 * So the query matches EITHER name. The route itself is gated on a Supabase
 * session (awkward to stub — see provision-org.test.ts), so these tests drive the
 * exact org-scoped query the route runs and assert the three outcomes it branches
 * on: no match (404), exactly one (link), more than one (409).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/** The claim route's name-match query, verbatim (app/api/auth/claim/route.ts). */
function claimMatches(orgId: number, name: string) {
  return db(orgId).brother.findMany({
    where: {
      OR: [
        { name: { equals: name, mode: "insensitive" } },
        { memberships: { some: { organizationId: orgId, name: { equals: name, mode: "insensitive" } } } },
      ],
    },
    select: { id: true, authUserId: true },
  });
}

describe("claim: name match is org-local", () => {
  it("matches on the account-level Brother.name", async () => {
    const org = await createOrg("Claim Org", "claim-org");
    const b = await createBrother({ orgId: org.id, name: "Robert Chen" });

    const matches = await claimMatches(org.id, "robert chen");
    expect(matches.map(m => m.id)).toEqual([b.id]);
  });

  it("matches on this org's Membership.name when it differs from Brother.name", async () => {
    // The roster lists them as "Rob"; their account says "Robert Chen". Typing
    // what the roster shows must find them.
    const org = await createOrg("Claim Org", "claim-org");
    const b = await createBrother({ orgId: org.id, name: "Robert Chen", membershipName: "Rob" });

    const matches = await claimMatches(org.id, "rob");
    expect(matches.map(m => m.id)).toEqual([b.id]);
  });

  it("matching on both names still yields ONE row, not a false ambiguity 409", async () => {
    // The OR is over Brother rows, so someone whose Membership.name equals their
    // Brother.name satisfies both arms — and must still be a single match.
    const org = await createOrg("Claim Org", "claim-org");
    const b = await createBrother({ orgId: org.id, name: "Same Name", membershipName: "Same Name" });

    const matches = await claimMatches(org.id, "same name");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(b.id);
  });

  it("still reports ambiguity when two different people share a name", async () => {
    const org = await createOrg("Claim Org", "claim-org");
    await createBrother({ orgId: org.id, name: "John Smith" });
    await createBrother({ orgId: org.id, name: "John Smith" });

    const matches = await claimMatches(org.id, "john smith");
    expect(matches.length).toBeGreaterThan(1); // → route returns 409
  });

  it("does not match a name that only exists in ANOTHER org", async () => {
    // Tenancy: a Membership.name in org B must be invisible to a claim in org A,
    // or org A could enumerate/claim org B's roster.
    const orgA = await createOrg("Org A", "org-a");
    const orgB = await createOrg("Org B", "org-b");

    await createBrother({ orgId: orgB.id, name: "Brother Name B", membershipName: "Only In B" });

    expect(await claimMatches(orgA.id, "Only In B")).toHaveLength(0);
    expect(await claimMatches(orgA.id, "Brother Name B")).toHaveLength(0);
  });
});
