/**
 * Tests for applyRoleSet() — the onboarding-only role replacement. This path
 * deliberately bypasses the role service's isSystem rename/delete guards by
 * writing through ctx.db directly, so the invariants it MUST hold are tested
 * hard here:
 *   - the founder always keeps a rank-100 ALL_PERMISSIONS role + its assignment,
 *   - the other seeded roles are replaced by the proposed ones (isSystem=false),
 *   - it refuses on a non-fresh org (so the bypass can't be abused later),
 *   - it stays org-scoped (a second org is untouched).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { applyRoleSet, type RoleToApply } from "@/lib/services/org-setup-service";
import { ForbiddenError } from "@/lib/errors";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, opts: { isOrgAdmin?: boolean } = {}): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Founder",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     ALL_PERMISSIONS,
    maxRank:         Number.POSITIVE_INFINITY,
    isOrgAdmin:      opts.isOrgAdmin ?? true,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

/**
 * Seed a fresh org the way provisioning does: a founder Brother holding a
 * rank-100 ALL_PERMISSIONS isSystem role, plus a couple of other seeded isSystem
 * roles (Treasurer/Social) with no members — the ones applyRoleSet should replace.
 */
async function seedProvisionedOrg() {
  const org = await createOrg("Setup Org", "setup-org");
  const founder = await createBrother({ orgId: org.id, isOrgAdmin: true });

  const president = await testPrisma.role.create({
    data: { organizationId: org.id, name: "President", color: "#F59E0B", rank: 100, permissions: ALL_PERMISSIONS, isSystem: true },
  });
  await testPrisma.role.create({
    data: { organizationId: org.id, name: "Treasurer", color: "#10B981", rank: 50, permissions: PERMISSIONS.MANAGE_TREASURY, isSystem: true },
  });
  await testPrisma.role.create({
    data: { organizationId: org.id, name: "Social", color: "#EC4899", rank: 50, permissions: PERMISSIONS.MANAGE_EVENTS, isSystem: true },
  });
  // Founder holds the rank-100 role.
  await testPrisma.brotherRole.create({
    data: { brotherId: founder.id, roleId: president.id, organizationId: org.id },
  });
  return { org, founder, presidentRoleId: president.id };
}

const PROPOSED: RoleToApply[] = [
  { name: "Captain",    rank: 80, permissions: PERMISSIONS.MANAGE_EVENTS | PERMISSIONS.MANAGE_ATTENDANCE, color: "#3B82F6" },
  { name: "Co-Captain", rank: 60, permissions: PERMISSIONS.MANAGE_EVENTS, color: "#10B981" },
];

describe("applyRoleSet: founder preservation", () => {
  it("keeps the founder's rank-100 ALL_PERMISSIONS role and assignment", async () => {
    const { org, founder, presidentRoleId } = await seedProvisionedOrg();
    const ctx = ctxFor(org.id, founder.id);

    await applyRoleSet(ctx, PROPOSED);

    // The preserved role still exists, unchanged in rank + permissions.
    const preserved = await testPrisma.role.findUnique({ where: { id: presidentRoleId } });
    expect(preserved).not.toBeNull();
    expect(preserved!.rank).toBe(100);
    expect(preserved!.permissions).toBe(ALL_PERMISSIONS);
    // The founder still holds it.
    const link = await testPrisma.brotherRole.findFirst({ where: { brotherId: founder.id, roleId: presidentRoleId } });
    expect(link).not.toBeNull();
  });
});

describe("applyRoleSet: replacement", () => {
  it("deletes the other seeded roles and creates the proposed ones (non-system)", async () => {
    const { org, founder } = await seedProvisionedOrg();
    const ctx = ctxFor(org.id, founder.id);

    await applyRoleSet(ctx, PROPOSED);

    const roles = await testPrisma.role.findMany({ where: { organizationId: org.id }, orderBy: { rank: "desc" } });
    const names = roles.map(r => r.name);
    // Seeded Treasurer/Social gone; President (founder) kept; proposed added.
    expect(names).toContain("President");
    expect(names).not.toContain("Treasurer");
    expect(names).not.toContain("Social");
    expect(names).toContain("Captain");
    expect(names).toContain("Co-Captain");
    // Proposed roles are editable later (isSystem=false) with correct bits + rank<100.
    const captain = roles.find(r => r.name === "Captain")!;
    expect(captain.isSystem).toBe(false);
    expect(captain.rank).toBeLessThan(100);
    expect(captain.permissions).toBe(PERMISSIONS.MANAGE_EVENTS | PERMISSIONS.MANAGE_ATTENDANCE);
  });

  it("never lets a proposed rank reach 100 even if passed in", async () => {
    const { org, founder } = await seedProvisionedOrg();
    const ctx = ctxFor(org.id, founder.id);
    await applyRoleSet(ctx, [{ name: "Sneaky", rank: 100, permissions: 0, color: "#ffffff" }]);
    const sneaky = await testPrisma.role.findFirst({ where: { organizationId: org.id, name: "Sneaky" } });
    expect(sneaky!.rank).toBeLessThan(100);
  });
});

describe("applyRoleSet: fresh-org gate", () => {
  it("refuses once the org has a non-founder member", async () => {
    const { org, founder } = await seedProvisionedOrg();
    await createBrother({ orgId: org.id }); // a second member → no longer fresh
    const ctx = ctxFor(org.id, founder.id);

    await expect(applyRoleSet(ctx, PROPOSED)).rejects.toBeInstanceOf(ForbiddenError);
    // Seeded roles untouched.
    const treasurer = await testPrisma.role.findFirst({ where: { organizationId: org.id, name: "Treasurer" } });
    expect(treasurer).not.toBeNull();
  });
});

describe("applyRoleSet: authorization + tenancy", () => {
  it("rejects a non-admin", async () => {
    const { org, founder } = await seedProvisionedOrg();
    const ctx = ctxFor(org.id, founder.id, { isOrgAdmin: false });
    await expect(applyRoleSet(ctx, PROPOSED)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only touches the actor's own org", async () => {
    const { org: orgA, founder: founderA } = await seedProvisionedOrg();
    const orgB = await createOrg("Other Org", "other-org");
    await testPrisma.role.create({
      data: { organizationId: orgB.id, name: "Treasurer", color: "#10B981", rank: 50, permissions: 0, isSystem: true },
    });

    await applyRoleSet(ctxFor(orgA.id, founderA.id), PROPOSED);

    // Org B's role is untouched.
    const bRole = await testPrisma.role.findFirst({ where: { organizationId: orgB.id, name: "Treasurer" } });
    expect(bRole).not.toBeNull();
  });
});
