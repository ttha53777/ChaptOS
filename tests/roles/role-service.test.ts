/**
 * Tests for the role service — the privilege-escalation surface.
 *
 * Two guards stack on every mutating path:
 *   - rank gate: a caller may only touch roles whose rank is STRICTLY below their
 *     own maxRank (create/edit/delete/grant/revoke).
 *   - assignable-permissions gate: a role's permission bits may only include bits
 *     the caller already holds — without this a non-admin with MANAGE_ROLES could
 *     mint a lower-rank role carrying bits they were never granted and self-grant
 *     it (role-service.ts:34).
 * System roles are additionally protected from rename/delete.
 *
 * Admins (org or platform) hold every bit and infinite maxRank, so both guards
 * are no-ops for them. The route layer is thin — these tests drive the service.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import {
  createRole,
  updateRole,
  deleteRole,
  grantRole,
  revokeRole,
  listRoles,
} from "@/lib/services/role-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMISSIONS, ALL_PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/** Build a context for an actor. Defaults to a plain member (no perms, no rank). */
function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     0,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
    ...over,
  };
}

/** Org + an admin actor (full bits, infinite rank — bypasses every guard). */
async function seedOrg() {
  const org = await createOrg("Role Org", "role-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  const adminCtx = ctxFor(org.id, admin.id, {
    isOrgAdmin:  true,
    permissions: ~0 >>> 0,
    maxRank:     Number.POSITIVE_INFINITY,
  });
  return { org, admin, adminCtx };
}

/** Raw-create a role (bypasses the service guards) for arrange steps. */
function seedRole(orgId: number, over: Partial<{ name: string; rank: number; permissions: number; isSystem: boolean }> = {}) {
  return testPrisma.role.create({
    data: {
      organizationId: orgId,
      name:           over.name ?? `Role ${Math.random().toString(36).slice(2, 7)}`,
      rank:           over.rank ?? 0,
      permissions:    over.permissions ?? 0,
      isSystem:       over.isSystem ?? false,
    },
  });
}

// ---------------------------------------------------------------------------
// Escalation guard: assertAssignablePermissions
// ---------------------------------------------------------------------------

describe("assignable-permissions guard", () => {
  it("a MANAGE_ROLES non-admin cannot create a role with bits they don't hold", async () => {
    const { org } = await seedOrg();
    const officer = await createBrother({ orgId: org.id });
    // Holds MANAGE_ROLES and a usable rank, but NOT MANAGE_TREASURY.
    const officerCtx = ctxFor(org.id, officer.id, { permissions: PERMISSIONS.MANAGE_ROLES, maxRank: 50 });

    await expect(
      createRole(officerCtx, { name: "Treasurer", rank: 10, permissions: PERMISSIONS.MANAGE_TREASURY }),
    ).rejects.toThrow(ForbiddenError);
    expect(await testPrisma.role.count({ where: { organizationId: org.id, name: "Treasurer" } })).toBe(0);
  });

  it("can create a role with only bits the actor holds", async () => {
    const { org } = await seedOrg();
    const officer = await createBrother({ orgId: org.id });
    const officerCtx = ctxFor(org.id, officer.id, { permissions: PERMISSIONS.MANAGE_ROLES, maxRank: 50 });

    const role = await createRole(officerCtx, { name: "Sub-officer", rank: 10, permissions: PERMISSIONS.MANAGE_ROLES });
    expect(role.permissions).toBe(PERMISSIONS.MANAGE_ROLES);
  });

  it("cannot widen an existing role to bits the actor doesn't hold", async () => {
    const { org } = await seedOrg();
    const officer = await createBrother({ orgId: org.id });
    const officerCtx = ctxFor(org.id, officer.id, { permissions: PERMISSIONS.MANAGE_ROLES, maxRank: 50 });
    const role = await seedRole(org.id, { rank: 10 });

    await expect(
      updateRole(officerCtx, role.id, { permissions: PERMISSIONS.MANAGE_TREASURY }),
    ).rejects.toThrow(ForbiddenError);
    expect((await testPrisma.role.findUnique({ where: { id: role.id } }))?.permissions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rank gate
// ---------------------------------------------------------------------------

describe("rank gate", () => {
  it("cannot create a role at or above the actor's own rank", async () => {
    const { org } = await seedOrg();
    const officer = await createBrother({ orgId: org.id });
    const officerCtx = ctxFor(org.id, officer.id, { permissions: PERMISSIONS.MANAGE_ROLES, maxRank: 20 });

    await expect(createRole(officerCtx, { name: "Equal", rank: 20, permissions: 0 })).rejects.toThrow(ForbiddenError);
    await expect(createRole(officerCtx, { name: "Above", rank: 21, permissions: 0 })).rejects.toThrow(ForbiddenError);
    // Strictly below is allowed.
    await expect(createRole(officerCtx, { name: "Below", rank: 19, permissions: 0 })).resolves.toMatchObject({ rank: 19 });
  });

  it("cannot edit / delete / grant / revoke a role at or above the actor's rank", async () => {
    const { org } = await seedOrg();
    const officer = await createBrother({ orgId: org.id });
    const member = await createBrother({ orgId: org.id });
    const officerCtx = ctxFor(org.id, officer.id, { permissions: PERMISSIONS.MANAGE_ROLES, maxRank: 20 });
    const peerRole = await seedRole(org.id, { rank: 20 }); // == maxRank

    await expect(updateRole(officerCtx, peerRole.id, { name: "x" })).rejects.toThrow(ForbiddenError);
    await expect(deleteRole(officerCtx, peerRole.id)).rejects.toThrow(ForbiddenError);
    await expect(grantRole(officerCtx, member.id, peerRole.id)).rejects.toThrow(ForbiddenError);
    await expect(revokeRole(officerCtx, member.id, peerRole.id)).rejects.toThrow(ForbiddenError);
  });

  it("cannot raise a role's rank to or above the actor's own", async () => {
    const { org } = await seedOrg();
    const officer = await createBrother({ orgId: org.id });
    const officerCtx = ctxFor(org.id, officer.id, { permissions: PERMISSIONS.MANAGE_ROLES, maxRank: 20 });
    const role = await seedRole(org.id, { rank: 5 });

    await expect(updateRole(officerCtx, role.id, { rank: 20 })).rejects.toThrow(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// System role protection
// ---------------------------------------------------------------------------

describe("system roles", () => {
  it("cannot be renamed", async () => {
    const { org, adminCtx } = await seedOrg();
    const sys = await seedRole(org.id, { isSystem: true, rank: 5 });
    await expect(updateRole(adminCtx, sys.id, { name: "Renamed" })).rejects.toThrow(ValidationError);
  });

  it("cannot be deleted", async () => {
    const { org, adminCtx } = await seedOrg();
    const sys = await seedRole(org.id, { isSystem: true, rank: 5 });
    await expect(deleteRole(adminCtx, sys.id)).rejects.toThrow(ValidationError);
    expect(await testPrisma.role.findUnique({ where: { id: sys.id } })).not.toBeNull();
  });

  it("can still be re-colored (only name/delete are protected)", async () => {
    const { org, adminCtx } = await seedOrg();
    const sys = await seedRole(org.id, { isSystem: true, rank: 5 });
    const updated = await updateRole(adminCtx, sys.id, { color: "#5865F2" });
    expect(updated.color).toBe("#5865F2");
  });
});

// ---------------------------------------------------------------------------
// grant / revoke semantics
// ---------------------------------------------------------------------------

describe("grant / revoke", () => {
  it("granting a role a brother already holds throws ConflictError", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    const role = await seedRole(org.id, { rank: 5 });

    await grantRole(adminCtx, member.id, role.id);
    await expect(grantRole(adminCtx, member.id, role.id)).rejects.toThrow(ConflictError);
    expect(await testPrisma.brotherRole.count({ where: { brotherId: member.id, roleId: role.id } })).toBe(1);
  });

  it("revoking a role the brother never held is an idempotent no-op", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    const role = await seedRole(org.id, { rank: 5 });

    await expect(revokeRole(adminCtx, member.id, role.id)).resolves.toEqual({ revoked: false });
  });

  it("revoking a role that no longer exists returns {revoked:false} without throwing", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    // 999999 never existed in this org.
    await expect(revokeRole(adminCtx, member.id, 999999)).resolves.toEqual({ revoked: false });
  });

  it("revoking a held role returns {revoked:true} and removes the assignment", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    const role = await seedRole(org.id, { rank: 5 });
    await grantRole(adminCtx, member.id, role.id);

    await expect(revokeRole(adminCtx, member.id, role.id)).resolves.toEqual({ revoked: true });
    expect(await testPrisma.brotherRole.count({ where: { brotherId: member.id, roleId: role.id } })).toBe(0);
  });

  it("granting / revoking a missing brother throws NotFoundError", async () => {
    const { org, adminCtx } = await seedOrg();
    const role = await seedRole(org.id, { rank: 5 });
    await expect(grantRole(adminCtx, 999999, role.id)).rejects.toThrow(NotFoundError);
    await expect(revokeRole(adminCtx, 999999, role.id)).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Admin bypass + tenancy
// ---------------------------------------------------------------------------

describe("admin bypass & tenancy", () => {
  it("an org admin bypasses both guards (full bits, infinite rank)", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });

    // Mint a high-rank role carrying every bit, then grant it — impossible for a
    // non-admin, a no-op for the admin.
    const role = await createRole(adminCtx, { name: "Exec", rank: 99, permissions: ALL_PERMISSIONS });
    expect(role.permissions).toBe(ALL_PERMISSIONS);
    await expect(grantRole(adminCtx, member.id, role.id)).resolves.toMatchObject({ roleId: role.id });
  });

  it("updateRole / deleteRole on a foreign-org role id throw NotFound", async () => {
    const { adminCtx } = await seedOrg();
    const otherOrg = await createOrg("Other", "other-role-org");
    const foreign = await seedRole(otherOrg.id, { rank: 5 });

    await expect(updateRole(adminCtx, foreign.id, { name: "x" })).rejects.toThrow(NotFoundError);
    await expect(deleteRole(adminCtx, foreign.id)).rejects.toThrow(NotFoundError);
  });

  it("listRoles returns only this org's roles with member counts", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    const role = await seedRole(org.id, { name: "Counted", rank: 5 });
    await grantRole(adminCtx, member.id, role.id);
    const otherOrg = await createOrg("Other", "other-role-org");
    await seedRole(otherOrg.id, { name: "Foreign", rank: 5 });

    const roles = await listRoles(adminCtx);
    expect(roles.map(r => r.name)).toContain("Counted");
    expect(roles.map(r => r.name)).not.toContain("Foreign");
    expect(roles.find(r => r.name === "Counted")?.memberCount).toBe(1);
  });
});
