import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { appPrisma, applyEnforcingRls, dropEnforcingRls, asOrg } from "../setup/rls";
import { createOrg, createBrother } from "../setup/factories";
import { _dbWithClient } from "@/lib/db/tenant";
import type { RequestContext } from "@/lib/context";
import { submitJoinRequest } from "@/lib/auth/join-request-submit";
import { resolveInviteToken } from "@/lib/auth/invite-lookup";
import { resolveJoinViewer } from "@/lib/auth/join-viewer";
import { approveJoinRequest, rejectJoinRequest } from "@/lib/services/join-request-service";
import { countBillableMembers } from "@/lib/billing/seats";

beforeAll(applyEnforcingRls);
beforeEach(resetDb);
afterAll(async () => { await dropEnforcingRls(); await appPrisma.$disconnect(); await testPrisma.$disconnect(); });

it("bootstrap resolves a token hidden from the app role; restricted approval preserves cross-org identity and seats", async () => {
  const a = await createOrg("Alpha", "alpha"), b = await createOrg("Beta", "beta");
  const admin = await createBrother({ orgId: b.id, isOrgAdmin: true });
  const identity = await createBrother({ orgId: a.id, name: "Account name" });
  const unrelated = await createBrother({ orgId: a.id, name: "Private member" });
  const invite = await testPrisma.orgInvite.create({ data: { organizationId: b.id, token: randomUUID() } });
  expect(await appPrisma.orgInvite.findUnique({ where: { token: invite.token } })).toBeNull();
  expect(await resolveInviteToken(invite.token)).toMatchObject({ ok: true });
  const account = { authUserId: randomUUID(), email: null, avatarUrl: null };
  await testPrisma.brother.update({ where: { id: identity.id }, data: { authUserId: account.authUserId } });
  await submitJoinRequest(invite.token, "Org-local name", account);
  const request = await testPrisma.joinRequest.findFirstOrThrow({ where: { authUserId: account.authUserId, organizationId: b.id } });
  expect(await resolveJoinViewer(b.id, account.authUserId, invite.id)).toMatchObject({ state: "pending", submittedName: "Org-local name" });
  const scoped = _dbWithClient(b.id, appPrisma as Parameters<typeof _dbWithClient>[1]);
  const ctx = { orgId: b.id, actorId: admin.id, actorName: admin.name, authUserId: admin.authUserId,
    requestId: randomUUID(), maxRank: 100, db: scoped,
  } as unknown as RequestContext;
  await approveJoinRequest(ctx, request.id, { roleId: null });
  expect(await resolveJoinViewer(b.id, account.authUserId, invite.id)).toMatchObject({ state: "already_member" });
  expect(await countBillableMembers(scoped)).toBe(2);
  expect(await scoped.member.listRoster()).toEqual(expect.arrayContaining([expect.objectContaining({ id: identity.id, name: "Org-local name" })]));
  expect(await asOrg(b.id, tx => tx.brother.findUnique({ where: { id: unrelated.id } }))).toBeNull();
  await expect(asOrg(b.id, tx => tx.membership.updateMany({ where: { organizationId: a.id }, data: { duesOwed: 999 } }))).resolves.toMatchObject({ count: 0 });
  const otherCtx = { ...ctx, orgId: a.id, db: _dbWithClient(a.id, appPrisma as Parameters<typeof _dbWithClient>[1]) } as unknown as RequestContext;
  await expect(rejectJoinRequest(otherCtx, request.id)).rejects.toThrow("Join request");
});

it("restricted approval creates a new identity and roster spot in one transaction", async () => {
  const org = await createOrg("Alpha", "alpha");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  const invite = await testPrisma.orgInvite.create({ data: { organizationId: org.id, token: randomUUID() } });
  const account = { authUserId: randomUUID(), email: null, avatarUrl: null };
  await submitJoinRequest(invite.token, "New person", account);
  const request = await testPrisma.joinRequest.findFirstOrThrow({ where: { authUserId: account.authUserId } });
  const ctx = { orgId: org.id, actorId: admin.id, actorName: admin.name, requestId: randomUUID(), maxRank: 100,
    db: _dbWithClient(org.id, appPrisma as Parameters<typeof _dbWithClient>[1]),
  } as unknown as RequestContext;
  await approveJoinRequest(ctx, request.id, { roleId: null });
  expect(await testPrisma.membership.count({ where: { organizationId: org.id } })).toBe(2);
});
