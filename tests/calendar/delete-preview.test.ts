import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { deleteCalendar, previewDeleteCalendar } from "@/lib/services/calendar-service";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { testPrisma, resetDb } from "../setup/prisma";
import {
  createOrg, createBrother, createSemester, createCalendarEvent, createPartyEvent,
  createServiceEvent, createServiceParticipation, createFundraiser,
} from "../setup/factories";

beforeEach(resetDb);
afterAll(() => testPrisma.$disconnect());

function ctxFor(orgId: number, actorId: number, opts: { admin?: boolean; permissions?: number } = {}): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Tester",
    actorEmail: null, authUserId: "auth-test", membershipId: null,
    permissions: opts.permissions ?? 0, maxRank: 0, isOrgAdmin: opts.admin ?? true, isPlatformAdmin: false, db: db(orgId),
  };
}

async function fixture() {
  const org = await createOrg("Preview", "preview");
  const a = await createBrother({ orgId: org.id });
  const b = await createBrother({ orgId: org.id });
  const semester = await createSemester({ orgId: org.id });
  const event = await createCalendarEvent({ orgId: org.id, category: "party" });
  return { org, a, b, semester, event, ctx: ctxFor(org.id, a.id) };
}

describe("previewDeleteCalendar", () => {
  it("counts exactly what deleteCalendar would remove", async () => {
    const { org, a, b, semester, event, ctx } = await fixture();
    const other = await createCalendarEvent({ orgId: org.id });
    await testPrisma.attendanceRecord.createMany({ data: [
      { calendarEventId: event.id, brotherId: a.id, semesterId: semester.id, attended: true },
      { calendarEventId: event.id, brotherId: b.id, semesterId: semester.id, attended: false },
      { calendarEventId: other.id, brotherId: a.id, semesterId: semester.id, attended: true },
    ] });
    await testPrisma.attendanceExcuse.create({ data: {
      calendarEventId: event.id, brotherId: b.id, semesterId: semester.id, reason: "Exam", status: "pending",
    } });
    const party = await createPartyEvent({ orgId: org.id, name: "Halloween" });
    await testPrisma.partyEvent.update({ where: { id: party.id }, data: { attendanceEventId: event.id, doorRevenue: 412, expenses: 90 } });
    const svc = await createServiceEvent({ orgId: org.id, calendarEventId: event.id });
    await createServiceParticipation({ orgId: org.id, serviceEventId: svc.id, brotherId: a.id, hours: 2 });

    expect(await previewDeleteCalendar(ctx, event.id)).toEqual({
      attendance: 2, excuses: 1,
      party: { name: "Halloween", doorRevenue: 412, expenses: 90, completed: false },
      serviceMembers: 1, programming: false, fundraiser: null, blocked: null,
    });
    // and it only looks: nothing was removed
    expect(await testPrisma.attendanceRecord.count({ where: { calendarEventId: event.id } })).toBe(2);
  });

  it("says nothing goes with an event that has nothing", async () => {
    const { org, ctx } = await fixture();
    const bare = await createCalendarEvent({ orgId: org.id });
    expect(await previewDeleteCalendar(ctx, bare.id)).toEqual({
      attendance: 0, excuses: 0, party: null, serviceMembers: 0, programming: false, fundraiser: null, blocked: null,
    });
  });

  it("names the fundraiser and its shopping list that go with the event", async () => {
    const { org, ctx } = await fixture();
    const f = await createFundraiser({ orgId: org.id, supplies: [{ name: "Flour", costCents: 1800 }, { name: "Boxes", costCents: 1100 }], cameInCents: 20000 });
    expect((await previewDeleteCalendar(ctx, f.calendarEventId)).fundraiser).toEqual({ supplies: 2, wrapped: true });
  });

  it("says up front when the party ledger needs MANAGE_PARTIES, as deleteCalendar would refuse", async () => {
    const { org, a, event } = await fixture();
    const party = await createPartyEvent({ orgId: org.id });
    await testPrisma.partyEvent.update({ where: { id: party.id }, data: { attendanceEventId: event.id } });
    const officer = ctxFor(org.id, a.id, { admin: false, permissions: PERMISSIONS.MANAGE_EVENTS });
    expect((await previewDeleteCalendar(officer, event.id)).blocked).toBe("MANAGE_PARTIES");
    await expect(deleteCalendar(officer, event.id)).rejects.toBeInstanceOf(ForbiddenError);
    const both = ctxFor(org.id, a.id, { admin: false, permissions: PERMISSIONS.MANAGE_EVENTS | PERMISSIONS.MANAGE_PARTIES });
    expect((await previewDeleteCalendar(both, event.id)).blocked).toBeNull();
  });

  it("can't see another org's event", async () => {
    const { event } = await fixture();
    const otherOrg = await createOrg("Other", "other");
    const stranger = await createBrother({ orgId: otherOrg.id });
    await expect(previewDeleteCalendar(ctxFor(otherOrg.id, stranger.id), event.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
