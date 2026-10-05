import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { createCalendar, updateCalendar, deleteCalendar, listCalendar } from "@/lib/services/calendar-service";
import { createParty, updateParty, deleteParty, listParties, wrapUpParty } from "@/lib/services/party-service";
import { createPartyInput } from "@/lib/validation/party";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import { isProgrammingManagedType } from "@/lib/programming";
import { BUILTIN_EVENT_TYPES, isEventTypeVisibleInPicker } from "@/lib/event-types";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createPartyEvent, createCalendarEvent } from "../setup/factories";

beforeEach(resetDb);
afterAll(() => testPrisma.$disconnect());

async function fixture(slug = "party-calendar") {
  const org = await createOrg(slug, slug);
  const member = await createBrother({ orgId: org.id });
  await createSemester({ orgId: org.id });
  const ctx: RequestContext = {
    requestId: randomUUID(), orgId: org.id, actorId: member.id, actorName: "Tester",
    actorEmail: null, authUserId: "auth-test", membershipId: null, permissions: 0,
    maxRank: 0, isOrgAdmin: true, isPlatformAdmin: false, db: db(org.id),
  };
  return { org, member, ctx };
}

const calendarInput = {
  title: "Spring Party", date: "2026-05-15", time: "8:00 PM", category: "party",
  location: "The hall", description: "Everyone welcome", mandatory: true,
};

describe("Party calendar category", () => {
  it("is selectable on Timeline and plannable on the Programming board", () => {
    const type = BUILTIN_EVENT_TYPES.find(t => t.slug === "party")!;
    expect(isEventTypeVisibleInPicker({ ...type, hidden: false }, ["parties"])).toBe(true);
    expect(isEventTypeVisibleInPicker({ ...type, hidden: false }, [])).toBe(false);
    // Programming can plan a party too; confirming it creates the Parties-page
    // ledger (see programming-service.test.ts).
    expect(isProgrammingManagedType(type)).toBe(true);
  });

  it("creates a calendar event and attached ledger with real IDs and scheduling fields", async () => {
    const { ctx } = await fixture();
    const event = await createCalendar(ctx, calendarInput);
    expect(event.partyEventId).toEqual(expect.any(Number));
    expect(await listCalendar(ctx)).toEqual([expect.objectContaining({ ...calendarInput, id: event.id, partyEventId: event.partyEventId })]);
    expect(await listParties(ctx)).toEqual([expect.objectContaining({ id: event.partyEventId, attendanceEventId: event.id, mandatory: true })]);
  });

  it("creates a calendar entry from Parties and reuses it when taking roll", async () => {
    const { ctx, member } = await fixture();
    const party = await createParty(ctx, createPartyInput.parse({ name: "New party", date: "2026-05-15" }));
    expect(party.attendanceEventId).toEqual(expect.any(Number));
    await wrapUpParty(ctx, party.id, { doorRevenue: 10, expenses: 2, mandatory: false, attendedIds: [member.id] });
    expect(await ctx.db.calendarEvent.count()).toBe(1);
    expect(await testPrisma.attendanceRecord.findFirst()).toMatchObject({ calendarEventId: party.attendanceEventId, attended: true });
  });

  it("synchronizes schedule edits in both directions without overwriting wrap-up notes", async () => {
    const { ctx } = await fixture();
    const event = await createCalendar(ctx, calendarInput);
    await updateParty(ctx, event.partyEventId!, { name: "New name", date: "2026-05-16", notes: "Wrap-up notes" });
    expect(await ctx.db.calendarEvent.findUnique({ where: { id: event.id } })).toMatchObject({ title: "New name", date: "2026-05-16", description: "Everyone welcome", time: "8:00 PM" });
    const saved = await updateCalendar(ctx, event.id, { title: "Final name", date: "2026-05-17", location: "New hall" });
    expect(saved.partyEventId).toBe(event.partyEventId);
    expect(await ctx.db.partyEvent.findUnique({ where: { id: event.partyEventId! } })).toMatchObject({ name: "Final name", date: "2026-05-17", notes: "Wrap-up notes" });
  });

  it("preserves required attendance when wrap-up omits the attendance setting", async () => {
    const { ctx, member } = await fixture();
    const event = await createCalendar(ctx, calendarInput);
    const wrapped = await wrapUpParty(ctx, event.partyEventId!, { doorRevenue: 10, expenses: 2, attendedIds: [member.id] });
    expect(wrapped).toMatchObject({ attendanceEventId: event.id, mandatory: true });
    expect(await listCalendar(ctx)).toEqual([expect.objectContaining({ id: event.id, mandatory: true })]);
  });

  it("validates semester bounds from the Parties page before creating either record", async () => {
    const { ctx } = await fixture();
    await expect(createParty(ctx, createPartyInput.parse({ name: "Outside semester", date: "2027-01-01" }))).rejects.toBeInstanceOf(ValidationError);
    expect(await ctx.db.calendarEvent.count()).toBe(0);
    expect(await ctx.db.partyEvent.count()).toBe(0);
  });

  it("does not collapse different parties with identical names", async () => {
    const { ctx } = await fixture();
    await createCalendar(ctx, calendarInput);
    await createCalendar(ctx, calendarInput);
    const rows = await listCalendar(ctx);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.partyEventId)).size).toBe(2);
  });

  it("attaches a ledger when an ordinary calendar entry changes to Party", async () => {
    const { ctx, org } = await fixture();
    const event = await createCalendarEvent({ orgId: org.id });
    const updated = await updateCalendar(ctx, event.id, { category: "party" });
    expect(updated.partyEventId).toEqual(expect.any(Number));
    await updateCalendar(ctx, event.id, { category: "party" });
    expect(await ctx.db.partyEvent.count()).toBe(1);
    await expect(updateCalendar(ctx, event.id, { category: "chapter" })).rejects.toBeInstanceOf(ValidationError);
  });

  it.each(["calendar", "party"])("deleting from %s removes the entry, ledger, and attendance", async source => {
    const { ctx, member } = await fixture();
    const event = await createCalendar(ctx, calendarInput);
    await wrapUpParty(ctx, event.partyEventId!, { doorRevenue: 10, expenses: 2, mandatory: true, attendedIds: [member.id] });
    if (source === "calendar") await deleteCalendar(ctx, event.id);
    else await deleteParty(ctx, event.partyEventId!);
    expect(await ctx.db.calendarEvent.count()).toBe(0);
    expect(await ctx.db.partyEvent.count()).toBe(0);
    expect(await testPrisma.attendanceRecord.count()).toBe(0);
  });

  it("requires party-management authority before deleting its financial ledger from Timeline", async () => {
    const { ctx } = await fixture();
    const event = await createCalendar(ctx, calendarInput);
    const eventsOnly = { ...ctx, isOrgAdmin: false, permissions: PERMISSIONS.MANAGE_EVENTS };
    await expect(deleteCalendar(eventsOnly, event.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await ctx.db.partyEvent.count()).toBe(1);
    expect(await ctx.db.calendarEvent.count()).toBe(1);
  });

  it("does not expose or mutate another organization's event or party", async () => {
    const { ctx } = await fixture();
    const event = await createCalendar(ctx, calendarInput);
    const { ctx: other } = await fixture("other");
    expect(await listCalendar(other)).toEqual([]);
    expect(await listParties(other)).toEqual([]);
    await expect(updateCalendar(other, event.id, { title: "Wrong org" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteParty(other, event.partyEventId!)).rejects.toBeInstanceOf(NotFoundError);
    expect(await ctx.db.calendarEvent.findUnique({ where: { id: event.id } })).toMatchObject({ title: calendarInput.title });
  });

  it("backfills legacy parties and standalone events without changing existing attendance links", async () => {
    const { org, ctx } = await fixture();
    const linkedEvent = await createCalendar(ctx, calendarInput);
    const unlinked = await createPartyEvent({ orgId: org.id, name: calendarInput.title });
    const standalone = await createCalendarEvent({ orgId: org.id, category: "party" });
    const sql = readFileSync("prisma/migrations/20260929000000_party_calendar_category/migration.sql", "utf8");
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    try { await pool.query(sql); await pool.query(sql); } finally { await pool.end(); }
    const parties = await listParties(ctx);
    expect(parties).toHaveLength(3);
    expect(parties.find(p => p.id === linkedEvent.partyEventId)?.attendanceEventId).toBe(linkedEvent.id);
    expect(parties.find(p => p.id === unlinked.id)?.attendanceEventId).toEqual(expect.any(Number));
    expect(parties.some(p => p.attendanceEventId === standalone.id)).toBe(true);
    expect(await listCalendar(ctx)).toHaveLength(3);
  });
});
