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
import { createInvite, listInvites, revokeInvite } from "@/lib/services/invite-service";
import { expiryToDate } from "@/lib/validation/invite";
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
