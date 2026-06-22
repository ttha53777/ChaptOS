/**
 * Party member-attendance (Pass 2).
 *
 * Wrap-up can record member roll against a backing CalendarEvent created lazily.
 * Whether that roll counts toward the chapter-wide attendance % is governed by the
 * party's `mandatory` flag — lib/attendance.ts counts mandatory events only.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createPartyEvent } from "../setup/factories";
import { db } from "@/lib/db";
import { wrapUpParty, summarizePartyAttendance } from "@/lib/services/party-service";
import { recalcAllBrothersInSemester } from "@/lib/attendance";
import { ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId,
    actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0,
    isOrgAdmin: true, isPlatformAdmin: false,
    db: db(orgId),
  };
}

async function seed() {
  const org = await createOrg("Party Org", "party-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true, name: "Admin" });
  const b2 = await createBrother({ orgId: org.id, name: "Second" });
  const b3 = await createBrother({ orgId: org.id, name: "Third" });
  const sem = await createSemester({ orgId: org.id, isActive: true });
  return { org, admin, b2, b3, sem, ctx: ctxFor(org.id, admin.id) };
}

describe("wrapUpParty — money only", () => {
  it("completes without creating a backing event when no roll given", async () => {
    const { org, ctx } = await seed();
    const party = await createPartyEvent({ orgId: org.id });

    const out = await wrapUpParty(ctx, party.id, { doorRevenue: 500, expenses: 100, mandatory: false });

    expect(out.completed).toBe(true);
    expect(out.doorRevenue).toBe(500);
    const fresh = await testPrisma.partyEvent.findUnique({ where: { id: party.id } });
    expect(fresh?.attendanceEventId).toBeNull();
  });
});

describe("wrapUpParty — with roll", () => {
  it("creates a backing event and records present/absent", async () => {
    const { org, admin, b2, b3, ctx } = await seed();
    const party = await createPartyEvent({ orgId: org.id });

    await wrapUpParty(ctx, party.id, {
      doorRevenue: 800, expenses: 200, mandatory: true,
      attendedIds: [admin.id, b2.id], // b3 absent
    });

    const fresh = await testPrisma.partyEvent.findUnique({ where: { id: party.id } });
    expect(fresh?.attendanceEventId).not.toBeNull();

    const event = await testPrisma.calendarEvent.findUnique({ where: { id: fresh!.attendanceEventId! } });
    expect(event?.mandatory).toBe(true);
    expect(event?.category).toBe("party");

    const summary = await summarizePartyAttendance(ctx);
    const row = summary.find(r => r.partyId === party.id);
    expect(row).toBeDefined();
    expect(row!.eligible).toBe(3);
    expect(row!.present).toBe(2);
  });

  it("re-wrapping updates roll in place, does not create a second event", async () => {
    const { org, admin, b2, b3, ctx } = await seed();
    const party = await createPartyEvent({ orgId: org.id });

    await wrapUpParty(ctx, party.id, { doorRevenue: 1, expenses: 0, mandatory: false, attendedIds: [admin.id] });
    const first = await testPrisma.partyEvent.findUnique({ where: { id: party.id } });
    const firstEventId = first!.attendanceEventId;

    await wrapUpParty(ctx, party.id, { doorRevenue: 1, expenses: 0, mandatory: false, attendedIds: [admin.id, b2.id, b3.id] });
    const second = await testPrisma.partyEvent.findUnique({ where: { id: party.id } });

    expect(second!.attendanceEventId).toBe(firstEventId); // same event reused
    const events = await testPrisma.calendarEvent.findMany({ where: { organizationId: org.id, category: "party" } });
    expect(events).toHaveLength(1);

    const summary = await summarizePartyAttendance(ctx);
    expect(summary.find(r => r.partyId === party.id)!.present).toBe(3);
  });

  it("blocks roll when there is no active semester", async () => {
    const org = await createOrg("No Sem Org", "no-sem-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const ctx = ctxFor(org.id, admin.id);
    const party = await createPartyEvent({ orgId: org.id });

    await expect(
      wrapUpParty(ctx, party.id, { doorRevenue: 1, expenses: 0, mandatory: true, attendedIds: [admin.id] }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Party left untouched (not completed, no backing event).
    const fresh = await testPrisma.partyEvent.findUnique({ where: { id: party.id } });
    expect(fresh?.completed).toBe(false);
    expect(fresh?.attendanceEventId).toBeNull();
  });
});

describe("chapter attendance % counts mandatory party roll only", () => {
  it("mandatory party roll moves the %, non-mandatory does not", async () => {
    const { org, admin, sem, ctx } = await seed();

    // Mandatory party: admin present.
    const mand = await createPartyEvent({ orgId: org.id, name: "Mandatory Party" });
    await wrapUpParty(ctx, mand.id, { doorRevenue: 0, expenses: 0, mandatory: true, attendedIds: [admin.id] });
    await recalcAllBrothersInSemester(db(org.id), sem.id);
    let fresh = await testPrisma.brother.findUnique({ where: { id: admin.id }, select: { attendance: true } });
    expect(fresh?.attendance).toBe(100); // 1/1 mandatory present

    // Non-mandatory party: admin ABSENT. Should NOT drag the % down.
    const opt = await createPartyEvent({ orgId: org.id, name: "Optional Party" });
    await wrapUpParty(ctx, opt.id, { doorRevenue: 0, expenses: 0, mandatory: false, attendedIds: [] });
    await recalcAllBrothersInSemester(db(org.id), sem.id);
    fresh = await testPrisma.brother.findUnique({ where: { id: admin.id }, select: { attendance: true } });
    expect(fresh?.attendance).toBe(100); // optional roll excluded → still 100
  });
});
