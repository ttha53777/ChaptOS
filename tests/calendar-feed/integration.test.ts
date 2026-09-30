import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const session = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn(async () => session.user) }));
import { requireUser } from "@/lib/auth/require-user";
import { db, } from "@/lib/db";
import { buildContext, type RequestContext } from "@/lib/context";
import { buildFeedContext } from "@/lib/auth/calendar-feed";
import { createCredential, decryptCredential } from "@/lib/calendar-feed/credentials";
import { refreshCalendarFeed } from "@/lib/calendar-feed/worker";
import { getCalendarSubscription, manageCalendarSubscription } from "@/lib/services/calendar-subscription-service";
import { createProgrammingTask, setStage, updateProgrammingTask } from "@/lib/services/programming-service";
import { createCalendar, updateCalendar } from "@/lib/services/calendar-service";
import { createServiceEvent, updateServiceEvent } from "@/lib/services/service-event-service";
import { createParty, updateParty } from "@/lib/services/party-service";
import { GET, HEAD } from "@/app/api/calendar/feeds/[publicId]/[secret]/route";
import { GET as exportEvent } from "@/app/api/calendar/[id]/export/route";
import { GET as subscriptionGet } from "@/app/api/calendar/subscription/route";
import { calendarFeedLive } from "@/lib/services/calendar-subscription-service";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { manageCalendarFeedInput } from "@/lib/validation/calendar-feed";
import { appPrisma, applyEnforcingRls, dropEnforcingRls, asOrg } from "../setup/rls";

beforeEach(async () => {
  await resetDb(); session.user = null; vi.mocked(requireUser).mockClear();
  process.env.CALENDAR_FEED_KEY = "b".repeat(64);
  process.env.CALENDAR_FEED_ORIGIN = "https://example.com";
  process.env.CALENDAR_FEED_ORGS = "*";
  process.env.CALENDAR_FEED_PATH_REDACTION_VERIFIED = "1";
  process.env.RLS_SET_ORG_ID = "1";
});
afterAll(async () => { await testPrisma.$disconnect(); await appPrisma.$disconnect(); });
// Admin fields are absent from member responses, so the inferred type is a union.
type AdminView = Awaited<ReturnType<typeof getCalendarSubscription>> & { validating?: boolean; turningOn?: boolean; problem?: string | null; issues?: { kind: string; title: string; blocking: boolean }[] };
const adminView = async (ctx: RequestContext) => (await getCalendarSubscription(ctx)) as AdminView;
function context(orgId: number): RequestContext {
  return { requestId: randomUUID(), orgId, actorId: 1, actorName: "Test", actorEmail: null, authUserId: "auth-test", membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: true, isPlatformAdmin: false, db: db(orgId) };
}
async function fixture(slug = "one") {
  const org = await createOrg(slug, slug);
  const member = await createBrother({ orgId: org.id });
  const event = await testPrisma.calendarEvent.create({ data: { organizationId: org.id, title: `${slug} event`, date: "2027-01-01", category: "chapter", mandatory: true, description: "SECRET NOTES", notesSummary: "SECRET SUMMARY" } });
  const feed = await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } });
  const credential = createCredential(feed.publicId);
  await testPrisma.organization.update({ where: { id: org.id }, data: { timeZone: "America/New_York" } });
  await testPrisma.calendarSubscription.update({ where: { organizationId: org.id }, data: { ...credential, enabled: true, generation: 1, validatedAt: new Date() } });
  await refreshCalendarFeed(org.id);
  const token = decryptCredential(feed.publicId, credential.tokenCiphertext);
  const params = { publicId: feed.publicId, secret: `${token}.ics` };
  const request = (headers?: HeadersInit) => new Request(`https://example.com/api/calendar/feeds/${params.publicId}/${params.secret}`, { headers });
  return { org, event, params, request, ctx: { ...context(org.id), actorId: member.id } };
}
describe("anonymous feed and credentials", () => {
  it("polls without session, supports HEAD/304, and does not change UID/revision/stamps", async () => {
    const f = await fixture();
    const before = await db(f.org.id).calendarFeedItem.list();
    const response = await GET(f.request(), { params: Promise.resolve(f.params) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    const body = await response.text();
    expect(body).toContain("one event"); expect(body).not.toContain("SECRET");
    expect(vi.mocked(requireUser)).not.toHaveBeenCalled();
    expect((await GET(f.request({ "if-none-match": response.headers.get("etag")! }), { params: Promise.resolve(f.params) })).status).toBe(304);
    const head = await HEAD(new Request(f.request(), { method: "HEAD" }), { params: Promise.resolve(f.params) });
    expect(head.status).toBe(200); expect(await head.text()).toBe("");
    expect(await db(f.org.id).calendarFeedItem.list()).toEqual(before);
  });
  it("validates rotated/disabled/forged credentials before conditional requests", async () => {
    const f = await fixture(); const other = await fixture("two");
    const response = await GET(f.request(), { params: Promise.resolve(f.params) });
    const etag = response.headers.get("etag")!;
    const forged = await GET(f.request({ "if-none-match": etag }), { params: Promise.resolve({ ...f.params, publicId: other.params.publicId }) });
    expect(forged.status).toBe(404);
    await manageCalendarSubscription(f.ctx, { action: "rotate" });
    expect((await GET(f.request({ "if-none-match": etag }), { params: Promise.resolve(f.params) })).status).toBe(404);
    const retrieved = await getCalendarSubscription(f.ctx);
    const secret = retrieved.url!.split("/").pop()!;
    const params = { ...f.params, secret };
    expect((await GET(f.request(), { params: Promise.resolve(params) })).status).toBe(200);
    await manageCalendarSubscription(f.ctx, { action: "disable" });
    expect((await HEAD(f.request({ "if-none-match": etag }), { params: Promise.resolve(params) })).status).toBe(404);
    expect((await GET(f.request(), { params: Promise.resolve({ ...params, publicId: randomUUID() }) })).status).toBe(404);
  });
  it("keeps tenants separate and gates URL retrieval on membership, including multi-org users", async () => {
    const first = await fixture(); const second = await fixture("two");
    const body = await (await GET(first.request(), { params: Promise.resolve(first.params) })).text();
    expect(body).not.toContain("two event");
    session.user = { id: 1, orgId: second.org.id, name: "Multi", email: null, authUserId: "multi", memberships: [{ id: 1, organizationId: first.org.id, isOrgAdmin: false }], roleRows: [], isPlatformAdmin: false };
    expect((await buildContext({ rateLimit: false })).error?.status).toBe(403);
    (session.user as { memberships: unknown[] }).memberships.push({ id: 2, organizationId: second.org.id, isOrgAdmin: false });
    const member = await buildContext({ rateLimit: false });
    expect(member.error).toBeUndefined();
    expect((await getCalendarSubscription(member.ctx!)).url).toContain(second.params.publicId);
    await expect(manageCalendarSubscription(member.ctx!, { action: "disable" })).rejects.toMatchObject({ status: 403 });
    const feedCtx = await buildFeedContext(first.params);
    expect(feedCtx.ctx).not.toHaveProperty("actorId");
    expect(Object.keys(feedCtx.ctx!.db)).toEqual(["read"]);
  });
  it("returns 503 on pending/failed work, never an empty successful calendar", async () => {
    const f = await fixture();
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { title: "new" } });
    expect((await GET(f.request(), { params: Promise.resolve(f.params) })).status).toBe(503);
    await refreshCalendarFeed(f.org.id);
    expect((await GET(f.request(), { params: Promise.resolve(f.params) })).status).toBe(200);
    await testPrisma.calendarFeedWork.update({ where: { organizationId: f.org.id }, data: { failedAt: new Date() } });
    expect((await GET(f.request(), { params: Promise.resolve(f.params) })).status).toBe(503);
  });
});
describe("durable projection", () => {
  it("allocates one canonical item for linked service/party rows and never copies notes", async () => {
    const f = await fixture();
    await testPrisma.serviceEvent.create({ data: { organizationId: f.org.id, calendarEventId: f.event.id, title: "Private service details", date: "2027-01-01", notes: "SECRET" } });
    await testPrisma.partyEvent.create({ data: { organizationId: f.org.id, attendanceEventId: f.event.id, name: "Private party", date: "2027-01-01" } });
    await refreshCalendarFeed(f.org.id);
    const rows = await db(f.org.id).calendarFeedItem.list();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/Private|SECRET/);
  });
  it("publishes whether an event is required, and toggling it bumps SEQUENCE", async () => {
    const f = await fixture();
    const read = async () => (await (await GET(f.request(), { params: Promise.resolve(f.params) })).text()).replace(/\r\n /g, "");
    const link = `https://example.com/one/timeline?event=${f.event.id}`;
    const [before] = await db(f.org.id).calendarFeedItem.list();
    expect(await read()).toContain(`DESCRIPTION:Required · attendance is taken\\nOpen in ChaptOS: ${link}`);
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { mandatory: false } });
    await refreshCalendarFeed(f.org.id);
    const [after] = await db(f.org.id).calendarFeedItem.list();
    expect(after.uid).toBe(before.uid); expect(after.revision).toBe(before.revision + 1);
    const body = await read();
    expect(body).toContain(`DESCRIPTION:Open in ChaptOS: ${link}`);
    expect(body).toContain(`URL;VALUE=URI:${link}`);
    expect(body).not.toContain("Required");
    expect(body).toContain(`SEQUENCE:${after.revision}`);
  });
  it("keeps UID stable on edits, increments only published changes, and cancels deletions", async () => {
    const f = await fixture(); const [before] = await db(f.org.id).calendarFeedItem.list();
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { description: "private new note" } });
    await refreshCalendarFeed(f.org.id);
    expect((await db(f.org.id).calendarFeedItem.list())[0]).toEqual(before);
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { title: "Renamed", date: "2027-02-02" } });
    await Promise.all([refreshCalendarFeed(f.org.id), refreshCalendarFeed(f.org.id)]);
    const [after] = await db(f.org.id).calendarFeedItem.list();
    expect(after.uid).toBe(before.uid); expect(after.revision).toBe(before.revision + 1);
    await testPrisma.calendarEvent.delete({ where: { id: f.event.id } });
    await refreshCalendarFeed(f.org.id);
    const [deleted] = await db(f.org.id).calendarFeedItem.list();
    expect(deleted.uid).toBe(before.uid); expect(deleted.revision).toBe(after.revision + 1);
    expect(deleted.cancelledAt).not.toBeNull();
    expect((await (await GET(f.request(), { params: Promise.resolve(f.params) })).text())).toContain("STATUS:CANCELLED");
  });
  it("handles done, undated and deleted deadlines without erasing their identities", async () => {
    const f = await fixture();
    const task = await testPrisma.task.create({ data: { organizationId: f.org.id, title: "Submit", dueDate: "2027-02-01" } });
    await refreshCalendarFeed(f.org.id);
    const identity = (await db(f.org.id).calendarFeedItem.list()).find(r => r.sourceType === "task")!;
    // Completing a deadline takes it off calendars as a cancellation...
    await testPrisma.task.update({ where: { id: task.id }, data: { status: "done" } });
    await refreshCalendarFeed(f.org.id);
    const done = (await db(f.org.id).calendarFeedItem.list()).find(r => r.uid === identity.uid)!;
    expect(done.cancelledAt).not.toBeNull(); expect(done.revision).toBe(identity.revision + 1);
    const doneBody = (await (await GET(f.request(), { params: Promise.resolve(f.params) })).text()).replace(/\r\n /g, "");
    expect(doneBody).toMatch(/SUMMARY:Deadline: Submit\r\n(?:.*\r\n)*?STATUS:CANCELLED/);
    expect(doneBody).not.toContain("[Done]");
    // ...and reopening it restores the same entry.
    await testPrisma.task.update({ where: { id: task.id }, data: { status: "open" } });
    await refreshCalendarFeed(f.org.id);
    const reopened = (await db(f.org.id).calendarFeedItem.list()).find(r => r.sourceType === "task")!;
    expect(reopened.uid).toBe(identity.uid); expect(reopened.cancelledAt).toBeNull(); expect(reopened.revision).toBe(done.revision + 1);
    await testPrisma.task.update({ where: { id: task.id }, data: { dueDate: null } });
    await refreshCalendarFeed(f.org.id);
    expect((await db(f.org.id).calendarFeedItem.list()).find(r => r.uid === identity.uid)?.cancelledAt).not.toBeNull();
    await testPrisma.task.delete({ where: { id: task.id } }); await refreshCalendarFeed(f.org.id);
    expect((await db(f.org.id).calendarFeedItem.list()).find(r => r.uid === identity.uid)).toBeDefined();
  });
  it("cancels a programming stage rollback and catches committed work after a restart", async () => {
    const f = await fixture();
    const pe = await testPrisma.programmingEvent.create({ data: { organizationId: f.org.id, calendarEventId: f.event.id, title: "Program", date: "2027-01-01", category: "service", stage: "confirmed" } });
    await refreshCalendarFeed(f.org.id);
    await testPrisma.programmingEvent.update({ where: { id: pe.id }, data: { stage: "planning" } });
    const work = await db(f.org.id).calendarFeedWork.find();
    expect(work!.version).toBeGreaterThan(work!.appliedVersion);
    // No emit was run at all. A fresh worker recovers the committed trigger work.
    await refreshCalendarFeed(f.org.id);
    expect((await db(f.org.id).calendarFeedItem.list())[0].cancelledAt).not.toBeNull();
    await testPrisma.programmingEvent.update({ where: { id: pe.id }, data: { stage: "confirmed" } });
    await refreshCalendarFeed(f.org.id);
    expect((await db(f.org.id).calendarFeedItem.list())[0].cancelledAt).toBeNull();
  });
  it("rolls back durable work with source writes and invalidates structured schedules for legacy reschedules", async () => {
    const f = await fixture(); const before = await db(f.org.id).calendarFeedWork.find();
    await expect(testPrisma.$transaction(async tx => { await tx.calendarEvent.update({ where: { id: f.event.id }, data: { title: "rollback" } }); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect(await db(f.org.id).calendarFeedWork.find()).toEqual(before);
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { schedule: { kind: "allDay", start: "2027-01-01", end: "2027-01-02" } } });
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { date: "2027-01-03" } });
    expect((await testPrisma.calendarEvent.findUniqueOrThrow({ where: { id: f.event.id } })).schedule).toBeNull();
  });
  it("preserves the canonical UID across programming demotion, reschedule and concurrent re-confirmation", async () => {
    const f = await fixture();
    await createSemester({ orgId: f.org.id, startDate: "2026-01-01", endDate: "2027-12-31" });
    const draft = await createProgrammingTask(f.ctx, { title: "Project", category: "service", dueDate: "2027-02-01", location: "Park", ownerBrotherId: f.ctx.actorId });
    const confirmed = await setStage(f.ctx, draft.id, { stage: "confirmed" });
    await refreshCalendarFeed(f.org.id);
    const old = (await db(f.org.id).calendarFeedItem.list()).find(row => row.sourceId === confirmed.calendarEventId)!;
    await setStage(f.ctx, draft.id, { stage: "planning" });
    await refreshCalendarFeed(f.org.id);
    expect((await db(f.org.id).calendarFeedItem.list()).find(row => row.uid === old.uid)!.cancelledAt).not.toBeNull();
    await updateProgrammingTask(f.ctx, draft.id, { dueDate: "2027-02-02", title: "Moved project" });
    const results = await Promise.all([setStage(f.ctx, draft.id, { stage: "confirmed" }), setStage(f.ctx, draft.id, { stage: "confirmed" })]);
    expect(results.every(row => row.calendarEventId === confirmed.calendarEventId)).toBe(true);
    await refreshCalendarFeed(f.org.id);
    const rows = await db(f.org.id).calendarFeedItem.list();
    expect(rows.filter(row => row.uid === old.uid)).toHaveLength(1);
    const revived = rows.find(row => row.uid === old.uid)!;
    expect(revived.cancelledAt).toBeNull(); expect(revived.revision).toBe(old.revision + 2);
    expect(revived.published).toMatchObject({ title: "Moved project", schedule: { start: "2027-02-02" } });
  });
  it("retries failed durable work without losing identity or publishing empty content", async () => {
    const f = await fixture();
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { title: "Retry me" } });
    await testPrisma.$executeRawUnsafe(`CREATE FUNCTION calendar_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated worker failure'; END $$`);
    await testPrisma.$executeRawUnsafe(`CREATE TRIGGER calendar_test_fail BEFORE UPDATE ON "CalendarFeedItem" FOR EACH ROW EXECUTE FUNCTION calendar_test_fail()`);
    try {
      await expect(refreshCalendarFeed(f.org.id)).rejects.toThrow();
      const failed = await db(f.org.id).calendarFeedWork.find();
      expect(failed!.version).toBeGreaterThan(failed!.appliedVersion);
      expect(failed!.failures).toBe(1);
      expect(failed!.failedAt).not.toBeNull();
      expect((await GET(f.request(), { params: Promise.resolve(f.params) })).status).toBe(503);
    } finally {
      await testPrisma.$executeRawUnsafe(`DROP TRIGGER calendar_test_fail ON "CalendarFeedItem"`);
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION calendar_test_fail()`);
    }
    await refreshCalendarFeed(f.org.id);
    expect((await db(f.org.id).calendarFeedWork.find())!.failedAt).toBeNull();
    expect(await (await GET(f.request(), { params: Promise.resolve(f.params) })).text()).toContain("Retry me");
  });
  it("ignores out-of-order wakeups and reconciles an unqueued drift without resetting revision", async () => {
    const f = await fixture();
    const delayedWakeup = () => refreshCalendarFeed(f.org.id);
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { title: "older" } });
    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { title: "newest" } });
    await refreshCalendarFeed(f.org.id);
    const [newest] = await db(f.org.id).calendarFeedItem.list();
    await delayedWakeup();
    expect((await db(f.org.id).calendarFeedItem.list())[0]).toEqual(newest);
    // Simulate an operator repairing the source with trigger delivery disabled.
    await testPrisma.$executeRawUnsafe(`ALTER TABLE "CalendarEvent" DISABLE TRIGGER calendar_feed_enqueue`);
    try { await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { title: "repair" } }); }
    finally { await testPrisma.$executeRawUnsafe(`ALTER TABLE "CalendarEvent" ENABLE TRIGGER calendar_feed_enqueue`); }
    await refreshCalendarFeed(f.org.id, true);
    const [repaired] = await db(f.org.id).calendarFeedItem.list();
    expect(repaired.uid).toBe(newest.uid); expect(repaired.revision).toBe(newest.revision + 1);
    expect(repaired.published).toMatchObject({ title: "repair" });
  });
  it("preserves structured instants through calendar and service editors and updates legacy display fields", async () => {
    const f = await fixture();
    await createSemester({ orgId: f.org.id, startDate: "2026-01-01", endDate: "2027-12-31" });
    const schedule = { kind: "timed" as const, start: "2027-01-02T04:00:00Z", end: "2027-01-02T06:00:00Z", timeZone: "America/New_York" };
    const calendar = await createCalendar(f.ctx, { title: "Overnight", date: "2027-01-02", category: "chapter", mandatory: true, schedule });
    expect(calendar.date).toBe("2027-01-01"); expect(calendar.time).toBe("23:00"); expect(calendar.schedule).toEqual(schedule);
    const updated = await updateCalendar(f.ctx, calendar.id, { title: "Rename only" });
    expect(updated.schedule).toEqual(schedule);
    const service = await createServiceEvent(f.ctx, { title: "Service", date: "2027-01-02", schedule });
    expect(service.calendarEvent.schedule).toEqual(schedule);
    expect(service.date).toBe("2027-01-01");
    await refreshCalendarFeed(f.org.id);
    expect(await (await GET(f.request(), { params: Promise.resolve(f.params) })).text()).toContain("DTSTART:20270102T040000Z");
  });
  it("enforces RLS on credentials, items and work using the actual NOBYPASSRLS role", async () => {
    const first = await fixture(); const second = await fixture("two");
    await applyEnforcingRls();
    try {
      expect(await asOrg(first.org.id, tx => tx.calendarSubscription.findMany({ where: { organizationId: second.org.id } }))).toEqual([]);
      expect(await asOrg(first.org.id, tx => tx.calendarFeedItem.findMany({ where: { organizationId: second.org.id } }))).toEqual([]);
      expect(await asOrg(null, tx => tx.calendarFeedWork.findMany())).toEqual([]);
      await expect(asOrg(first.org.id, tx => tx.calendarFeedItem.create({ data: { organizationId: second.org.id, sourceType: "task", sourceId: 900 } }))).rejects.toThrow();
      const own = await asOrg(first.org.id, tx => tx.calendarFeedItem.findMany());
      expect(own).toHaveLength(1);
    } finally { await dropEnforcingRls(); }
  });
});

describe("v2: times survive date changes", () => {
  const ny = (start: string, end: string) => ({ kind: "timed" as const, start, end, timeZone: "America/New_York" });
  async function linkedSchedule(id: number | null) {
    return (await testPrisma.calendarEvent.findUniqueOrThrow({ where: { id: id! } })).schedule;
  }
  it("moves a timed event to the same local time across a DST change, in every editor", async () => {
    const f = await fixture();
    await createSemester({ orgId: f.org.id, startDate: "2026-01-01", endDate: "2027-12-31" });
    // 7–9pm EST on Mar 10 2027; Mar 20 is EDT, so 7pm is 23:00Z not 00:00Z.
    const winter = ny("2027-03-11T00:00:00Z", "2027-03-11T02:00:00Z");
    const summer = ny("2027-03-20T23:00:00Z", "2027-03-21T01:00:00Z");

    const calendar = await createCalendar(f.ctx, { title: "Chapter", date: "2027-03-10", category: "chapter", mandatory: true, schedule: winter });
    const moved = await updateCalendar(f.ctx, calendar.id, { date: "2027-03-20" });
    expect(moved.schedule).toEqual(summer); expect(moved.time).toBe("19:00");

    const party = await createParty(f.ctx, { name: "Formal", date: "2027-03-10", schedule: winter, doorRevenue: 0, attendance: 0, expenses: 0 });
    expect(party.schedule).toEqual(winter);
    const partyMoved = await updateParty(f.ctx, party.id, { date: "2027-03-20", theme: "Gold" });
    expect(await linkedSchedule(party.attendanceEventId)).toEqual(summer);
    expect(partyMoved.schedule).toEqual(summer);
    // Re-saving the same date (the edit form always sends it) changes nothing.
    await updateParty(f.ctx, party.id, { date: "2027-03-20", name: "Spring Formal" });
    expect(await linkedSchedule(party.attendanceEventId)).toEqual(summer);

    const service = await createServiceEvent(f.ctx, { title: "Cleanup", date: "2027-03-10", schedule: winter });
    const serviceMoved = await updateServiceEvent(f.ctx, service.id, { date: "2027-03-20" });
    expect(serviceMoved.schedule).toEqual(summer);
    const allDay = await updateServiceEvent(f.ctx, service.id, { schedule: { kind: "allDay", start: "2027-03-21", end: "2027-03-22" } });
    expect(allDay.schedule).toEqual({ kind: "allDay", start: "2027-03-21", end: "2027-03-22" });
    expect(allDay.date).toBe("2027-03-21"); expect(allDay.time).toBeNull();

    const idea = await createProgrammingTask(f.ctx, { title: "Speaker", category: "service", schedule: winter, ownerBrotherId: f.ctx.actorId });
    await updateProgrammingTask(f.ctx, idea.id, { dueDate: "2027-03-20" });
    expect((await testPrisma.programmingEvent.findUniqueOrThrow({ where: { id: idea.id } })).schedule).toEqual(summer);
  });
  it("refuses a date move onto a skipped DST hour instead of guessing a time", async () => {
    const f = await fixture();
    await createSemester({ orgId: f.org.id, startDate: "2026-01-01", endDate: "2027-12-31" });
    // 2:30am on Mar 7 2027 exists; on Mar 14 2027 (spring forward) it doesn't.
    const early = await createCalendar(f.ctx, { title: "Late night", date: "2027-03-07", category: "chapter", mandatory: false, schedule: ny("2027-03-07T07:30:00Z", "2027-03-07T08:30:00Z") });
    await expect(updateCalendar(f.ctx, early.id, { date: "2027-03-14" })).rejects.toThrow(/daylight-saving/);
    expect((await testPrisma.calendarEvent.findUniqueOrThrow({ where: { id: early.id } })).date).toBe("2027-03-07");
  });
  it("party and service lists carry the linked entry's timing for their editors", async () => {
    const f = await fixture();
    await createSemester({ orgId: f.org.id, startDate: "2026-01-01", endDate: "2027-12-31" });
    const schedule = ny("2027-03-11T00:00:00Z", "2027-03-11T02:00:00Z");
    await createParty(f.ctx, { name: "Formal", date: "2027-03-10", schedule, doorRevenue: 0, attendance: 0, expenses: 0 });
    const { listParties } = await import("@/lib/services/party-service");
    expect((await listParties(f.ctx)).map(p => p.schedule)).toEqual([schedule]);
  });
});

describe("v2: admins run readiness from Settings", () => {
  async function unprovisioned() {
    const org = await createOrg("fresh", "fresh");
    const member = await createBrother({ orgId: org.id });
    await refreshCalendarFeed(org.id, true);
    return { org, ctx: { ...context(org.id), actorId: member.id } };
  }
  it("provisions, checks via the worker, enables, and survives a time-zone change", async () => {
    const { org, ctx } = await unprovisioned();
    await expect(manageCalendarSubscription(ctx, { action: "validate" })).rejects.toThrow(/time zone/);
    await manageCalendarSubscription(ctx, { action: "timeZone", timeZone: "America/New_York" });
    const before = await getCalendarSubscription(ctx);
    expect(before).toMatchObject({ problem: null, validating: false, validated: false, configured: true });

    await manageCalendarSubscription(ctx, { action: "validate" });
    const requested = await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(requested.tokenCiphertext).not.toBeNull();       // link created by the check itself
    expect(requested.validationRequestedAt).not.toBeNull();
    expect(requested.validatedAt).toBeNull();                // never inside the request
    expect((await adminView(ctx)).validating).toBe(true);
    await expect(manageCalendarSubscription(ctx, { action: "enable" })).rejects.toThrow(/publication check/);

    await refreshCalendarFeed(org.id);                       // the worker settles the request
    const settled = await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(settled.validatedAt).not.toBeNull(); expect(settled.validationRequestedAt).toBeNull();

    await manageCalendarSubscription(ctx, { action: "enable" });
    await manageCalendarSubscription(ctx, { action: "timeZone", timeZone: "America/Chicago" });
    const after = await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(after.enabled).toBe(true); expect(after.validatedAt).toEqual(settled.validatedAt);
    const url = (await getCalendarSubscription(ctx)).url!;
    const [publicId, secret] = url.split("/").slice(-2);
    expect((await GET(new Request(url), { params: Promise.resolve({ publicId, secret }) })).status).toBe(200);
  });
  it("fails a check when blocking data appears before the worker runs", async () => {
    const { org, ctx } = await unprovisioned();
    await manageCalendarSubscription(ctx, { action: "timeZone", timeZone: "America/New_York" });
    await manageCalendarSubscription(ctx, { action: "validate" });
    await testPrisma.calendarEvent.create({ data: { organizationId: org.id, title: "Old dues deadline", date: "2027-01-05", category: "deadline", mandatory: false } });
    await refreshCalendarFeed(org.id);
    const row = await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(row.validatedAt).toBeNull(); expect(row.validationRequestedAt).toBeNull();
    const view = await adminView(ctx);
    expect(view.problem).toMatch(/blocking/);
    expect(view.issues?.find(i => i.kind === "legacy-deadline")?.title).toBe("Old dues deadline");
    await expect(manageCalendarSubscription(ctx, { action: "validate" })).rejects.toThrow(/blocking/);
  });
  it("turns on in one step: saves the zone, and the worker enables it when the check passes", async () => {
    const { org, ctx } = await unprovisioned();
    await manageCalendarSubscription(ctx, { action: "turnOn", timeZone: "America/New_York" });
    expect((await testPrisma.organization.findUniqueOrThrow({ where: { id: org.id } })).timeZone).toBe("America/New_York");
    const pending = await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(pending).toMatchObject({ enabled: false, enableOnValidation: true });
    expect(pending.tokenCiphertext).not.toBeNull();
    expect(await adminView(ctx)).toMatchObject({ validating: true, turningOn: true });

    await refreshCalendarFeed(org.id);
    const live = await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(live).toMatchObject({ enabled: true, enableOnValidation: false, validationRequestedAt: null });
    expect((await getCalendarSubscription(ctx)).url).not.toBeNull();

    // Turned off later, turning back on is immediate: the check is on file.
    await manageCalendarSubscription(ctx, { action: "disable" });
    await manageCalendarSubscription(ctx, { action: "turnOn" });
    expect((await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } })).enabled).toBe(true);
  });
  it("a failed turn-on check, or turning off meanwhile, leaves it off", async () => {
    const { org, ctx } = await unprovisioned();
    await expect(manageCalendarSubscription(ctx, { action: "turnOn" })).rejects.toThrow(/time zone/);
    await manageCalendarSubscription(ctx, { action: "turnOn", timeZone: "America/New_York" });
    await testPrisma.calendarEvent.create({ data: { organizationId: org.id, title: "Old dues deadline", date: "2027-01-05", category: "deadline", mandatory: false } });
    await refreshCalendarFeed(org.id);
    expect(await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } })).toMatchObject({ enabled: false, enableOnValidation: false, validatedAt: null });

    await testPrisma.calendarEvent.deleteMany({ where: { organizationId: org.id, category: "deadline" } });
    await manageCalendarSubscription(ctx, { action: "turnOn" });
    await manageCalendarSubscription(ctx, { action: "disable" });
    await refreshCalendarFeed(org.id);
    expect((await testPrisma.calendarSubscription.findUniqueOrThrow({ where: { organizationId: org.id } })).enabled).toBe(false);
  });
  it("puts an unlinked service project on the timeline like the backfill; never a party or a probable duplicate", async () => {
    const { org, ctx } = await unprovisioned();
    const service = await testPrisma.serviceEvent.create({ data: { organizationId: org.id, title: "Food bank", date: "2027-02-01", location: "Main St", notes: "SECRET" } });
    const party = await testPrisma.partyEvent.create({ data: { organizationId: org.id, name: "Formal", date: "2027-02-03" } });
    expect((await adminView(ctx)).issues?.filter(i => i.blocking).map(i => i.kind).sort()).toEqual(["unlinked-party", "unlinked-service"]);

    await manageCalendarSubscription(ctx, { action: "link", source: "service", id: service.id });
    await manageCalendarSubscription(ctx, { action: "link", source: "service", id: service.id }); // already linked: no second entry
    const { calendarEventId } = await testPrisma.serviceEvent.findUniqueOrThrow({ where: { id: service.id } });
    const entry = await testPrisma.calendarEvent.findUniqueOrThrow({ where: { id: calendarEventId! } });
    expect(entry).toMatchObject({ title: "Food bank", date: "2027-02-01", category: "service", location: "Main St", description: null, schedule: { kind: "allDay", start: "2027-02-01", end: "2027-02-02" } });
    expect(await testPrisma.calendarEvent.count({ where: { organizationId: org.id, title: "Food bank" } })).toBe(1);
    expect((await adminView(ctx)).issues?.filter(i => i.blocking).map(i => i.kind)).toEqual(["unlinked-party"]);
    // Parties aren't accepted at all: their attendance may belong to an existing event.
    expect(manageCalendarFeedInput.safeParse({ action: "link", source: "party", id: party.id }).success).toBe(false);

    // A possible existing match is left for a person to decide.
    const twin = await testPrisma.serviceEvent.create({ data: { organizationId: org.id, title: "Food bank", date: "2027-03-01", location: "", notes: "" } });
    await expect(manageCalendarSubscription(ctx, { action: "link", source: "service", id: twin.id })).rejects.toThrow(/already has an event/);
    expect((await testPrisma.serviceEvent.findUniqueOrThrow({ where: { id: twin.id } })).calendarEventId).toBeNull();

    const other = await createOrg("other", "other");
    const foreign = await testPrisma.serviceEvent.create({ data: { organizationId: other.id, title: "Theirs", date: "2027-02-01", location: "", notes: "" } });
    await expect(manageCalendarSubscription(ctx, { action: "link", source: "service", id: foreign.id })).rejects.toThrow(/not found/i);
  });
  it("keeps admin-only readiness out of member responses and member hands off admin actions", async () => {
    const { ctx } = await unprovisioned();
    const memberCtx = { ...ctx, isOrgAdmin: false };
    const view = await getCalendarSubscription(memberCtx);
    expect(view).not.toHaveProperty("issues"); expect(view).not.toHaveProperty("problem");
    await expect(manageCalendarSubscription(memberCtx, { action: "validate" })).rejects.toThrow();
  });
});

describe("v2: member setup preview", () => {
  it("previews the next published entries, without notes, only when the link is live", async () => {
    const f = await fixture();
    await testPrisma.calendarEvent.create({ data: { organizationId: f.org.id, title: "Past social", date: "2020-01-01", category: "chapter", mandatory: false } });
    await testPrisma.task.create({ data: { organizationId: f.org.id, title: "Submit roster", dueDate: "2026-12-15", status: "open" } });
    await refreshCalendarFeed(f.org.id);
    const member = { ...f.ctx, isOrgAdmin: false };
    const view = await getCalendarSubscription(member);
    expect(view.orgName).toBe("one");
    expect(view.preview.map(p => [p.title, p.deadline])).toEqual([["Deadline: Submit roster", true], ["one event", false]]);
    expect(JSON.stringify(view.preview)).not.toContain("SECRET");
    await testPrisma.calendarSubscription.update({ where: { organizationId: f.org.id }, data: { enabled: false } });
    expect((await getCalendarSubscription(member)).preview).toEqual([]);
  });
});

describe("v2: member publishing status", () => {
  it("never reports missing health as current, tracks pending work, and bumps generation on rotate", async () => {
    const f = await fixture();
    const member = { ...f.ctx, isOrgAdmin: false };
    const initial = await getCalendarSubscription(member);
    expect(initial.status.state).toBe("current");
    expect(initial.status.updatedAt).toBeInstanceOf(Date);
    expect(initial).not.toHaveProperty("health");

    await testPrisma.calendarEvent.update({ where: { id: f.event.id }, data: { title: "changed" } });
    expect((await getCalendarSubscription(member)).status.state).toBe("publishing");
    await testPrisma.calendarFeedWork.update({ where: { organizationId: f.org.id }, data: { failedAt: new Date(), failures: 1 } });
    expect((await getCalendarSubscription(member)).status.state).toBe("retrying");

    await testPrisma.calendarFeedWork.delete({ where: { organizationId: f.org.id } });
    expect((await getCalendarSubscription(member)).status).toEqual({ state: "unknown", updatedAt: null });

    const before = initial.generation;
    await manageCalendarSubscription(f.ctx, { action: "rotate" });
    expect((await getCalendarSubscription(member)).generation).toBe(before + 1);
  });
});

describe("A3: invites and one-off copies", () => {
  const signIn = (orgId: number, id: number) => { session.user = { id, orgId, name: "Member", email: null, authUserId: "member", memberships: [{ id: 1, organizationId: orgId, isOrgAdmin: false }], roleRows: [], isPlatformAdmin: false }; };
  it("summary says only whether the feed is live, never the URL", async () => {
    const f = await fixture();
    signIn(f.org.id, f.ctx.actorId);
    const body = await (await subscriptionGet(new Request("https://example.com/api/calendar/subscription?summary=1"))).json();
    expect(body).toEqual({ live: true });
    await manageCalendarSubscription(f.ctx, { action: "disable" });
    expect(await calendarFeedLive(f.ctx)).toEqual({ live: false });
  });
  it("exports one event as ICS or a Google link from published fields only, never notes", async () => {
    const f = await fixture();
    signIn(f.org.id, f.ctx.actorId);
    const call = (to: string, id = f.event.id) => exportEvent(new Request(`https://example.com/api/calendar/${id}/export?to=${to}&org=${f.org.slug}`), { params: Promise.resolve({ id: String(id) }) });
    const ics = await call("ics");
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(ics.headers.get("content-disposition")).toMatch(/^attachment; filename=".+\.ics"$/);
    const body = await ics.text();
    expect(body).toContain("SUMMARY:one event");
    expect(body).toContain(`UID:chaptos-copy-${f.org.id}-${f.event.id}`);
    expect(body.replace(/\r\n /g, "")).toContain("DESCRIPTION:Required · attendance is taken\\nOpen in ChaptOS: ");
    expect(body).not.toContain("SECRET");
    const google = await call("google");
    expect(google.status).toBe(302);
    expect(google.headers.get("location")).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    expect(google.headers.get("location")).not.toContain("SECRET");
    expect((await call("pdf")).status).toBe(400);
    // The feed's own exclusions hold: a draft programming event isn't exportable.
    await testPrisma.programmingEvent.create({ data: { organizationId: f.org.id, calendarEventId: f.event.id, title: "Program", date: "2027-01-01", category: "service", stage: "planning" } });
    expect((await call("ics")).status).toBe(400);
  });
  it("can't export another org's event", async () => {
    const first = await fixture(); const second = await fixture("two");
    signIn(first.org.id, first.ctx.actorId);
    const res = await exportEvent(new Request(`https://example.com/api/calendar/${second.event.id}/export?to=ics`), { params: Promise.resolve({ id: String(second.event.id) }) });
    expect(res.status).toBe(404);
  });
});
