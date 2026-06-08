/**
 * Tests for leaveOrg() — a member self-disconnecting from the active org.
 *
 * Exercised directly against the test DB (the POST route adds only buildContext
 * session resolution + the same-origin guard on top). The service is what
 * re-checks the confirm slug, enforces the last-admin guard, and tears down the
 * caller's membership + role grants without touching the Brother account or any
 * other org.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { leaveOrg } from "@/lib/services/membership-service";
import { ConflictError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * Minimal RequestContext. leaveOrg reads orgId / actorId / actorName /
 * isOrgAdmin / isPlatformAdmin / db, and emit() reads requestId / actorId.
 */
function ctxFor(
  orgId: number,
  actorId: number,
  opts: { actorName?: string; isOrgAdmin?: boolean; isPlatformAdmin?: boolean } = {},
): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       opts.actorName ?? "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     0,
    maxRank:         0,
    isOrgAdmin:      opts.isOrgAdmin ?? false,
    isPlatformAdmin: opts.isPlatformAdmin ?? false,
    db:              db(orgId),
  };
}

/** Give a brother a role + BrotherRole assignment in an org (no role factory exists). */
async function assignRole(orgId: number, brotherId: number, name = "Treasurer") {
  const role = await testPrisma.role.create({
    data: { organizationId: orgId, name, rank: 50, permissions: 2 },
  });
  await testPrisma.brotherRole.create({
    data: { brotherId, roleId: role.id, organizationId: orgId },
  });
  return role;
}

describe("leaveOrg: happy path", () => {
  it("deletes the caller's membership and role grants in the org", async () => {
    const org = await createOrg("Leave Org", "leave-org");
    // Two members so the leaver isn't the last admin (both plain members here).
    const me = await createBrother({ orgId: org.id });
    await createBrother({ orgId: org.id });
    await assignRole(org.id, me.id);

    const ctx = ctxFor(org.id, me.id);
    const out = await leaveOrg(ctx, "leave-org");

    expect(out).toEqual({ organizationId: org.id, slug: "leave-org" });

    // Membership + role grant gone for the leaver in this org.
    const membership = await testPrisma.membership.findFirst({
      where: { brotherId: me.id, organizationId: org.id },
    });
    expect(membership).toBeNull();
    const grants = await testPrisma.brotherRole.count({
      where: { brotherId: me.id, organizationId: org.id },
    });
    expect(grants).toBe(0);
  });

  it("leaves the Brother row itself intact (account is not deleted)", async () => {
    const org = await createOrg("Keep Brother", "keep-brother");
    const me = await createBrother({ orgId: org.id });
    await createBrother({ orgId: org.id });

    await leaveOrg(ctxFor(org.id, me.id), "keep-brother");

    const brother = await testPrisma.brother.findUnique({ where: { id: me.id } });
    expect(brother).not.toBeNull();
    // Home org pointer is left as-is (not re-homed) per the product decision.
    expect(brother?.organizationId).toBe(org.id);
  });

  it("emits a membership.left operational event", async () => {
    const org = await createOrg("Event Org", "event-org");
    const me = await createBrother({ orgId: org.id });
    await createBrother({ orgId: org.id });

    await leaveOrg(ctxFor(org.id, me.id, { actorName: "Alex" }), "event-org");

    const events = await testPrisma.operationalEvent.findMany({
      where: { organizationId: org.id, action: "membership.left" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(me.id);
  });
});

describe("leaveOrg: last-admin guard", () => {
  it("blocks the only admin from leaving", async () => {
    const org = await createOrg("Solo Admin", "solo-admin");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    await createBrother({ orgId: org.id }); // a plain member, not an admin

    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: true });
    await expect(leaveOrg(ctx, "solo-admin")).rejects.toBeInstanceOf(ConflictError);

    // Membership must still exist — the guard fired before any teardown.
    const membership = await testPrisma.membership.findFirst({
      where: { brotherId: admin.id, organizationId: org.id },
    });
    expect(membership).not.toBeNull();
  });

  it("allows an admin to leave when another admin remains", async () => {
    const org = await createOrg("Two Admins", "two-admins");
    const a = await createBrother({ orgId: org.id, isOrgAdmin: true });
    await createBrother({ orgId: org.id, isOrgAdmin: true });

    const out = await leaveOrg(ctxFor(org.id, a.id, { isOrgAdmin: true }), "two-admins");
    expect(out.organizationId).toBe(org.id);

    const membership = await testPrisma.membership.findFirst({
      where: { brotherId: a.id, organizationId: org.id },
    });
    expect(membership).toBeNull();
  });

  it("allows a non-admin to leave even as the last member", async () => {
    const org = await createOrg("Last Member", "last-member");
    const me = await createBrother({ orgId: org.id }); // only member, not admin

    const out = await leaveOrg(ctxFor(org.id, me.id), "last-member");
    expect(out.organizationId).toBe(org.id);
  });
});

describe("leaveOrg: confirmation", () => {
  it("rejects a mismatched confirm slug with ValidationError", async () => {
    const org = await createOrg("Confirm Org", "confirm-org");
    const me = await createBrother({ orgId: org.id });

    await expect(leaveOrg(ctxFor(org.id, me.id), "wrong-slug")).rejects.toBeInstanceOf(ValidationError);

    const membership = await testPrisma.membership.findFirst({
      where: { brotherId: me.id, organizationId: org.id },
    });
    expect(membership).not.toBeNull();
  });
});

describe("leaveOrg: tenancy", () => {
  it("only drops the membership in the actor's active org, not their other orgs", async () => {
    const orgA = await createOrg("Org A", "org-a");
    const orgB = await createOrg("Org B", "org-b");
    // Brother is a member of A (via factory) and B (manual second membership).
    const me = await createBrother({ orgId: orgA.id });
    await testPrisma.membership.create({
      data: { brotherId: me.id, organizationId: orgB.id, isOrgAdmin: false },
    });
    // A role grant in B must survive a leave from A.
    await assignRole(orgB.id, me.id, "Secretary");

    await leaveOrg(ctxFor(orgA.id, me.id), "org-a");

    const inA = await testPrisma.membership.findFirst({ where: { brotherId: me.id, organizationId: orgA.id } });
    const inB = await testPrisma.membership.findFirst({ where: { brotherId: me.id, organizationId: orgB.id } });
    expect(inA).toBeNull();
    expect(inB).not.toBeNull();

    const grantsInB = await testPrisma.brotherRole.count({ where: { brotherId: me.id, organizationId: orgB.id } });
    expect(grantsInB).toBe(1);
  });
});
