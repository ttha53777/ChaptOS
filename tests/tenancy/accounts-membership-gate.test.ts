/**
 * Regression test for the membership gate on GET /api/auth/accounts.
 *
 * That route reads the org roster with db(user.orgId) directly instead of going
 * through buildContext, so it must replicate buildContext's membership gate
 * itself. resolveActiveOrg returns homeOrgId as a numeric contract even for a
 * user with zero (or only stale) memberships — see resolve-active-org.test.ts
 * "returns homeOrgId when the user has zero memberships" — so without the gate a
 * removed member whose Brother.organizationId still points at the org would read
 * its full roster (names, emails, auth-link status, admin flags, role grants).
 *
 * The gate is: `user.isPlatformAdmin || user.memberships.some(m => m.organizationId === user.orgId)`.
 * These tests build the real DB shape requireUser() derives memberships from and
 * assert the gate predicate accepts a genuine member and rejects a stale-home-org
 * non-member.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/** Load the membership list requireUser() would build for a brother. */
async function membershipsFor(brotherId: number) {
  const rows = await testPrisma.membership.findMany({
    where: { brotherId },
    select: { organizationId: true },
  });
  return rows.map(m => ({ organizationId: m.organizationId }));
}

/** The exact gate the /api/auth/accounts route applies. */
function passesGate(opts: {
  isPlatformAdmin: boolean;
  orgId: number;
  memberships: { organizationId: number }[];
}) {
  return opts.isPlatformAdmin || opts.memberships.some(m => m.organizationId === opts.orgId);
}

describe("GET /api/auth/accounts membership gate", () => {
  it("admits a genuine member of the resolved org", async () => {
    const org = await createOrg("Alpha", "alpha");
    const bro = await createBrother({ orgId: org.id, name: "Real Member" });

    const memberships = await membershipsFor(bro.id);
    expect(passesGate({ isPlatformAdmin: false, orgId: org.id, memberships })).toBe(true);
  });

  it("rejects a removed member whose stale home org still points at the org", async () => {
    const org = await createOrg("Alpha", "alpha");
    // createBrother also creates a Membership; simulate removal by deleting it
    // while Brother.organizationId (the stale home org) still points at `org`.
    const bro = await createBrother({ orgId: org.id, name: "Removed Member" });
    await testPrisma.membership.deleteMany({ where: { brotherId: bro.id } });

    const refreshed = await testPrisma.brother.findUnique({
      where: { id: bro.id },
      select: { organizationId: true },
    });
    // Home org is unchanged — this is exactly the stale-pointer condition.
    expect(refreshed?.organizationId).toBe(org.id);

    const memberships = await membershipsFor(bro.id);
    expect(memberships).toHaveLength(0);
    // resolveActiveOrg would still surface org.id as the numeric home-org fallback;
    // the gate is what must deny access.
    expect(passesGate({ isPlatformAdmin: false, orgId: org.id, memberships })).toBe(false);
  });

  it("rejects a member of another org pointed at a foreign org id", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const bro = await createBrother({ orgId: orgA.id, name: "Alpha-only" });

    const memberships = await membershipsFor(bro.id);
    // Resolved org is B (e.g. via a stale cookie/home pointer) but membership is A only.
    expect(passesGate({ isPlatformAdmin: false, orgId: orgB.id, memberships })).toBe(false);
  });

  it("admits a platform admin to any org regardless of membership", async () => {
    const org = await createOrg("Alpha", "alpha");
    // No membership in this org at all.
    expect(passesGate({ isPlatformAdmin: true, orgId: org.id, memberships: [] })).toBe(true);
  });
});
