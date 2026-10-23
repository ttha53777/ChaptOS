/**
 * Repeat on a new event: one create makes a meeting every week (or every other
 * week) through the last day, each its own CalendarEvent at the same local time.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { createCalendar } from "@/lib/services/calendar-service";
import { createCalendarInput } from "@/lib/validation/calendar";
import { scheduleTime } from "@/lib/calendar-feed/schedule";
import { repeatDates } from "@/lib/event-repeat";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Officer", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: true, isPlatformAdmin: false, db: db(orgId),
  };
}

async function chapter() {
  const org = await createOrg("Alpha", "alpha");
  await createSemester({ orgId: org.id, startDate: "2026-01-12", endDate: "2026-05-01" });
  const officer = await createBrother({ orgId: org.id, name: "Jamie Sullivan" });
  return { org, ctx: ctxFor(org.id, officer.id) };
}

// Mon Mar 2 2026, 7:30–9:00 PM in New York (EST). DST starts Sun Mar 8.
const MAR2 = { kind: "timed" as const, start: "2026-03-03T00:30:00Z", end: "2026-03-03T02:00:00Z", timeZone: "America/New_York" };
const meeting = (extra: Record<string, unknown> = {}) => createCalendarInput.parse({
  title: "Chapter meeting", date: "2026-03-02", category: "chapter", mandatory: true, schedule: MAR2, ...extra,
});

describe("repeatDates", () => {
  it("steps by one or two weeks and includes the last day", () => {
    expect(repeatDates("2026-03-02", { every: 1, until: "2026-03-16" })).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
    expect(repeatDates("2026-03-02", { every: 2, until: "2026-03-29" })).toEqual(["2026-03-02", "2026-03-16"]);
  });
});

describe("createCalendar with repeat", () => {
  it("creates one event per week through the last day, same local time across DST", async () => {
    const { org, ctx } = await chapter();
    const res = await createCalendar(ctx, meeting({ repeat: { every: 1, until: "2026-03-23" } }));
    expect("series" in res && res.series.length).toBe(3);
    const rows = await testPrisma.calendarEvent.findMany({ where: { organizationId: org.id }, orderBy: { date: "asc" } });
    expect(rows.map(r => r.date)).toEqual(["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"]);
    expect(rows.map(r => r.time)).toEqual(["19:30", "19:30", "19:30", "19:30"]);
    for (const r of rows) expect(scheduleTime(r.schedule as typeof MAR2)).toBe("19:30");
    expect(res.date).toBe("2026-03-02");
  });

  it("writes one activity line for the whole repeat, not one per meeting", async () => {
    const { org, ctx } = await chapter();
    await createCalendar(ctx, meeting({ repeat: { every: 1, until: "2026-03-23" } }));
    const lines = await testPrisma.activityLog.findMany({ where: { organizationId: org.id } });
    expect(lines.map(l => l.message)).toEqual(["Officer scheduled 4 × Chapter meeting, weekly from 2026-03-02 to 2026-03-23"]);
    expect(await testPrisma.operationalEvent.count({ where: { organizationId: org.id, action: "calendar.created" } })).toBe(4);
  });

  it("every other week", async () => {
    const { org, ctx } = await chapter();
    await createCalendar(ctx, meeting({ repeat: { every: 2, until: "2026-04-01" } }));
    const rows = await testPrisma.calendarEvent.findMany({ where: { organizationId: org.id }, orderBy: { date: "asc" } });
    expect(rows.map(r => r.date)).toEqual(["2026-03-02", "2026-03-16", "2026-03-30"]);
  });

  it("refuses a repeat past the term or with nothing to repeat, and creates nothing", async () => {
    const { org, ctx } = await chapter();
    await expect(createCalendar(ctx, meeting({ repeat: { every: 1, until: "2026-05-20" } }))).rejects.toThrow(/within the current semester/);
    await expect(createCalendar(ctx, meeting({ repeat: { every: 2, until: "2026-03-10" } }))).rejects.toThrow(/two weeks/);
    expect(await testPrisma.calendarEvent.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("a repeated party gets a ledger per night", async () => {
    const { org, ctx } = await chapter();
    await createCalendar(ctx, meeting({ title: "Open house", category: "party", mandatory: false, repeat: { every: 1, until: "2026-03-09" } }));
    const parties = await testPrisma.partyEvent.findMany({ where: { organizationId: org.id }, orderBy: { date: "asc" } });
    expect(parties.map(p => p.date)).toEqual(["2026-03-02", "2026-03-09"]);
    expect(parties.every(p => p.attendanceEventId != null)).toBe(true);
  });

  it("a plain create is unchanged: no series", async () => {
    const { ctx } = await chapter();
    const res = await createCalendar(ctx, meeting());
    expect("series" in res).toBe(false);
  });
});
