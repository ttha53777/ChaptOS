/**
 * listMyExcuses is readable by any member, so its only guard is that it pins
 * the read to ctx.actorId (and the org via ctx.db). These pin that down.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent } from "../setup/factories";
import { db } from "@/lib/db";
import { listMyExcuses } from "@/lib/services/excuse-service";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId,
    actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0,
    isOrgAdmin: false, isPlatformAdmin: false,
    db: db(orgId),
  };
}

describe("listMyExcuses", () => {
  it("returns only the caller's excuses, with the decision and rejection note", async () => {
    const org = await createOrg("Exc Org", "exc-org");
    const me = await createBrother({ orgId: org.id, name: "Me" });
    const other = await createBrother({ orgId: org.id, name: "Other" });
    const semester = await createSemester({ orgId: org.id, isActive: true });
    const ev1 = await createCalendarEvent({ orgId: org.id, title: "Chapter meeting", mandatory: true });
    const ev2 = await createCalendarEvent({ orgId: org.id, title: "Retreat", mandatory: true });
    const decidedAt = new Date();
    await testPrisma.attendanceExcuse.createMany({ data: [
      { calendarEventId: ev1.id, brotherId: me.id, semesterId: semester.id, reason: "Lab", status: "rejected", decidedAt, rejectionNote: "Labs end at 6" },
      { calendarEventId: ev2.id, brotherId: me.id, semesterId: semester.id, reason: "Sick", status: "pending" },
      { calendarEventId: ev1.id, brotherId: other.id, semesterId: semester.id, reason: "Not mine", status: "rejected", rejectionNote: "secret" },
    ] });

    const mine = await listMyExcuses(ctxFor(org.id, me.id));

    expect(mine).toHaveLength(2);
    expect(mine.every(e => e.reason !== "Not mine")).toBe(true);
    const rejected = mine.find(e => e.calendarEventId === ev1.id)!;
    expect(rejected).toMatchObject({ status: "rejected", rejectionNote: "Labs end at 6", eventTitle: "Chapter meeting" });
    expect(rejected.decidedAt).toBe(decidedAt.toISOString());
  });

  it("does not leak the caller's excuses from another org", async () => {
    const orgA = await createOrg("A", "org-a");
    const orgB = await createOrg("B", "org-b");
    const me = await createBrother({ orgId: orgA.id, name: "Me" });
    await testPrisma.membership.create({ data: { brotherId: me.id, organizationId: orgB.id } });
    const semA = await createSemester({ orgId: orgA.id, isActive: true });
    await createSemester({ orgId: orgB.id, isActive: true });
    const evA = await createCalendarEvent({ orgId: orgA.id, mandatory: true });
    await testPrisma.attendanceExcuse.create({ data: { calendarEventId: evA.id, brotherId: me.id, semesterId: semA.id, reason: "A only", status: "rejected" } });

    expect(await listMyExcuses(ctxFor(orgB.id, me.id))).toEqual([]);
    expect(await listMyExcuses(ctxFor(orgA.id, me.id))).toHaveLength(1);
  });

  it("returns nothing without an active semester", async () => {
    const org = await createOrg("Exc Org", "exc-org");
    const me = await createBrother({ orgId: org.id, name: "Me" });
    expect(await listMyExcuses(ctxFor(org.id, me.id))).toEqual([]);
  });
});
