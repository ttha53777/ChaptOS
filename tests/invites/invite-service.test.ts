/**
 * Tests for the invite-link service (create / list / revoke) + expiryToDate.
 *
 * We exercise the service directly with a minimal RequestContext stub (the
 * service only touches ctx.db / ctx.actorId, and emit() reads orgId/requestId/
 * actorId/actorName) — same approach as provision-org.test.ts, which avoids the
 * Supabase session validation that POST adds.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import { createInvite, listInvites, listInviteRedemptions, revokeInvite } from "@/lib/services/invite-service";
import { listOffRosterMembers } from "@/lib/services/brother-service";
import { expiryToDate } from "@/lib/validation/invite";
import { deriveInviteStatus } from "@/lib/state";
import { NotFoundError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function makeCtx(orgId: number, actorId: number): RequestContext {
  return {
    requestId:   randomUUID(),
    orgId,
    actorId,
    actorName:   "Tester",
    actorEmail:  null,
    authUserId:  "auth-test",
    membershipId: null,
    permissions: 0,
    maxRank:     0,
    isOrgAdmin:  true,
    db:          db(orgId),
  } as unknown as RequestContext;
}

describe("expiryToDate", () => {
  it("maps each preset to the right offset, never → null", () => {
    const now = new Date("2026-06-02T00:00:00.000Z");
    expect(expiryToDate("never", now)).toBeNull();
    expect(expiryToDate("20m", now)!.getTime()).toBe(now.getTime() + 20 * 60_000);
    expect(expiryToDate("1d", now)!.getTime()).toBe(now.getTime() + 86_400_000);
    expect(expiryToDate("7d", now)!.getTime()).toBe(now.getTime() + 7 * 86_400_000);
    expect(expiryToDate("14d", now)!.getTime()).toBe(now.getTime() + 14 * 86_400_000);
  });
});

describe("createInvite", () => {
  it("creates an invite with token, mode, expiry, and creator; emits invite.created", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);

    const dto = await createInvite(ctx, { mode: "open", expiry: "7d" });

    expect(dto.mode).toBe("open");
    expect(dto.token).toBeTruthy();
    expect(dto.redemptionCount).toBe(0);
    expect(dto.expiresAt).not.toBeNull();

    const row = await testPrisma.orgInvite.findUnique({ where: { id: dto.id } });
    expect(row!.organizationId).toBe(org.id);
    expect(row!.createdByBrotherId).toBe(admin.id);
    expect(row!.mode).toBe("open");

    const ev = await testPrisma.operationalEvent.findFirst({
      where: { organizationId: org.id, action: "invite.created" },
    });
    expect(ev).not.toBeNull();
  });

  it("never expiry stores null expiresAt", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const dto = await createInvite(makeCtx(org.id, admin.id), { mode: "claim", expiry: "never" });
    expect(dto.expiresAt).toBeNull();
  });

  it("round-trips label and maxUses; both default to null", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);

    const labelled = await createInvite(ctx, { mode: "open", expiry: "7d", label: "Fall rush", maxUses: 25 });
    expect(labelled.label).toBe("Fall rush");
    expect(labelled.maxUses).toBe(25);
    expect(labelled.status).toBe("active");

    const bare = await createInvite(ctx, { mode: "open", expiry: "7d" });
    expect(bare.label).toBeNull();
    expect(bare.maxUses).toBeNull();

    const row = await testPrisma.orgInvite.findUnique({ where: { id: labelled.id } });
    expect(row!.label).toBe("Fall rush");
    expect(row!.maxUses).toBe(25);
  });
});

describe("deriveInviteStatus", () => {
  const base = { expiresAt: null, revokedAt: null, maxUses: null };

  it("reports active until something makes it dead", () => {
    expect(deriveInviteStatus(base, 0)).toBe("active");
    expect(deriveInviteStatus({ ...base, expiresAt: new Date(Date.now() + 60_000) }, 0)).toBe("active");
    expect(deriveInviteStatus({ ...base, maxUses: 5 }, 4)).toBe("active");
  });

  it("reports expired, revoked, and exhausted", () => {
    expect(deriveInviteStatus({ ...base, expiresAt: new Date(Date.now() - 1000) }, 0)).toBe("expired");
    expect(deriveInviteStatus({ ...base, revokedAt: new Date() }, 0)).toBe("revoked");
    expect(deriveInviteStatus({ ...base, maxUses: 5 }, 5)).toBe("exhausted");
    // At or over the cap — a soft cap can overshoot under concurrency.
    expect(deriveInviteStatus({ ...base, maxUses: 5 }, 7)).toBe("exhausted");
  });

  it("prefers the reason the admin acted on when several apply", () => {
    const revokedAndExpired = { expiresAt: new Date(Date.now() - 1000), revokedAt: new Date(), maxUses: 1 };
    expect(deriveInviteStatus(revokedAndExpired, 9)).toBe("revoked");
    expect(deriveInviteStatus({ ...revokedAndExpired, revokedAt: null }, 9)).toBe("expired");
  });
});

describe("listInvites", () => {
  it("excludes revoked and expired invites; includes active + never; counts redemptions", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);

    const active = await createInvite(ctx, { mode: "open", expiry: "7d" });
    await createInvite(ctx, { mode: "claim", expiry: "never" });

    // Manually craft an expired + a revoked invite.
    await testPrisma.orgInvite.create({
      data: { organizationId: org.id, token: "expired-tok", mode: "open", createdByBrotherId: admin.id, expiresAt: new Date(Date.now() - 1000) },
    });
    await testPrisma.orgInvite.create({
      data: { organizationId: org.id, token: "revoked-tok", mode: "open", createdByBrotherId: admin.id, revokedAt: new Date() },
    });

    // Add a redemption to the active invite.
    const joiner = await createBrother({ orgId: org.id });
    await testPrisma.inviteRedemption.create({ data: { inviteId: active.id, brotherId: joiner.id } });

    const list = await listInvites(ctx);
    expect(list).toHaveLength(2); // active + never; expired/revoked hidden
    const activeRow = list.find(i => i.id === active.id)!;
    expect(activeRow.redemptionCount).toBe(1);
  });

  it("is org-scoped — org A's invites are invisible to org B", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isOrgAdmin: true });
    await createInvite(makeCtx(orgA.id, adminA.id), { mode: "open", expiry: "7d" });

    const fromB = await listInvites(makeCtx(orgB.id, adminB.id));
    expect(fromB).toHaveLength(0);
  });

  it("hides a link that hit its maxUses cap, and labels it exhausted under includeInactive", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);

    const capped = await createInvite(ctx, { mode: "open", expiry: "7d", maxUses: 2 });
    for (const _ of [0, 1]) {
      const joiner = await createBrother({ orgId: org.id });
      await testPrisma.inviteRedemption.create({ data: { inviteId: capped.id, brotherId: joiner.id } });
    }

    expect(await listInvites(ctx)).toHaveLength(0);

    const all = await listInvites(ctx, { includeInactive: true });
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("exhausted");
    expect(all[0].redemptionCount).toBe(2);
  });

  it("includeInactive returns revoked and expired links with their status", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);

    await createInvite(ctx, { mode: "open", expiry: "7d" });
    await testPrisma.orgInvite.create({
      data: { organizationId: org.id, token: "expired-tok", mode: "open", createdByBrotherId: admin.id, expiresAt: new Date(Date.now() - 1000) },
    });
    await testPrisma.orgInvite.create({
      data: { organizationId: org.id, token: "revoked-tok", mode: "open", createdByBrotherId: admin.id, revokedAt: new Date() },
    });

    expect(await listInvites(ctx)).toHaveLength(1);

    const all = await listInvites(ctx, { includeInactive: true });
    expect(all).toHaveLength(3);
    expect(all.map(i => i.status).sort()).toEqual(["active", "expired", "revoked"]);
    // Revoked rows carry the date, so the UI can say when it happened.
    expect(all.find(i => i.status === "revoked")!.revokedAt).not.toBeNull();
  });
});

describe("listInviteRedemptions", () => {
  it("names each redeemer, newest first, preferring their per-org display name", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);
    const invite = await createInvite(ctx, { mode: "open", expiry: "7d" });

    const plain = await createBrother({ orgId: org.id, name: "Jordan Lee" });
    const renamed = await createBrother({ orgId: org.id, name: "Samir Patel", membershipName: "Sam P." });
    await testPrisma.inviteRedemption.create({
      data: { inviteId: invite.id, brotherId: plain.id, redeemedAt: new Date(Date.now() - 60_000) },
    });
    await testPrisma.inviteRedemption.create({ data: { inviteId: invite.id, brotherId: renamed.id } });

    const rows = await listInviteRedemptions(ctx, invite.id);
    expect(rows.map(r => r.name)).toEqual(["Sam P.", "Jordan Lee"]);
    expect(rows.every(r => r.onRoster)).toBe(true);
  });

  it("flags a redeemer whose home org is elsewhere as off-roster", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const admin = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const ctx = makeCtx(orgA.id, admin.id);
    const invite = await createInvite(ctx, { mode: "open", expiry: "7d" });

    // Lives in org B, joined org A by invite — the multi-org reuse path.
    const visitor = await createBrother({ orgId: orgB.id, name: "Casey Wu" });
    await testPrisma.membership.create({
      data: { brotherId: visitor.id, organizationId: orgA.id, isOrgAdmin: false, name: "Casey" },
    });
    await testPrisma.inviteRedemption.create({ data: { inviteId: invite.id, brotherId: visitor.id } });

    const rows = await listInviteRedemptions(ctx, invite.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Casey");
    expect(rows[0].onRoster).toBe(false);
  });

  it("refuses another org's invite", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isOrgAdmin: true });
    const invite = await createInvite(makeCtx(orgA.id, adminA.id), { mode: "open", expiry: "7d" });

    await expect(listInviteRedemptions(makeCtx(orgB.id, adminB.id), invite.id))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("listOffRosterMembers", () => {
  it("returns members whose home org is elsewhere, and nobody who is on the roster", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const admin = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    await createBrother({ orgId: orgA.id, name: "Local Member" });

    const visitor = await createBrother({ orgId: orgB.id, name: "Casey Wu" });
    await testPrisma.membership.create({
      data: { brotherId: visitor.id, organizationId: orgA.id, isOrgAdmin: false, name: "Casey" },
    });

    const rows = await listOffRosterMembers(makeCtx(orgA.id, admin.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].brotherId).toBe(visitor.id);
    expect(rows[0].name).toBe("Casey"); // per-org name wins
  });

  it("REPORTS ghosts — they hold access to this org and the roster cannot show them", async () => {
    // This assertion used to be `toHaveLength(0)`: ghosts were filtered out here
    // as well as from the roster, so an account with member-level read on this
    // org's GPA and dues appeared on no surface in the product at all. That was
    // the bug, not the contract. Surfacing them is what makes removing the
    // claim-flow backdoor meaningful — the mint path is gone, but rows created
    // before it was removed still carry access and an admin has to be able to
    // see one in order to revoke it. See tests/brothers/off-roster-members.test.ts.
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const admin = await createBrother({ orgId: orgA.id, isOrgAdmin: true });

    const ghost = await createBrother({ orgId: orgB.id, name: "Atomic Samurai", isGhost: true });
    await testPrisma.membership.create({
      data: { brotherId: ghost.id, organizationId: orgA.id, isOrgAdmin: false },
    });

    const rows = await listOffRosterMembers(makeCtx(orgA.id, admin.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brotherId: ghost.id, reason: "hidden" });
  });

  it("is empty when every member is on the roster", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    await createBrother({ orgId: orgA.id, name: "Local Member" });

    expect(await listOffRosterMembers(makeCtx(orgA.id, admin.id))).toHaveLength(0);
  });
});

describe("revokeInvite", () => {
  it("sets revokedAt, is idempotent, emits invite.revoked, NotFound for unknown id", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = makeCtx(org.id, admin.id);
    const dto = await createInvite(ctx, { mode: "open", expiry: "7d" });

    await revokeInvite(ctx, dto.id);
    const row = await testPrisma.orgInvite.findUnique({ where: { id: dto.id } });
    expect(row!.revokedAt).not.toBeNull();

    // Idempotent — second call doesn't throw.
    await expect(revokeInvite(ctx, dto.id)).resolves.toBeUndefined();

    // Unknown id → NotFound.
    await expect(revokeInvite(ctx, 999999)).rejects.toBeInstanceOf(NotFoundError);

    const ev = await testPrisma.operationalEvent.findFirst({
      where: { organizationId: org.id, action: "invite.revoked" },
    });
    expect(ev).not.toBeNull();
  });

  it("cannot revoke another org's invite (NotFound)", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const adminA = await createBrother({ orgId: orgA.id, isOrgAdmin: true });
    const adminB = await createBrother({ orgId: orgB.id, isOrgAdmin: true });
    const dto = await createInvite(makeCtx(orgA.id, adminA.id), { mode: "open", expiry: "7d" });

    await expect(revokeInvite(makeCtx(orgB.id, adminB.id), dto.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
