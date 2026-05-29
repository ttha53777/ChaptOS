/**
 * Permission matrix tests.
 *
 * Validates that the three authorization tiers (regular member, org admin,
 * platform admin) behave correctly for permission checks via computePermissions
 * and hasPermission — the same logic executed by buildContext().
 *
 * These are unit tests over the permission primitives; they do not stand up
 * a full HTTP request. Integration-level permission enforcement is validated
 * by the service tests.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { computePermissions, hasPermission, PERMISSIONS, ALL_PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("computePermissions", () => {
  it("returns 0 for no roles", () => {
    expect(computePermissions([])).toBe(0);
  });

  it("ORs together multiple role permission bitfields", () => {
    const roles = [
      { permissions: PERMISSIONS.MANAGE_BROTHERS, rank: 10 },
      { permissions: PERMISSIONS.MANAGE_TREASURY, rank: 20 },
    ];
    const result = computePermissions(roles);
    expect(hasPermission(result, "MANAGE_BROTHERS")).toBe(true);
    expect(hasPermission(result, "MANAGE_TREASURY")).toBe(true);
    expect(hasPermission(result, "MANAGE_EVENTS")).toBe(false);
  });

  it("a single role with all permissions grants all checks", () => {
    const ALL = ~0 >>> 0;
    const roles = [{ permissions: ALL, rank: 100 }];
    const result = computePermissions(roles);
    for (const perm of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(hasPermission(result, perm)).toBe(true);
    }
  });
});

describe("hasPermission", () => {
  it("returns false when permissions bitfield is 0", () => {
    expect(hasPermission(0, "MANAGE_BROTHERS")).toBe(false);
  });

  it("returns true for each permission when all bits set", () => {
    const ALL = ~0 >>> 0;
    for (const perm of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(hasPermission(ALL, perm)).toBe(true);
    }
  });

  it("only the exact bit matters — adjacent bits do not bleed", () => {
    // Only MANAGE_BROTHERS (bit 0) is set; MANAGE_TREASURY (bit 1) must be false
    expect(hasPermission(PERMISSIONS.MANAGE_BROTHERS, "MANAGE_TREASURY")).toBe(false);
    expect(hasPermission(PERMISSIONS.MANAGE_TREASURY, "MANAGE_BROTHERS")).toBe(false);
  });
});

describe("role assignment: permission resolution from DB", () => {
  it("a brother with no roles has empty permissions", async () => {
    const org = await createOrg("Alpha", "alpha");
    const bro = await createBrother({ orgId: org.id });

    const rows = await testPrisma.brotherRole.findMany({
      where: { brotherId: bro.id },
      select: { role: { select: { permissions: true, rank: true } } },
    });
    expect(rows).toHaveLength(0);
    expect(computePermissions(rows.map(r => r.role))).toBe(0);
  });

  it("a brother assigned a role inherits its permissions", async () => {
    const org  = await createOrg("Alpha", "alpha");
    const bro  = await createBrother({ orgId: org.id });
    const role = await db(org.id).role.create({
      data: { name: "Treasurer", rank: 50, permissions: PERMISSIONS.MANAGE_TREASURY },
    });
    await testPrisma.brotherRole.create({ data: { brotherId: bro.id, roleId: role.id } });

    const rows = await testPrisma.brotherRole.findMany({
      where: { brotherId: bro.id, role: { organizationId: org.id } },
      select: { role: { select: { permissions: true, rank: true } } },
    });
    const perms = computePermissions(rows.map(r => r.role));
    expect(hasPermission(perms, "MANAGE_TREASURY")).toBe(true);
    expect(hasPermission(perms, "MANAGE_BROTHERS")).toBe(false);
  });

  it("role permissions are scoped to org — roles in another org are ignored", async () => {
    const orgA  = await createOrg("Alpha", "alpha");
    const orgB  = await createOrg("Beta",  "beta");
    const bro   = await createBrother({ orgId: orgA.id });

    // Assign a powerful role in orgB (as if the brother somehow had cross-org access)
    const roleB = await db(orgB.id).role.create({
      data: { name: "President", rank: 100, permissions: ALL_PERMISSIONS },
    });
    await testPrisma.brotherRole.create({ data: { brotherId: bro.id, roleId: roleB.id } });

    // Permission lookup MUST filter by organizationId: orgA — orgB role must not count
    const rows = await testPrisma.brotherRole.findMany({
      where: { brotherId: bro.id, role: { organizationId: orgA.id } },
      select: { role: { select: { permissions: true, rank: true } } },
    });
    const perms = computePermissions(rows.map(r => r.role));
    expect(perms).toBe(0);
  });
});

describe("isOrgAdmin: resolves from Membership", () => {
  it("isOrgAdmin=true on Membership is readable and correct", async () => {
    const org   = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const pleb  = await createBrother({ orgId: org.id, isOrgAdmin: false });

    const adminM = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: admin.id, organizationId: org.id } },
    });
    const plebM = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: pleb.id, organizationId: org.id } },
    });

    expect(adminM?.isOrgAdmin).toBe(true);
    expect(plebM?.isOrgAdmin).toBe(false);
  });

  it("isOrgAdmin is per-org — admin in orgA is not admin in orgB", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta",  "beta");
    const bro  = await createBrother({ orgId: orgA.id, isOrgAdmin: true });

    // Add membership to orgB without isOrgAdmin
    await testPrisma.membership.create({
      data: { brotherId: bro.id, organizationId: orgB.id, isOrgAdmin: false },
    });

    const mA = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: bro.id, organizationId: orgA.id } },
    });
    const mB = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: bro.id, organizationId: orgB.id } },
    });

    expect(mA?.isOrgAdmin).toBe(true);
    expect(mB?.isOrgAdmin).toBe(false);
  });
});
