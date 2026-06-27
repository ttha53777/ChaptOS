/**
 * Tests for the brother service. Three things matter here for safety/integrity:
 *
 *   - deleteBrother last-admin guard: deleting the FINAL admin (Brother.isAdmin)
 *     is blocked so an org can never be left with no one who can administer it.
 *   - dues access split: updateBrother lets full MANAGE_BROTHERS edit duesOwed,
 *     but a self-edit (no perm) may only touch profile + service hours — duesOwed
 *     in a self-edit payload is silently dropped, never written.
 *   - custom-field sanitization: values are coerced/truncated against the org's
 *     server-side field definitions; unknown ids are stripped, never persisted.
 *
 * The hard permission gate on create/delete lives at the route boundary
 * (requirePerm: "MANAGE_BROTHERS"), not in the service — so this suite drives the
 * service directly and asserts the in-service invariants above.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { createBrother as createBrotherSvc, updateBrother, deleteBrother } from "@/lib/services/brother-service";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import type { CustomMemberFieldDef } from "@/lib/custom-member-fields";
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

async function seedOrg() {
  const org = await createOrg("Brother Org", "brother-org");
  const admin = await createBrother({ orgId: org.id, isAdmin: true, isOrgAdmin: true });
  const adminCtx = ctxFor(org.id, admin.id, {
    isOrgAdmin:  true,
    permissions: PERMISSIONS.MANAGE_BROTHERS,
  });
  return { org, admin, adminCtx };
}

/** Seed the org's custom field definitions on its config row. */
async function seedFieldDefs(orgId: number, defs: CustomMemberFieldDef[]) {
  await testPrisma.organizationConfig.upsert({
    where:  { organizationId: orgId },
    create: { organizationId: orgId, customMemberFields: defs as unknown as object },
    update: { customMemberFields: defs as unknown as object },
  });
}

// ---------------------------------------------------------------------------
// Last-admin guard
// ---------------------------------------------------------------------------

describe("deleteBrother last-admin guard", () => {
  it("blocks deleting the final admin", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    // admin is the only isAdmin brother in the org.
    await expect(deleteBrother(adminCtx, admin.id)).rejects.toThrow(ConflictError);
    expect(await testPrisma.brother.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it("allows deleting an admin when another admin remains", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const second = await createBrother({ orgId: org.id, isAdmin: true, isOrgAdmin: true });

    await deleteBrother(adminCtx, second.id);
    expect(await testPrisma.brother.findUnique({ where: { id: second.id } })).toBeNull();
    // The original admin survives.
    expect(await testPrisma.brother.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it("allows deleting a non-admin member regardless of admin count", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    await deleteBrother(adminCtx, member.id);
    expect(await testPrisma.brother.findUnique({ where: { id: member.id } })).toBeNull();
  });

  it("deleting a missing / foreign-org brother throws NotFound", async () => {
    const { adminCtx } = await seedOrg();
    const otherOrg = await createOrg("Other", "other-brother-org");
    const foreign = await createBrother({ orgId: otherOrg.id });

    await expect(deleteBrother(adminCtx, 999999)).rejects.toThrow(NotFoundError);
    await expect(deleteBrother(adminCtx, foreign.id)).rejects.toThrow(NotFoundError);
    // The foreign brother is untouched.
    expect(await testPrisma.brother.findUnique({ where: { id: foreign.id } })).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dues access split
// ---------------------------------------------------------------------------

describe("duesOwed access control", () => {
  it("MANAGE_BROTHERS can edit duesOwed", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    const mgr = await createBrother({ orgId: org.id });
    const mgrCtx = ctxFor(org.id, mgr.id, { permissions: PERMISSIONS.MANAGE_BROTHERS });

    const updated = await updateBrother(mgrCtx, member.id, { duesOwed: 150 });
    expect(updated.duesOwed).toBe(150);
  });

  it("a self-editing member (no perm) cannot write duesOwed — it is silently dropped", async () => {
    const { org } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    // Member starts owing 99; seed it directly since the service won't set it.
    await testPrisma.brother.update({ where: { id: member.id }, data: { duesOwed: 99 } });

    const selfCtx = ctxFor(org.id, member.id); // no perms, not admin
    const updated = await updateBrother(selfCtx, member.id, { duesOwed: 0, serviceHours: 12 });

    // serviceHours (allowed) is applied; duesOwed (disallowed) is unchanged.
    expect(updated.serviceHours).toBe(12);
    expect(updated.duesOwed).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Custom-field sanitization
// ---------------------------------------------------------------------------

describe("custom-field sanitization", () => {
  const defs: CustomMemberFieldDef[] = [
    { id: "pledge_class", label: "Pledge Class", type: "text",   required: false, showOnRoster: true,  rosterOrder: 0 },
    { id: "jersey_num",   label: "Jersey #",     type: "number", required: false, showOnRoster: false, rosterOrder: 1 },
  ];

  it("createBrother strips unknown ids and coerces values to the field type", async () => {
    const { org, adminCtx } = await seedOrg();
    await seedFieldDefs(org.id, defs);

    const created = await createBrotherSvc(adminCtx, {
      name: "Custom", role: "Brother", duesOwed: 0, gpa: 0, serviceHours: 0,
      customFields: {
        pledge_class: "Alpha",
        jersey_num:   "23",        // string → coerced to number
        ghost_field:  "leak",      // unknown id → stripped
      },
    });

    const stored = (await testPrisma.brother.findUnique({ where: { id: created.id } }))!.customFields as Record<string, unknown>;
    expect(stored.pledge_class).toBe("Alpha");
    expect(stored.jersey_num).toBe(23);
    expect(stored).not.toHaveProperty("ghost_field");
  });

  it("updateBrother truncates over-length text values to MAX_VALUE (255)", async () => {
    const { org, adminCtx } = await seedOrg();
    await seedFieldDefs(org.id, defs);
    const member = await createBrother({ orgId: org.id });

    const long = "x".repeat(500);
    const updated = await updateBrother(adminCtx, member.id, { customFields: { pledge_class: long } });
    const stored = (updated.customFields as Record<string, unknown>).pledge_class as string;
    expect(stored).toHaveLength(255);
  });

  it("self-edit may still write custom fields (allowed for both tiers)", async () => {
    const { org } = await seedOrg();
    await seedFieldDefs(org.id, defs);
    const member = await createBrother({ orgId: org.id });
    const selfCtx = ctxFor(org.id, member.id);

    const updated = await updateBrother(selfCtx, member.id, { customFields: { pledge_class: "Beta" } });
    expect((updated.customFields as Record<string, unknown>).pledge_class).toBe("Beta");
  });
});
