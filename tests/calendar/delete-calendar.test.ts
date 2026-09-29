import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { deleteCalendar } from "@/lib/services/calendar-service";
import { NotFoundError } from "@/lib/errors";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent, joinOrg } from "../setup/factories";

beforeEach(resetDb);
afterAll(() => testPrisma.$disconnect());

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Tester",
    actorEmail: null, authUserId: "auth-test", membershipId: null,
    permissions: 0, maxRank: 0, isOrgAdmin: true, isPlatformAdmin: false, db: db(orgId),
  };
}

async function fixture() {
  const org = await createOrg("Calendar", "calendar");
  const member = await createBrother({ orgId: org.id, attendance: 50, serviceHours: 3 });
  const semester = await createSemester({ orgId: org.id });
  const event = await createCalendarEvent({ orgId: org.id });
  return { org, member, semester, event, ctx: ctxFor(org.id, member.id) };
}

describe("deleteCalendar", () => {
  it("deletes an event without attendance and reports a repeated deletion as not found", async () => {
    const { ctx, event } = await fixture();
    await deleteCalendar(ctx, event.id);
    expect(await testPrisma.calendarEvent.findUnique({ where: { id: event.id } })).toBeNull();
    await expect(deleteCalendar(ctx, event.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes attendance and excuses and recalculates only this org's roster", async () => {
    const { org, member, semester, event, ctx } = await fixture();
    const otherOrg = await createOrg("Other", "other");
    await joinOrg({ brotherId: member.id, orgId: otherOrg.id, attendance: 75 });
    const remaining = await createCalendarEvent({ orgId: org.id });
    await testPrisma.attendanceRecord.createMany({ data: [
      { calendarEventId: event.id, brotherId: member.id, semesterId: semester.id, attended: false },
      { calendarEventId: remaining.id, brotherId: member.id, semesterId: semester.id, attended: true },
    ] });
    await testPrisma.attendanceExcuse.create({ data: {
      calendarEventId: event.id, brotherId: member.id, semesterId: semester.id, reason: "Unavailable", status: "pending",
    } });
    await deleteCalendar(ctx, event.id);
    expect(await testPrisma.attendanceRecord.count({ where: { calendarEventId: event.id } })).toBe(0);
    expect(await testPrisma.attendanceExcuse.count({ where: { calendarEventId: event.id } })).toBe(0);
    expect(await testPrisma.attendanceRecord.count({ where: { calendarEventId: remaining.id } })).toBe(1);
    expect(await ctx.db.member.findFirst({ where: { brotherId: member.id } })).toMatchObject({ attendance: 100 });
    expect(await db(otherOrg.id).member.findFirst({ where: { brotherId: member.id } })).toMatchObject({ attendance: 75 });
  });

  it("deletes an event with only an excuse and keeps the active semester ratio", async () => {
    const { org, member, semester, event, ctx } = await fixture();
    const oldSemester = await createSemester({ orgId: org.id, label: "OLD", isActive: false });
    const currentEvent = await createCalendarEvent({ orgId: org.id });
    await testPrisma.attendanceRecord.create({ data: {
      calendarEventId: currentEvent.id, brotherId: member.id, semesterId: semester.id, attended: true,
    } });
    await testPrisma.attendanceExcuse.create({ data: {
      calendarEventId: event.id, brotherId: member.id, semesterId: oldSemester.id, reason: "Excused",
    } });
    await deleteCalendar(ctx, event.id);
    expect(await testPrisma.attendanceExcuse.count()).toBe(0);
    expect(await ctx.db.member.findFirst({ where: { brotherId: member.id } })).toMatchObject({ attendance: 100 });
  });

  it("preserves the planning entry and refreshes hours when deleting a linked service event", async () => {
    const { org, member, event, ctx } = await fixture();
    const planning = await testPrisma.programmingEvent.create({ data: {
      organizationId: org.id, calendarEventId: event.id, title: "Service", category: "service", stage: "confirmed",
    } });
    const service = await testPrisma.serviceEvent.create({ data: {
      organizationId: org.id, calendarEventId: event.id, title: "Service", date: event.date,
    } });
    await testPrisma.serviceParticipation.create({ data: {
      organizationId: org.id, serviceEventId: service.id, brotherId: member.id, hours: 3,
    } });
    await deleteCalendar(ctx, event.id);
    expect(await testPrisma.serviceEvent.count()).toBe(0);
    expect(await testPrisma.serviceParticipation.count()).toBe(0);
    expect(await ctx.db.member.findFirst({ where: { brotherId: member.id } })).toMatchObject({ serviceHours: 0 });
    expect(await testPrisma.programmingEvent.findUnique({ where: { id: planning.id } })).toMatchObject({ stage: "idea", calendarEventId: null });
  });

  it("rejects another org's event without removing its attendance", async () => {
    const { member, semester, event } = await fixture();
    await testPrisma.attendanceRecord.create({ data: {
      calendarEventId: event.id, brotherId: member.id, semesterId: semester.id, attended: true,
    } });
    const otherOrg = await createOrg("Other", "other");
    const otherMember = await createBrother({ orgId: otherOrg.id });
    await expect(deleteCalendar(ctxFor(otherOrg.id, otherMember.id), event.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await testPrisma.calendarEvent.count({ where: { id: event.id } })).toBe(1);
    expect(await testPrisma.attendanceRecord.count({ where: { calendarEventId: event.id } })).toBe(1);
  });
});
