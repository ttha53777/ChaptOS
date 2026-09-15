import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother } from "../setup/factories";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { submitJoinRequest } from "@/lib/auth/join-request-submit";
import { resolveInviteToken } from "@/lib/auth/invite-lookup";
import { resolveJoinViewer } from "@/lib/auth/join-viewer";
import { approveJoinRequest, rejectJoinRequest, listPendingRequestPage } from "@/lib/services/join-request-service";
import { listInvites, revokeInvite } from "@/lib/services/invite-service";
import { updateBrother } from "@/lib/services/brother-service";

beforeEach(resetDb);
afterAll(() => testPrisma.$disconnect());
const who = (id = randomUUID()) => ({ authUserId: id, email: "applicant@example.com", avatarUrl: null });
async function setup(slug = "alpha", maxUses: number | null = null) {
  const org = await createOrg(slug, slug);
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  const ctx = { orgId: org.id, actorId: admin.id, actorName: admin.name, authUserId: admin.authUserId,
    requestId: randomUUID(), db: db(org.id), maxRank: 100, permissions: 0, isOrgAdmin: true,
  } as RequestContext;
  const invite = await testPrisma.orgInvite.create({ data: { organizationId: org.id, token: randomUUID(), maxUses } });
  return { org, ctx, invite };
}
async function ask(token: string, name = "Applicant", account = who()) {
  await submitJoinRequest(token, name, account);
  return testPrisma.joinRequest.findFirstOrThrow({ where: { authUserId: account.authUserId }, orderBy: { id: "desc" } });
}

describe("admission state and concurrency", () => {
  it("replacement pre-flight agrees with submission; dead replacements cannot revive", async () => {
    const { org, ctx, invite } = await setup();
    const account = who();
    const request = await ask(invite.token, "Chosen name", account);
    await rejectJoinRequest(ctx, request.id);
    const replacement = await testPrisma.orgInvite.create({ data: { organizationId: org.id, token: randomUUID() } });
    expect((await resolveJoinViewer(org.id, account.authUserId, invite.id)).state).toBe("rejected");
    expect((await resolveJoinViewer(org.id, account.authUserId, replacement.id)).state).toBe("ready");
    await revokeInvite(ctx, replacement.id);
    expect(await submitJoinRequest(replacement.token, "New name", account)).toMatchObject({ state: "dead" });
    expect((await testPrisma.joinRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("rejected");
  });

  it("concurrent duplicate submissions preserve the first name and write one event", async () => {
    const { org, invite } = await setup();
    const account = who();
    await Promise.all([submitJoinRequest(invite.token, "First", account), submitJoinRequest(invite.token, "Second", account)]);
    const [request] = await testPrisma.joinRequest.findMany();
    expect(await testPrisma.joinRequest.count()).toBe(1);
    expect(await testPrisma.operationalEvent.count({ where: { action: "join_request.submitted" } })).toBe(1);
    await submitJoinRequest(invite.token, "Overwrite", account);
    expect(await resolveJoinViewer(org.id, account.authUserId, invite.id)).toMatchObject({ state: "pending", submittedName: request.name });
  });

  it("one remaining invite place cannot be reserved twice", async () => {
    const { ctx, invite } = await setup("alpha", 1);
    const results = await Promise.all([submitJoinRequest(invite.token, "One", who()), submitJoinRequest(invite.token, "Two", who())]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(await testPrisma.joinRequest.count()).toBe(1);
    expect(await resolveInviteToken(invite.token)).toMatchObject({ ok: false, reason: "reserved" });
    expect(await listInvites(ctx)).toMatchObject([{ status: "reserved", pendingCount: 1, availableUses: 0 }]);
  });

  it("approve versus reject produces exactly one decision consistent with membership", async () => {
    const { ctx, invite } = await setup();
    const request = await ask(invite.token);
    const results = await Promise.allSettled([approveJoinRequest(ctx, request.id, { roleId: null }), rejectJoinRequest(ctx, request.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const row = await testPrisma.joinRequest.findUniqueOrThrow({ where: { id: request.id } });
    const members = await testPrisma.membership.count({ where: { brother: { authUserId: request.authUserId } } });
    expect(members).toBe(row.status === "approved" ? 1 : 0);
  });

  it("double approval creates one membership, redemption, and approval event", async () => {
    const { ctx, invite } = await setup();
    const request = await ask(invite.token);
    const results = await Promise.allSettled([approveJoinRequest(ctx, request.id, { roleId: null }), approveJoinRequest(ctx, request.id, { roleId: null })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await testPrisma.inviteRedemption.count()).toBe(1);
    expect(await testPrisma.operationalEvent.count({ where: { action: "join_request.approved" } })).toBe(1);
  });

  it("different requests cannot both take the last free billing seat", async () => {
    const { org, ctx, invite } = await setup();
    await createBrother({ orgId: org.id });
    await createBrother({ orgId: org.id });
    const a = await ask(invite.token), b = await ask(invite.token);
    const results = await Promise.allSettled([approveJoinRequest(ctx, a.id, { roleId: null }), approveJoinRequest(ctx, b.id, { roleId: null })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await testPrisma.membership.count()).toBe(4);
    expect(await testPrisma.joinRequest.count({ where: { status: "pending" } })).toBe(1);
  });

  it("restoring an archived member competes with approval for the same last seat", async () => {
    const { org, ctx, invite } = await setup();
    await createBrother({ orgId: org.id }); await createBrother({ orgId: org.id });
    const archived = await createBrother({ orgId: org.id });
    await testPrisma.membership.updateMany({ where: { brotherId: archived.id, organizationId: org.id }, data: { archivedAt: new Date() } });
    const request = await ask(invite.token);
    const results = await Promise.allSettled([approveJoinRequest(ctx, request.id, { roleId: null }), updateBrother(ctx, archived.id, { archived: false })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await testPrisma.membership.count({ where: { archivedAt: null } })).toBe(4);
  });

  it("simultaneous cross-org approval reuses one globally unique identity", async () => {
    const a = await setup("alpha"), b = await setup("beta");
    const account = who();
    const ar = await ask(a.invite.token, "Rob", account), br = await ask(b.invite.token, "Robert", account);
    await Promise.all([approveJoinRequest(a.ctx, ar.id, { roleId: null }), approveJoinRequest(b.ctx, br.id, { roleId: null })]);
    expect(await testPrisma.brother.count({ where: { authUserId: account.authUserId } })).toBe(1);
    expect(await testPrisma.membership.findMany({ where: { brother: { authUserId: account.authUserId } }, orderBy: { organizationId: "asc" }, select: { name: true } })).toEqual([{ name: "Rob" }, { name: "Robert" }]);
  });

  it("expiry/revoke preserve pending review, and decline releases a reservation", async () => {
    const { ctx, invite } = await setup("alpha", 1);
    const request = await ask(invite.token);
    await rejectJoinRequest(ctx, request.id);
    expect(await resolveInviteToken(invite.token)).toMatchObject({ ok: true });
    const next = await ask(invite.token);
    await revokeInvite(ctx, invite.id);
    await approveJoinRequest(ctx, next.id, { roleId: null });
    expect(await testPrisma.inviteRedemption.count()).toBe(1);
  });

  it("resubmission cannot reset an officer decision", async () => {
    const { ctx, invite } = await setup();
    const account = who();
    const request = await ask(invite.token, "Original", account);
    await Promise.all([rejectJoinRequest(ctx, request.id), submitJoinRequest(invite.token, "Overwrite", account)]);
    expect(await testPrisma.joinRequest.findUnique({ where: { id: request.id } })).toMatchObject({ status: "rejected", name: "Original" });
  });

  it("cursor pages remain stable with identical request timestamps and source filters", async () => {
    const { ctx, invite } = await setup();
    await ask(invite.token, "One"); await ask(invite.token, "Two"); await ask(invite.token, "Three");
    await testPrisma.joinRequest.updateMany({ data: { createdAt: new Date("2026-09-01T00:00:00Z") } });
    const page = await listPendingRequestPage(ctx, { take: 2, search: "", inviteId: invite.id });
    const next = await listPendingRequestPage(ctx, { take: 2, search: "", inviteId: invite.id, ...page.nextCursor! });
    expect(page.total).toBe(3);
    expect(new Set([...page.rows, ...next.rows].map(r => r.id)).size).toBe(3);
    expect(next.nextCursor).toBeNull();
  });
});
