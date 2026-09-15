import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg } from "../setup/factories";
import { getJoinSession } from "@/lib/auth/join-session";
import { GET as inviteStatus } from "@/app/api/auth/invite-status/route";
import { GET as ownStatus } from "@/app/api/auth/join-status/route";
import { GET as ownRequests } from "@/app/api/auth/join-requests/route";

vi.mock("@/lib/auth/join-session", () => ({ getJoinSession: vi.fn() }));
beforeEach(async () => { await resetDb(); vi.mocked(getJoinSession).mockReset(); });
afterAll(() => testPrisma.$disconnect());
async function setup(status = "rejected") {
  const org = await createOrg("Alpha", "alpha");
  const first = await testPrisma.orgInvite.create({ data: { organizationId: org.id, token: randomUUID() } });
  const next = await testPrisma.orgInvite.create({ data: { organizationId: org.id, token: randomUUID() } });
  const authUserId = randomUUID();
  await testPrisma.joinRequest.create({ data: { organizationId: org.id, inviteId: first.id, authUserId, name: "Submitted name", status } });
  vi.mocked(getJoinSession).mockResolvedValue({ authUserId, account: { name: "Google name", email: "user@example.com", avatarUrl: null } });
  const request = (token: string) => new NextRequest(`http://localhost/api/auth/invite-status?token=${token}`);
  return { first, next, authUserId, request };
}

it("pre-flight blocks only the rejected link and never treats a dead replacement as ready", async () => {
  const { first, next, request } = await setup();
  expect(await (await inviteStatus(request(first.token))).json()).toMatchObject({ state: "rejected" });
  const ready = await inviteStatus(request(next.token));
  expect(await ready.json()).toMatchObject({ valid: true, state: "ready" });
  expect(ready.headers.get("cache-control")).toBe("private, no-store");
  await testPrisma.orgInvite.update({ where: { id: next.id }, data: { revokedAt: new Date() } });
  expect(await (await inviteStatus(request(next.token))).json()).toMatchObject({ valid: false, reason: "revoked" });
});

it("pending on dead links returns the submitted name without roster/headcount data", async () => {
  const { first, request } = await setup("pending");
  await testPrisma.orgInvite.update({ where: { id: first.id }, data: { expiresAt: new Date(0) } });
  const response = await (await inviteStatus(request(first.token))).json();
  expect(response).toMatchObject({ valid: true, state: "pending", submittedName: "Submitted name" });
  expect(response.org).not.toHaveProperty("memberCount");
  expect(await (await ownStatus(new NextRequest("http://localhost/api/auth/join-status?slug=alpha"))).json()).toMatchObject({ state: "pending", submittedName: "Submitted name" });
});

it("own status and notices cannot read another account's request", async () => {
  await setup("pending");
  vi.mocked(getJoinSession).mockResolvedValue({ authUserId: randomUUID(), account: { name: null, email: null, avatarUrl: null } });
  expect((await ownStatus(new NextRequest("http://localhost/api/auth/join-status?slug=alpha"))).status).toBe(404);
  expect(await (await ownRequests()).json()).toEqual([]);
  vi.mocked(getJoinSession).mockResolvedValue(null);
  expect((await ownStatus(new NextRequest("http://localhost/api/auth/join-status?slug=alpha"))).status).toBe(401);
});
