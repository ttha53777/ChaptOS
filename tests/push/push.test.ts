/**
 * Push notifications: who each trigger reaches, the outbox (idempotent enqueue,
 * leased sends, retries that never double-send), pruning dead tokens, device
 * registration, preferences, deletion, and tenancy.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { expoMock, expoMockModule, resetExpoMock, sentMessages } from "../setup/expo-mock";

vi.mock("@/lib/push/expo", () => expoMockModule());

import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent, joinOrg } from "../setup/factories";
import { db } from "@/lib/db";
import { dispatchHandlers } from "@/lib/events";
import { openCheckIn, closeCheckIn, reopenCheckIn } from "@/lib/services/attendance-service";
import { createTask, updateTask } from "@/lib/services/task-service";
import { createPoll } from "@/lib/services/poll-service";
import { deleteBrother } from "@/lib/services/brother-service";
import { deleteOrg } from "@/lib/services/org-service";
import { getPushPreferences, setPushPreference, registerPushDevice, unregisterPushDevice } from "@/lib/services/push-service";
import { flushPush } from "@/lib/push/sender";
import { _setFlushSchedulerForTest } from "@/lib/push/queue";
import { registerPushDeviceInput } from "@/lib/validation/push";
import { createTaskInput } from "@/lib/validation/task";
import { ForbiddenError } from "@/lib/errors";
import { submitJoinRequest } from "@/lib/auth/join-request-submit";
import { PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

process.env.PUSH_ENABLED = "1";
_setFlushSchedulerForTest(() => {});

beforeEach(async () => { await resetDb(); resetExpoMock(); });
afterAll(async () => { _setFlushSchedulerForTest(null); await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: false, isPlatformAdmin: false, db: db(orgId),
    ...over,
  };
}
const adminCtx = (orgId: number, actorId: number) => ctxFor(orgId, actorId, { isOrgAdmin: true, permissions: ~0 >>> 0, maxRank: Number.POSITIVE_INFINITY });

/** A member with a Google account and one registered phone. */
async function member(orgId: number, opts: { isOrgAdmin?: boolean; archivedAt?: Date; name?: string } = {}) {
  const b = await createBrother({ orgId, ...opts });
  const authUserId = `auth-${b.id}-${randomUUID()}`;
  await testPrisma.brother.update({ where: { id: b.id }, data: { authUserId } });
  const token = `ExponentPushToken[dev-${b.id}]`;
  await registerPushDevice(authUserId, { token, platform: "ios", appVersion: "0.1.0" });
  return { ...b, authUserId, token };
}

async function queued(where: object = {}) {
  return testPrisma.pushMessage.findMany({ where, orderBy: { id: "asc" } });
}
const recipients = async (where: object = {}) => (await queued(where)).map(m => m.brotherId).sort((a, b) => a - b);

async function seed() {
  const org = await createOrg("Alpha Org", "alpha");
  const admin = await member(org.id, { isOrgAdmin: true });
  const a = await member(org.id, { name: "Ann" });
  const b = await member(org.id, { name: "Ben" });
  const c = await member(org.id, { name: "Cal" });
  const sem = await createSemester({ orgId: org.id, startDate: "2026-01-01", endDate: "2026-12-31" });
  return { org, admin, a, b, c, sem, ctx: adminCtx(org.id, admin.id) };
}

describe("checkin.opened", () => {
  it("reaches the expected members: not the actor, exempt, excused, present, archived, or opted out", async () => {
    const { org, admin, a, b, c, sem, ctx } = await seed();
    const exempt = await member(org.id);
    const excused = await member(org.id);
    const archived = await member(org.id, { archivedAt: new Date() });
    const ev = await createCalendarEvent({ orgId: org.id, title: "Chapter", mandatory: true, date: "2026-05-01" });
    await testPrisma.attendanceExemption.create({ data: { organizationId: org.id, brotherId: exempt.id, semesterId: sem.id } });
    await testPrisma.attendanceExcuse.create({ data: { calendarEventId: ev.id, brotherId: excused.id, semesterId: sem.id, reason: "work", status: "approved" } });
    await testPrisma.attendanceRecord.create({ data: { calendarEventId: ev.id, brotherId: c.id, semesterId: sem.id, attended: true } });
    await setPushPreference(ctxFor(org.id, b.id), { category: "checkin", enabled: false });

    await openCheckIn(ctx, ev.id);

    expect(await recipients()).toEqual([a.id]);
    const [m] = await queued();
    expect(m).toMatchObject({ category: "checkin", title: "Check-in is open", body: "Chapter. Tap to check in.", url: "chaptos://org/alpha/checkin" });
    void admin; void archived;
  });

  it("a reopen inside the quiet window doesn't buzz the same people again", async () => {
    const { org, a, ctx } = await seed();
    const ev = await createCalendarEvent({ orgId: org.id, mandatory: true, date: "2026-05-01" });
    await openCheckIn(ctx, ev.id);
    const first = (await queued()).length;
    await closeCheckIn(ctx, ev.id);
    await reopenCheckIn(ctx, ev.id);
    expect((await queued()).length).toBe(first);
    void a;
  });
});

describe("tasks and polls", () => {
  it("task.created reaches named people and current holders of an assigned role", async () => {
    const { org, a, b, c, ctx } = await seed();
    const role = await testPrisma.role.create({ data: { organizationId: org.id, name: "Social", rank: 1 } });
    await testPrisma.brotherRole.create({ data: { organizationId: org.id, brotherId: b.id, roleId: role.id } });
    const task = await createTask(ctx, createTaskInput.parse({ title: "Book the venue", dueDate: "2026-05-08", assigneeBrotherIds: [a.id], assigneeRoleIds: [role.id] }));
    expect(await recipients()).toEqual([a.id, b.id]);
    const [m] = await queued();
    expect(m).toMatchObject({ title: "New task", body: "Book the venue · due Fri, May 8", url: `chaptos://org/alpha/tasks/${task.id}` });
    void c;
  });

  it("task.updated reaches only the newly added assignees, never twice", async () => {
    const { a, b, c, ctx } = await seed();
    const task = await createTask(ctx, createTaskInput.parse({ title: "Flyers", assigneeBrotherIds: [a.id] }));
    await updateTask(ctx, task.id, { assigneeBrotherIds: [a.id, b.id] });
    expect(await recipients()).toEqual([a.id, b.id]);
    // b dropped and re-added: same push, not a second one. c is new.
    await updateTask(ctx, task.id, { assigneeBrotherIds: [a.id] });
    await updateTask(ctx, task.id, { assigneeBrotherIds: [a.id, b.id, c.id] });
    expect(await recipients()).toEqual([a.id, b.id, c.id]);
    // A title edit pushes nobody.
    await updateTask(ctx, task.id, { title: "Flyers v2" });
    expect((await queued()).length).toBe(3);
  });

  it("an Everyone task reaches the whole active roster except the actor", async () => {
    const { admin, a, b, c, ctx } = await seed();
    await createTask(ctx, createTaskInput.parse({ title: "Sign bylaws", everyone: "each" }));
    expect(await recipients()).toEqual([a.id, b.id, c.id]);
    void admin;
  });

  it("poll.created reaches everyone but the actor", async () => {
    const { a, b, c, ctx } = await seed();
    const poll = await createPoll(ctx, { question: "Formal theme?", options: ["20s", "Disco"], closeDate: "2026-05-04" });
    expect(await recipients()).toEqual([a.id, b.id, c.id]);
    expect((await queued())[0]).toMatchObject({ title: "New poll", body: "Formal theme? · closes Mon, May 4", url: `chaptos://org/alpha/polls/${poll.id}` });
  });
});

describe("dues, excuses, membership, join requests", () => {
  it("dues.charge_issued reaches the people charged, with no amount on the lock screen", async () => {
    const { org, a, b, ctx } = await seed();
    const charge = await testPrisma.duesCharge.create({ data: { organizationId: org.id, name: "Spring dues", dueDate: "2026-03-01", audienceKind: "pick", audienceLabel: "2 people" } });
    await testPrisma.duesChargeLine.createMany({ data: [a, b].map(x => ({ organizationId: org.id, chargeId: charge.id, brotherId: x.id, amountCents: 12000 })) });
    await dispatchHandlers(ctx, "dues.charge_issued", { type: "DuesCharge", id: charge.id }, { chargeId: charge.id, name: "Spring dues", people: 2, total: 240, dueDate: "2026-03-01" });
    expect(await recipients()).toEqual([a.id, b.id]);
    const [m] = await queued();
    expect(m).toMatchObject({ title: "New dues charge", body: "Spring dues, due Sun, Mar 1.", url: "chaptos://org/alpha/dues" });
    expect(m!.body).not.toMatch(/\$|120/);
  });

  it("excuse.approved reaches the member, but not when they approved their own", async () => {
    const { org, a, ctx } = await seed();
    const meta = { brotherId: a.id, brotherName: "Ann", calendarEventId: 1, semesterId: 1, eventTitle: "Chapter" };
    await dispatchHandlers(ctx, "excuse.approved", { type: "AttendanceExcuse", id: 7 }, meta);
    expect(await recipients()).toEqual([a.id]);
    await dispatchHandlers(ctxFor(org.id, a.id), "excuse.approved", { type: "AttendanceExcuse", id: 8 }, meta);
    expect((await queued()).length).toBe(1);
  });

  it("join_request.approved is idempotent when the admission outbox replays it", async () => {
    const { org, a, ctx } = await seed();
    const meta = { name: "Ann", brotherId: a.id, roleId: null, roleName: null, reused: false };
    await dispatchHandlers(ctx, "join_request.approved", { type: "JoinRequest", id: 3 }, meta);
    await dispatchHandlers(ctx, "join_request.approved", { type: "JoinRequest", id: 3 }, meta, { retryOnFailure: true });
    const rows = await queued();
    expect(rows.map(r => r.brotherId)).toEqual([a.id]);
    expect(rows[0]).toMatchObject({ category: "membership", title: "You're in", body: "Welcome to Alpha Org." });
    void org;
  });

  it("join_request.submitted reaches officers with MANAGE_BROTHERS, not plain members", async () => {
    const { org, admin, a, b } = await seed();
    const role = await testPrisma.role.create({ data: { organizationId: org.id, name: "Recruitment", rank: 2, permissions: PERMISSIONS.MANAGE_BROTHERS } });
    await testPrisma.brotherRole.create({ data: { organizationId: org.id, brotherId: a.id, roleId: role.id } });
    const reactionCtx = ctxFor(org.id, 0);
    await dispatchHandlers(reactionCtx, "join_request.submitted", { type: "JoinRequest", id: 9 }, { name: "Dee", inviteId: 1, orgId: org.id });
    expect(await recipients()).toEqual([admin.id, a.id].sort((x, y) => x - y));
    expect((await queued())[0]).toMatchObject({ title: "New request to join", body: "Dee wants to join Alpha Org.", url: "chaptos://org/alpha/requests" });
    void b;
  });
});

describe("join submission (bootstrap path)", () => {
  it("filing a request queues the officer push once; a duplicate submit queues nothing more", async () => {
    const { org, admin, a } = await seed();
    const inv = await testPrisma.orgInvite.create({ data: { organizationId: org.id, token: `tok-${randomUUID()}`, createdByBrotherId: admin.id } });
    const who = { authUserId: `g-${randomUUID()}`, email: null, avatarUrl: null };
    await expect(submitJoinRequest(inv.token, "Dee", who)).resolves.toMatchObject({ ok: true, state: "pending" });
    await submitJoinRequest(inv.token, "Dee", who);
    expect(await recipients()).toEqual([admin.id]);
    void a;
  });
});

describe("tenancy", () => {
  it("an org-A event never pushes an org-B-only member; a member of both is told which org", async () => {
    const { org, a, ctx } = await seed();
    const other = await createOrg("Beta Org", "beta");
    const onlyB = await member(other.id);
    await joinOrg({ brotherId: a.id, orgId: other.id });
    await createTask(ctx, createTaskInput.parse({ title: "Clean up", everyone: "any" }));
    const ids = await recipients();
    expect(ids).not.toContain(onlyB.id);
    expect(ids).toContain(a.id);
    await flushPush();
    const toA = sentMessages().find(m => m.to === a.token)!;
    expect(toA.title).toBe("Alpha Org · New task");
    expect(toA.data).toMatchObject({ orgSlug: "alpha", url: expect.stringMatching(/^chaptos:\/\/org\/alpha\/tasks\//) });
    expect(sentMessages().some(m => m.to === onlyB.token)).toBe(false);
    void org;
  });
});

describe("sender", () => {
  it("sends each push once to every device, then prunes a token Expo calls DeviceNotRegistered", async () => {
    const { a, b, ctx } = await seed();
    await createTask(ctx, createTaskInput.parse({ title: "Flyers", assigneeBrotherIds: [a.id, b.id] }));
    expoMock.send.mockImplementationOnce(async msgs => msgs.map((m, i) =>
      m.to === b.token ? { status: "error" as const, message: "gone", details: { error: "DeviceNotRegistered" } } : { status: "ok" as const, id: `t${i}` }));
    const r = await flushPush();
    expect(r).toMatchObject({ sent: 1, pruned: 1 });
    expect(await testPrisma.pushDevice.count({ where: { token: b.token } })).toBe(0);
    expect(await testPrisma.pushDevice.count({ where: { token: a.token } })).toBe(1);
    // A second flush has nothing left to send.
    await flushPush();
    expect(expoMock.send).toHaveBeenCalledTimes(1);
  });

  it("prunes from receipts once they're due", async () => {
    const { a, ctx } = await seed();
    await createTask(ctx, createTaskInput.parse({ title: "Flyers", assigneeBrotherIds: [a.id] }));
    await flushPush();
    await testPrisma.pushMessage.updateMany({ data: { sentAt: new Date(Date.now() - 20 * 60_000) } });
    expoMock.receipts.mockImplementationOnce(async ids => Object.fromEntries(ids.map(id => [id, { status: "error" as const, message: "gone", details: { error: "DeviceNotRegistered" } }])));
    const r = await flushPush();
    expect(r.receipts).toBe(1);
    expect(await testPrisma.pushDevice.count({ where: { token: a.token } })).toBe(0);
  });

  it("a failed send is retried later and never double-sends", async () => {
    const { a, ctx } = await seed();
    await createTask(ctx, createTaskInput.parse({ title: "Flyers", assigneeBrotherIds: [a.id] }));
    expoMock.send.mockRejectedValueOnce(new Error("Expo down"));
    await flushPush();
    let [row] = await queued();
    expect(row).toMatchObject({ status: "pending", attempts: 1 });
    // Still inside the backoff: nothing goes.
    await flushPush();
    expect(expoMock.send).toHaveBeenCalledTimes(1);
    await testPrisma.pushMessage.updateMany({ data: { leaseUntil: new Date(Date.now() - 1000) } });
    await Promise.all([flushPush(), flushPush()]);
    [row] = await queued();
    expect(row).toMatchObject({ status: "sent", attempts: 2 });
    expect(sentMessages().filter(m => m.to === a.token)).toHaveLength(2); // the failed call + one real send
    expect(expoMock.send).toHaveBeenCalledTimes(2);
  });

  it("drops a push past its expiry instead of delivering it late", async () => {
    const { org, a, ctx } = await seed();
    const ev = await createCalendarEvent({ orgId: org.id, mandatory: true, date: "2026-05-01" });
    await openCheckIn(ctx, ev.id);
    await testPrisma.pushMessage.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await flushPush();
    expect(r.dropped).toBeGreaterThan(0);
    expect(expoMock.send).not.toHaveBeenCalled();
    void a;
  });

  it("queues nothing while PUSH_ENABLED is off", async () => {
    const { a, ctx } = await seed();
    process.env.PUSH_ENABLED = "0";
    try { await createTask(ctx, createTaskInput.parse({ title: "Flyers", assigneeBrotherIds: [a.id] })); } finally { process.env.PUSH_ENABLED = "1"; }
    expect(await queued()).toHaveLength(0);
  });
});

describe("devices", () => {
  it("register is idempotent on the token, and a token that changes hands moves", async () => {
    await registerPushDevice("acct-1", { token: "ExponentPushToken[x]", platform: "ios", appVersion: "0.1.0" });
    await registerPushDevice("acct-1", { token: "ExponentPushToken[x]", platform: "ios", appVersion: "0.1.1" });
    expect(await testPrisma.pushDevice.findMany()).toMatchObject([{ authUserId: "acct-1", appVersion: "0.1.1" }]);
    await registerPushDevice("acct-2", { token: "ExponentPushToken[x]", platform: "android", appVersion: null });
    expect(await testPrisma.pushDevice.findMany()).toMatchObject([{ authUserId: "acct-2", platform: "android" }]);
    // Sign-out only removes the caller's own token.
    await unregisterPushDevice("acct-1", { token: "ExponentPushToken[x]" });
    expect(await testPrisma.pushDevice.count()).toBe(1);
    await unregisterPushDevice("acct-2", { token: "ExponentPushToken[x]" });
    expect(await testPrisma.pushDevice.count()).toBe(0);
  });

  it("only accepts Expo push tokens", () => {
    expect(registerPushDeviceInput.safeParse({ token: "ExponentPushToken[abc]", platform: "ios" }).success).toBe(true);
    expect(registerPushDeviceInput.safeParse({ token: "abc", platform: "ios" }).success).toBe(false);
    expect(registerPushDeviceInput.safeParse({ token: "ExponentPushToken[abc]", platform: "web" }).success).toBe(false);
  });
});

describe("preferences", () => {
  it("defaults on, saves a switch, hides officer categories from members", async () => {
    const { org, admin, a } = await seed();
    const mine = await getPushPreferences(ctxFor(org.id, a.id));
    expect(mine.categories.map(c => c.id)).toEqual(["checkin", "tasks", "dues", "attendance"]);
    expect(mine.categories.every(c => c.enabled)).toBe(true);
    const saved = await setPushPreference(ctxFor(org.id, a.id), { category: "dues", enabled: false });
    expect(saved.categories.find(c => c.id === "dues")!.enabled).toBe(false);
    await expect(setPushPreference(ctxFor(org.id, a.id), { category: "requests", enabled: false })).rejects.toThrow(ForbiddenError);
    const officer = await getPushPreferences(adminCtx(org.id, admin.id));
    expect(officer.categories.map(c => c.id)).toContain("requests");
  });
});

describe("deletion", () => {
  it("erasing a single-org member removes their devices and preferences", async () => {
    const { org, a, ctx } = await seed();
    await setPushPreference(ctxFor(org.id, a.id), { category: "dues", enabled: false });
    await deleteBrother(ctx, a.id);
    expect(await testPrisma.pushDevice.count({ where: { authUserId: a.authUserId } })).toBe(0);
    expect(await testPrisma.notificationPreference.count({ where: { brotherId: a.id } })).toBe(0);
  });

  it("removing a multi-org member from one org keeps their devices and their other org's settings", async () => {
    const { org, a, ctx } = await seed();
    const other = await createOrg("Beta Org", "beta");
    await joinOrg({ brotherId: a.id, orgId: other.id });
    await setPushPreference(ctxFor(org.id, a.id), { category: "dues", enabled: false });
    await setPushPreference(ctxFor(other.id, a.id), { category: "dues", enabled: false });
    await createTask(ctx, createTaskInput.parse({ title: "Flyers", assigneeBrotherIds: [a.id] }));
    await deleteBrother(ctx, a.id);
    expect(await testPrisma.pushDevice.count({ where: { authUserId: a.authUserId } })).toBe(1);
    expect(await testPrisma.notificationPreference.findMany({ where: { brotherId: a.id } })).toMatchObject([{ organizationId: other.id }]);
    expect(await testPrisma.pushMessage.count({ where: { brotherId: a.id, organizationId: org.id } })).toBe(0);
  });

  it("deleting an org removes its outbox and preferences, and the devices of members it erases", async () => {
    const { org, admin, a, ctx } = await seed();
    await setPushPreference(ctxFor(org.id, a.id), { category: "dues", enabled: false });
    await createTask(ctx, createTaskInput.parse({ title: "Flyers", assigneeBrotherIds: [a.id] }));
    await deleteOrg(ctx, "alpha");
    expect(await testPrisma.pushMessage.count()).toBe(0);
    expect(await testPrisma.notificationPreference.count()).toBe(0);
    expect(await testPrisma.pushDevice.count({ where: { authUserId: { in: [admin.authUserId, a.authUserId] } } })).toBe(0);
  });
});
