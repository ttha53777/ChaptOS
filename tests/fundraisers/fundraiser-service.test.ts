/**
 * Simple fundraisers: the fundraiser mirrors a "fundraising" CalendarEvent (its
 * name/date/time/place live there), keeps a shopping list in cents, and wraps up
 * with one total. Nothing touches Treasury.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import {
  addSupply, createFundraiser, deleteFundraiser, getFundraiser, listFundraisers, removeSupply,
  reopenFundraiser, updateFundraiser, updateSupply, wrapUpFundraiser,
} from "@/lib/services/fundraiser-service";
import { deleteCalendar } from "@/lib/services/calendar-service";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId,
    actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0,
    isOrgAdmin: true, isPlatformAdmin: false,
    db: db(orgId),
    ...over,
  };
}

async function seed() {
  const org = await createOrg("Fund Org", "fund-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true, name: "Admin" });
  await createSemester({ orgId: org.id, isActive: true });
  return { org, admin, ctx: ctxFor(org.id, admin.id) };
}

describe("createFundraiser", () => {
  it("mirrors a fundraiser calendar event and guesses the kind from the name", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Halloween bake sale", date: "2026-05-02", place: "Student Union", goal: 250 });
    expect(f).toMatchObject({ name: "Halloween bake sale", date: "2026-05-02", place: "Student Union", kind: "bake", goal: 250, spent: 0, cameIn: null, made: null, wrappedAt: null, startTime: null });
    const ev = await testPrisma.calendarEvent.findUnique({ where: { id: f.calendarEventId } });
    expect(ev).toMatchObject({ category: "fundraising", title: "Halloween bake sale", location: "Student Union", mandatory: false });
  });

  it("a start time makes the event timed in the given zone", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Car wash", date: "2026-05-02", startTime: "10:00", endTime: "14:00", timeZone: "America/New_York" });
    expect(f.startTime).toBe("10:00");
    expect(f.endTime).toBe("14:00");
    expect(f.kind).toBe("wash");
  });

  it("refuses a date outside the active semester and writes nothing", async () => {
    const { ctx } = await seed();
    await expect(createFundraiser(ctx, { name: "Too late", date: "2026-09-01" })).rejects.toBeInstanceOf(ValidationError);
    expect(await testPrisma.calendarEvent.count()).toBe(0);
  });
});

describe("shopping list + wrap-up", () => {
  it("totals the list, wraps up, and reopens", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Cookie sale", date: "2026-05-02" });
    await addSupply(ctx, f.id, { name: "Cookie dough", cost: 32 });
    let next = await addSupply(ctx, f.id, { name: "Bags & ribbon", cost: 10.5 });
    expect(next.spent).toBe(42.5);
    next = await updateSupply(ctx, f.id, next.supplies[1].id, { cost: 10 });
    expect(next.spent).toBe(42);

    const wrapped = await wrapUpFundraiser(ctx, f.id, { cameIn: 229 });
    expect(wrapped).toMatchObject({ cameIn: 229, spent: 42, made: 187 });
    expect(wrapped.wrappedAt).not.toBeNull();

    // Locked once wrapped.
    await expect(addSupply(ctx, f.id, { name: "Napkins", cost: 4 })).rejects.toBeInstanceOf(ConflictError);
    await expect(wrapUpFundraiser(ctx, f.id, { cameIn: 1 })).rejects.toBeInstanceOf(ConflictError);

    const reopened = await reopenFundraiser(ctx, f.id);
    expect(reopened).toMatchObject({ cameIn: null, made: null, wrappedAt: null });
    const after = await removeSupply(ctx, f.id, reopened.supplies[0].id);
    expect(after.supplies.map(s => s.name)).toEqual(["Bags & ribbon"]);
  });

  it("a short sale reads negative", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Raffle", date: "2026-05-02" });
    await addSupply(ctx, f.id, { name: "Prize", cost: 57 });
    const w = await wrapUpFundraiser(ctx, f.id, { cameIn: 43 });
    expect(w.made).toBe(-14);
  });

  it("never writes a Treasury transaction", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Boba sale", date: "2026-05-02" });
    await addSupply(ctx, f.id, { name: "Tea", cost: 16 });
    await wrapUpFundraiser(ctx, f.id, { cameIn: 300 });
    expect(await testPrisma.transaction.count()).toBe(0);
  });
});

describe("editing and deleting", () => {
  it("edits land on the calendar event", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Bake sale", date: "2026-05-02" });
    const u = await updateFundraiser(ctx, f.id, { name: "Spring bake sale", date: "2026-05-09", place: "Quad", goal: null });
    expect(u).toMatchObject({ name: "Spring bake sale", date: "2026-05-09", place: "Quad", goal: null });
    const ev = await testPrisma.calendarEvent.findUnique({ where: { id: f.calendarEventId } });
    expect(ev).toMatchObject({ title: "Spring bake sale", date: "2026-05-09", location: "Quad" });
  });

  it("deleteFundraiser removes the event, the fundraiser and its list", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Bake sale", date: "2026-05-02" });
    await addSupply(ctx, f.id, { name: "Flour", cost: 18 });
    await deleteFundraiser(ctx, f.id);
    expect(await testPrisma.calendarEvent.count()).toBe(0);
    expect(await testPrisma.fundraiser.count()).toBe(0);
    expect(await testPrisma.fundraiserSupply.count()).toBe(0);
  });

  it("deleting the event from the Timeline takes the fundraiser with it", async () => {
    const { ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Bake sale", date: "2026-05-02" });
    await deleteCalendar(ctx, f.calendarEventId);
    expect(await testPrisma.fundraiser.count()).toBe(0);
    expect(await listFundraisers(ctx)).toEqual([]);
  });

  it("the Timeline delete needs MANAGE_FUNDRAISING", async () => {
    const { org, ctx } = await seed();
    const f = await createFundraiser(ctx, { name: "Bake sale", date: "2026-05-02" });
    const officer = await createBrother({ orgId: org.id, name: "Events chair" });
    const eventsOnly = ctxFor(org.id, officer.id, { isOrgAdmin: false, permissions: 1 << 2 });
    await expect(deleteCalendar(eventsOnly, f.calendarEventId)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getFundraiser(ctx, f.id)).id).toBe(f.id);
  });
});
