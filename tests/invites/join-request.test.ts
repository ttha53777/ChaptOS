/**
 * The reviewed join flow, end to end at the service layer.
 *
 * Two halves, deliberately tested together because the invariant that matters
 * spans both: filing a request must create NOTHING in the org, and approving it
 * must create everything at once.
 *
 *   submitJoinRequest    pre-auth  (lib/auth/join-request-submit.ts)
 *   approve / reject     officer   (lib/services/join-request-service.ts)
 *
 * The pre-auth half takes the caller's identity as a plain argument rather than
 * reading a Supabase session, so it needs no auth mocking — the route above it
 * owns that seam. The officer half runs against a stub RequestContext, the same
 * approach invite-service.test.ts uses.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, rosterOf, accountOf } from "../setup/factories";
import { db } from "@/lib/db";
import { submitJoinRequest } from "@/lib/auth/join-request-submit";
import {
  listPendingRequests, countPendingRequests, approveJoinRequest, rejectJoinRequest,
} from "@/lib/services/join-request-service";
import { JoinRequestStatus } from "@/lib/state";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function makeCtx(orgId: number, actorId: number, maxRank = 100): RequestContext {
  return {
    requestId:    randomUUID(),
    orgId,
    actorId,
    actorName:    "Officer",
    actorEmail:   null,
    authUserId:   "auth-officer",
    membershipId: null,
    permissions:  0,
    maxRank,
    isOrgAdmin:   true,
    db:           db(orgId),
  } as unknown as RequestContext;
}

async function seedInvite(opts: {
  orgId: number; createdBy: number; token?: string;
  maxUses?: number | null; expiresAt?: Date | null; revokedAt?: Date | null; label?: string | null;
}) {
  return testPrisma.orgInvite.create({
    data: {
      organizationId:     opts.orgId,
      token:              opts.token ?? `tok-${randomUUID()}`,
      label:              opts.label ?? null,
      maxUses:            opts.maxUses ?? null,
      expiresAt:          opts.expiresAt ?? null,
      revokedAt:          opts.revokedAt ?? null,
      createdByBrotherId: opts.createdBy,
    },
  });
}

const asker = (id: string, email = `${id}@example.com`) => ({
  authUserId: id, email, avatarUrl: null,
});

// ─────────────────────────────────────────────────────────────────────────────

describe("submitJoinRequest", () => {
  it("files a request and creates NOTHING in the org", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    const out = await submitJoinRequest(inv.token, "Jordan Lee", asker("google-1"));
    expect(out).toMatchObject({ ok: true, state: "pending", orgSlug: "alpha" });

    const req = await testPrisma.joinRequest.findFirst({ where: { authUserId: "google-1" } });
    expect(req).toMatchObject({
      organizationId: org.id, inviteId: inv.id, name: "Jordan Lee",
      status: JoinRequestStatus.Pending, brotherId: null, decidedById: null,
    });

    // The whole point: no identity, no roster spot, no redemption yet.
    expect(await testPrisma.brother.findUnique({ where: { authUserId: "google-1" } })).toBeNull();
    expect(await testPrisma.membership.count({ where: { organizationId: org.id } })).toBe(1); // just the admin
    expect(await testPrisma.inviteRedemption.count()).toBe(0);
  });

  it("is idempotent on re-submit and does NOT overwrite the name", async () => {
    // The silent-rename bug the old redeem route carried: resubmitting a form
    // you shouldn't have been shown rewrote your display name.
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    await submitJoinRequest(inv.token, "Jordan Lee", asker("google-1"));
    const again = await submitJoinRequest(inv.token, "SOMETHING ELSE", asker("google-1"));

    expect(again).toMatchObject({ ok: true, state: "pending" });
    const rows = await testPrisma.joinRequest.findMany({ where: { authUserId: "google-1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Jordan Lee");
  });

  it("tells an existing member they already belong, without writing", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const member = await createBrother({ orgId: org.id, name: "Existing", membershipName: "Existing" });
    await testPrisma.brother.update({ where: { id: member.id }, data: { authUserId: "google-9" } });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    const out = await submitJoinRequest(inv.token, "Renamed!", asker("google-9"));
    expect(out).toMatchObject({ ok: true, state: "already_member" });
    expect(await testPrisma.joinRequest.count()).toBe(0);
    // And their roster name is untouched.
    expect((await rosterOf(member.id, org.id))!.name).toBe("Existing");
  });

  it("answers already_member BEFORE the dead-link gate", async () => {
    // Someone who already has access must not be handed "this link expired" for
    // a link that has nothing left to do for them.
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const member = await createBrother({ orgId: org.id });
    await testPrisma.brother.update({ where: { id: member.id }, data: { authUserId: "google-9" } });
    const inv = await seedInvite({
      orgId: org.id, createdBy: admin.id, expiresAt: new Date(Date.now() - 1000),
    });

    expect(await submitJoinRequest(inv.token, "X", asker("google-9")))
      .toMatchObject({ ok: true, state: "already_member" });
  });

  it("refuses revoked, expired and unknown links", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });

    const expired = await seedInvite({ orgId: org.id, createdBy: admin.id, expiresAt: new Date(Date.now() - 1000) });
    const revoked = await seedInvite({ orgId: org.id, createdBy: admin.id, revokedAt: new Date() });

    expect(await submitJoinRequest(expired.token, "A", asker("g-a")))
      .toMatchObject({ ok: false, state: "dead", reason: "expired" });
    expect(await submitJoinRequest(revoked.token, "B", asker("g-b")))
      .toMatchObject({ ok: false, state: "dead", reason: "revoked" });
    expect(await submitJoinRequest("no-such-token", "C", asker("g-c")))
      .toMatchObject({ ok: false, state: "dead", reason: "not_found" });

    expect(await testPrisma.joinRequest.count()).toBe(0);
  });

  it("counts pending requests against maxUses, not just admissions", async () => {
    // A link capped at 2 must not collect an unbounded queue.
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, maxUses: 2 });

    expect(await submitJoinRequest(inv.token, "One", asker("g-1"))).toMatchObject({ ok: true });
    expect(await submitJoinRequest(inv.token, "Two", asker("g-2"))).toMatchObject({ ok: true });
    expect(await submitJoinRequest(inv.token, "Three", asker("g-3")))
      .toMatchObject({ ok: false, state: "full" });

    expect(await testPrisma.joinRequest.count()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("rejection", () => {
  it("blocks the same link but a NEW link revives the request", async () => {
    // This is the whole reason the row is kept rather than deleted.
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);
    const first = await seedInvite({ orgId: org.id, createdBy: admin.id });

    await submitJoinRequest(first.token, "Jordan", asker("google-1"));
    const [pending] = await listPendingRequests(ctx);
    await rejectJoinRequest(ctx, pending.id);

    // Same link: dead for them specifically.
    expect(await submitJoinRequest(first.token, "Jordan", asker("google-1")))
      .toMatchObject({ ok: false, state: "rejected" });
    expect(await countPendingRequests(ctx)).toBe(0);

    // A link the officer chose to send them: back in the queue, same row.
    const second = await seedInvite({ orgId: org.id, createdBy: admin.id });
    expect(await submitJoinRequest(second.token, "Jordan Lee", asker("google-1")))
      .toMatchObject({ ok: true, state: "pending" });

    const rows = await testPrisma.joinRequest.findMany({ where: { authUserId: "google-1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: JoinRequestStatus.Pending, inviteId: second.id, name: "Jordan Lee",
      decidedAt: null, decidedById: null,
    });
    expect(await countPendingRequests(ctx)).toBe(1);
  });

  it("creates no identity, roster spot or redemption", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    await submitJoinRequest(inv.token, "Jordan", asker("google-1"));
    const [pending] = await listPendingRequests(ctx);
    await rejectJoinRequest(ctx, pending.id);

    expect(await testPrisma.brother.findUnique({ where: { authUserId: "google-1" } })).toBeNull();
    expect(await testPrisma.membership.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await testPrisma.inviteRedemption.count()).toBe(0);

    const row = await testPrisma.joinRequest.findFirst({ where: { authUserId: "google-1" } });
    expect(row).toMatchObject({ status: JoinRequestStatus.Rejected, decidedById: admin.id });
    expect(row!.decidedAt).not.toBeNull();
  });

  it("refuses to decide an already-decided request", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    await submitJoinRequest(inv.token, "Jordan", asker("google-1"));
    const [pending] = await listPendingRequests(ctx);
    await rejectJoinRequest(ctx, pending.id);

    await expect(rejectJoinRequest(ctx, pending.id)).rejects.toThrow(ConflictError);
    await expect(approveJoinRequest(ctx, pending.id, { roleId: null })).rejects.toThrow(ConflictError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("approveJoinRequest", () => {
  it("creates the identity, the roster spot and the redemption together", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id, label: "Fall rush" });

    await submitJoinRequest(inv.token, "Jordan Lee", asker("google-1", "jordan@example.com"));
    const [pending] = await listPendingRequests(ctx);
    expect(pending).toMatchObject({ name: "Jordan Lee", email: "jordan@example.com", inviteLabel: "Fall rush" });

    const result = await approveJoinRequest(ctx, pending.id, { roleId: null });

    const account = await accountOf(result.brotherId);
    expect(account).toMatchObject({ authUserId: "google-1", email: "jordan@example.com", name: "Jordan Lee" });

    const roster = await rosterOf(result.brotherId, org.id);
    expect(roster).toMatchObject({
      name: "Jordan Lee", role: "Member", isOrgAdmin: false,
      duesOwed: 0, gpa: 0, serviceHours: 0, attendance: 0,
    });

    // The redemption is written HERE, so "who got in through this link" means
    // people actually admitted.
    expect(await testPrisma.inviteRedemption.count({ where: { inviteId: inv.id } })).toBe(1);

    const row = await testPrisma.joinRequest.findUnique({ where: { id: pending.id } });
    expect(row).toMatchObject({
      status: JoinRequestStatus.Approved, brotherId: result.brotherId, decidedById: admin.id,
    });
    expect(await countPendingRequests(ctx)).toBe(0);
  });

  it("grants the chosen role", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id, 100);
    const role = await testPrisma.role.create({
      data: { organizationId: org.id, name: "Treasurer", rank: 50, permissions: 2 },
    });
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    await submitJoinRequest(inv.token, "Jordan", asker("google-1"));
    const [pending] = await listPendingRequests(ctx);
    const result = await approveJoinRequest(ctx, pending.id, { roleId: role.id });

    expect(result.roleName).toBe("Treasurer");
    const held = await testPrisma.brotherRole.findMany({ where: { brotherId: result.brotherId } });
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ roleId: role.id, organizationId: org.id });
  });

  it("refuses a role at or above the approver's own rank", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const peer = await testPrisma.role.create({
      data: { organizationId: org.id, name: "President", rank: 50, permissions: 0 },
    });
    const ctx = makeCtx(org.id, admin.id, 50); // same rank — not strictly below
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    await submitJoinRequest(inv.token, "Jordan", asker("google-1"));
    const [pending] = await listPendingRequests(ctx);

    await expect(approveJoinRequest(ctx, pending.id, { roleId: peer.id })).rejects.toThrow(ForbiddenError);
    // And nothing was half-created on the way out.
    expect(await testPrisma.brother.findUnique({ where: { authUserId: "google-1" } })).toBeNull();
    expect(await countPendingRequests(ctx)).toBe(1);
  });

  it("404s an unknown role", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);
    const inv = await seedInvite({ orgId: org.id, createdBy: admin.id });

    await submitJoinRequest(inv.token, "Jordan", asker("google-1"));
    const [pending] = await listPendingRequests(ctx);
    await expect(approveJoinRequest(ctx, pending.id, { roleId: 999999 })).rejects.toThrow(NotFoundError);
  });

  it("reuses an existing account and gives them a SECOND roster spot", async () => {
    // The multi-org case: one Google account, a separate roster row per chapter,
    // with its own name and its own numbers.
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isOrgAdmin: true });

    const existing = await createBrother({ orgId: orgA.id, name: "Rob", membershipName: "Rob", duesOwed: 120 });
    await testPrisma.brother.update({ where: { id: existing.id }, data: { authUserId: "google-7" } });

    const inv = await seedInvite({ orgId: orgB.id, createdBy: adminB.id });
    await submitJoinRequest(inv.token, "Robert Chen", asker("google-7"));

    const ctxB = makeCtx(orgB.id, adminB.id);
    const [pending] = await listPendingRequests(ctxB);
    const result = await approveJoinRequest(ctxB, pending.id, { roleId: null });

    expect(result.brotherId).toBe(existing.id); // reused, not duplicated
    expect(await testPrisma.brother.count({ where: { authUserId: "google-7" } })).toBe(1);

    // Two roster rows, independent.
    expect((await rosterOf(existing.id, orgA.id))).toMatchObject({ name: "Rob", duesOwed: 120 });
    expect((await rosterOf(existing.id, orgB.id))).toMatchObject({ name: "Robert Chen", duesOwed: 0 });

    // Alpha's officer sees nothing of Beta's decision.
    const ctxA = makeCtx(orgA.id, adminA.id);
    expect(await countPendingRequests(ctxA)).toBe(0);
  });

  it("puts a multi-org person through the same review, not a fast path", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminB = await createBrother({ orgId: orgB.id, isOrgAdmin: true });
    const existing = await createBrother({ orgId: orgA.id, name: "Rob" });
    await testPrisma.brother.update({ where: { id: existing.id }, data: { authUserId: "google-7" } });

    const inv = await seedInvite({ orgId: orgB.id, createdBy: adminB.id });
    const out = await submitJoinRequest(inv.token, "Rob", asker("google-7"));

    expect(out).toMatchObject({ ok: true, state: "pending" });
    // Still no membership in B until someone signs off.
    expect(await rosterOf(existing.id, orgB.id)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("tenancy", () => {
  it("one org's officer cannot see, approve or reject another org's requests", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isOrgAdmin: true });

    const invB = await seedInvite({ orgId: orgB.id, createdBy: adminB.id });
    await submitJoinRequest(invB.token, "Beta Hopeful", asker("google-b"));

    const ctxA = makeCtx(orgA.id, adminA.id);
    const ctxB = makeCtx(orgB.id, adminB.id);

    expect(await listPendingRequests(ctxA)).toHaveLength(0);
    expect(await listPendingRequests(ctxB)).toHaveLength(1);

    const [betaRequest] = await listPendingRequests(ctxB);
    await expect(approveJoinRequest(ctxA, betaRequest.id, { roleId: null })).rejects.toThrow(NotFoundError);
    await expect(rejectJoinRequest(ctxA, betaRequest.id)).rejects.toThrow(NotFoundError);

    // Still pending, untouched, and no roster spot leaked into Alpha.
    expect(await countPendingRequests(ctxB)).toBe(1);
    expect(await testPrisma.membership.count({ where: { organizationId: orgA.id } })).toBe(1);
  });

  it("the same person can have a live request in two orgs at once", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isOrgAdmin: true });
    const invA = await seedInvite({ orgId: orgA.id, createdBy: adminA.id });
    const invB = await seedInvite({ orgId: orgB.id, createdBy: adminB.id });

    await submitJoinRequest(invA.token, "Jordan", asker("google-1"));
    await submitJoinRequest(invB.token, "Jordan", asker("google-1"));

    expect(await countPendingRequests(makeCtx(orgA.id, adminA.id))).toBe(1);
    expect(await countPendingRequests(makeCtx(orgB.id, adminB.id))).toBe(1);

    // Rejecting in A leaves B's queue alone — the unique key is per (org, person).
    const ctxA = makeCtx(orgA.id, adminA.id);
    const [inA] = await listPendingRequests(ctxA);
    await rejectJoinRequest(ctxA, inA.id);

    expect(await countPendingRequests(ctxA)).toBe(0);
    expect(await countPendingRequests(makeCtx(orgB.id, adminB.id))).toBe(1);
  });
});
