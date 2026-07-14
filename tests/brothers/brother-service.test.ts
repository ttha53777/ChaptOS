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
import { createBrother as createBrotherSvc, updateBrother, deleteBrother, listVisibleBrothers } from "@/lib/services/brother-service";
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
// duesOwed is not a field you can write
// ---------------------------------------------------------------------------

/**
 * duesOwed is a money balance mirrored by the Transaction ledger, so updateBrother must
 * not move it FOR ANYONE — not self-editors, and (the change here) not admins either.
 * A raw write moves one book and not the other, which is how the roster came to say
 * members were square while the ledger said the chapter had collected nothing.
 *
 * It moves only through lib/services/dues-service.ts, which writes both sides at once.
 * See tests/treasury/dues-service.test.ts.
 */
describe("duesOwed is not writable through updateBrother", () => {
  it("even full MANAGE_BROTHERS cannot write duesOwed — it is dropped", async () => {
    const { org } = await seedOrg();
    const member = await createBrother({ orgId: org.id, duesOwed: 99 });
    const mgr = await createBrother({ orgId: org.id });
    const mgrCtx = ctxFor(org.id, mgr.id, { permissions: PERMISSIONS.MANAGE_BROTHERS });

    // Zod strips the key, so a stray PATCH is a no-op rather than a corruption. Cast past
    // the input type — the point is to prove the runtime drops it even when a client lies.
    const updated = await updateBrother(mgrCtx, member.id, { duesOwed: 0, gpa: 3.5 } as never);

    expect(updated.gpa).toBe(3.5);        // allowed field applied
    expect(updated.duesOwed).toBe(99);    // balance untouched
  });

  it("a self-editing member cannot write duesOwed either", async () => {
    const { org } = await seedOrg();
    const member = await createBrother({ orgId: org.id, duesOwed: 99 });

    const selfCtx = ctxFor(org.id, member.id); // no perms, not admin
    const updated = await updateBrother(selfCtx, member.id, { duesOwed: 0, serviceHours: 12 } as never);

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

/**
 * Per-org display names. A person is one Brother (one Google account) but many
 * Memberships, and a name is an org-local identity — the same human can be "Rob"
 * in one chapter and "Robert Chen" in another. Membership.name holds the org-local
 * name; null falls back to the account-level Brother.name.
 *
 * The invariant that matters: renaming yourself in one org must never change what
 * another org calls you, and must never touch the Brother row.
 */
describe("brother-service: per-org display names", () => {
  it("updateBrother writes Membership.name and leaves Brother.name alone", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id, name: "Robert Chen" });

    await updateBrother(adminCtx, member.id, { name: "Rob" });

    const membership = await testPrisma.membership.findFirst({
      where: { brotherId: member.id, organizationId: org.id },
      select: { name: true },
    });
    expect(membership?.name).toBe("Rob");

    // The account-level name is untouched — it's not this org's to rewrite.
    const brother = await testPrisma.brother.findUnique({
      where: { id: member.id },
      select: { name: true },
    });
    expect(brother?.name).toBe("Robert Chen");
  });

  it("falls back to writing Brother.name when the target has no Membership", async () => {
    // A roster-only member: an admin added them, they have no auth account and so
    // never joined — no Membership row exists. setName is an updateMany, so it
    // reports count 0 and the write falls back to the Brother row, which is the
    // same row listVisibleBrothers falls back to reading for them.
    const { org, adminCtx } = await seedOrg();
    const rosterOnly = await createBrotherSvc(adminCtx, {
      name: "Paper Member", role: "Brother", duesOwed: 0, gpa: 0, serviceHours: 0,
    });

    await updateBrother(adminCtx, rosterOnly.id, { name: "Renamed" });

    const brother = await testPrisma.brother.findUnique({
      where: { id: rosterOnly.id },
      select: { name: true },
    });
    expect(brother?.name).toBe("Renamed");

    const roster = await listVisibleBrothers(adminCtx);
    expect(roster.find(b => b.id === rosterOnly.id)?.name).toBe("Renamed");
  });

  it("listVisibleBrothers prefers Membership.name and falls back on null", async () => {
    const { org, adminCtx } = await seedOrg();
    const renamed  = await createBrother({ orgId: org.id, name: "Robert Chen", membershipName: "Rob" });
    const fallback = await createBrother({ orgId: org.id, name: "Plain Jane" });

    const roster = await listVisibleBrothers(adminCtx);
    expect(roster.find(b => b.id === renamed.id)?.name).toBe("Rob");
    expect(roster.find(b => b.id === fallback.id)?.name).toBe("Plain Jane");
  });

  it("one person, two orgs, two names — each org's roster shows its own", async () => {
    // The money case. One Brother row, a Membership in each org, a different name
    // on each. Neither org can see or affect the other's name.
    const orgA = await createOrg("Org A", "org-a");
    const orgB = await createOrg("Org B", "org-b");

    const adminA = await createBrother({ orgId: orgA.id, isAdmin: true, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isAdmin: true, isOrgAdmin: true });

    // The multi-org member: Brother row lives in org A (their legacy home org),
    // but they hold a Membership in BOTH.
    const person = await createBrother({ orgId: orgA.id, name: "Robert Chen", membershipName: "Rob" });
    await testPrisma.membership.create({
      data: { brotherId: person.id, organizationId: orgB.id, isOrgAdmin: false, name: "Bobby" },
    });

    const ctxA = ctxFor(orgA.id, adminA.id, { isOrgAdmin: true, permissions: PERMISSIONS.MANAGE_BROTHERS });
    const rosterA = await listVisibleBrothers(ctxA);
    expect(rosterA.find(b => b.id === person.id)?.name).toBe("Rob");

    // Renaming in org B must not disturb org A.
    const ctxB = ctxFor(orgB.id, adminB.id, { isOrgAdmin: true, permissions: PERMISSIONS.MANAGE_BROTHERS });
    await updateBrother(ctxB, person.id, { name: "Robert" });

    const membershipB = await testPrisma.membership.findFirst({
      where: { brotherId: person.id, organizationId: orgB.id },
      select: { name: true },
    });
    expect(membershipB?.name).toBe("Robert");

    const membershipA = await testPrisma.membership.findFirst({
      where: { brotherId: person.id, organizationId: orgA.id },
      select: { name: true },
    });
    expect(membershipA?.name).toBe("Rob");

    const brother = await testPrisma.brother.findUnique({
      where: { id: person.id },
      select: { name: true },
    });
    expect(brother?.name).toBe("Robert Chen");

    expect((await listVisibleBrothers(ctxA)).find(b => b.id === person.id)?.name).toBe("Rob");
  });
});
