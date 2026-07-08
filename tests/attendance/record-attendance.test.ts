/**
 * Regression coverage for attendance-service.recordAttendance.
 *
 * The roll upserts run inside the tenant `ctx.db.$transaction` wrapper, which
 * only accepts a CALLBACK (it SET LOCALs the org id) — passing an operation
 * array threw "fn is not a function" at runtime. This was previously untested.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester, createCalendarEvent } from "../setup/factories";
import { db } from "@/lib/db";
import { recordAttendance } from "@/lib/services/attendance-service";
import { NotFoundError, ValidationError } from "@/lib/errors";
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

describe("recordAttendance", () => {
  it("upserts a record for every eligible brother (present + absent)", async () => {
    const org = await createOrg("Att Org", "att-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true, name: "Admin" });
    const b2 = await createBrother({ orgId: org.id, name: "Second" });
    const b3 = await createBrother({ orgId: org.id, name: "Third" });
    await createSemester({ orgId: org.id, isActive: true });
    const event = await createCalendarEvent({ orgId: org.id, mandatory: true });
    const ctx = ctxFor(org.id, admin.id);

    await recordAttendance(ctx, { calendarEventId: event.id, attendedIds: [admin.id, b2.id] }); // b3 absent

    const records = await testPrisma.attendanceRecord.findMany({ where: { calendarEventId: event.id } });
    expect(records).toHaveLength(3);
    const present = new Set(records.filter(r => r.attended).map(r => r.brotherId));
    expect(present.has(admin.id)).toBe(true);
    expect(present.has(b2.id)).toBe(true);
    expect(present.has(b3.id)).toBe(false);
  });

  it("records a 60-member roll in one set-based write (no per-member loop)", async () => {
    // Regression for the P2024 timeout: the old per-member upsert loop blew the
    // 5s transaction budget at ~60 members. The set-based rewrite writes N rows
    // in two statements, so this must complete well under the timeout.
    const org = await createOrg("Big Org", "big-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true, name: "Admin" });
    const others = [];
    for (let i = 0; i < 59; i++) {
      others.push(await createBrother({ orgId: org.id, name: `Member ${i}` }));
    }
    await createSemester({ orgId: org.id, isActive: true });
    const event = await createCalendarEvent({ orgId: org.id, mandatory: true });
    const ctx = ctxFor(org.id, admin.id);

    const presentIds = [admin.id, ...others.slice(0, 40).map(b => b.id)]; // 41 present, 19 absent
    await recordAttendance(ctx, { calendarEventId: event.id, attendedIds: presentIds });

    const records = await testPrisma.attendanceRecord.findMany({ where: { calendarEventId: event.id } });
    expect(records).toHaveLength(60);
    expect(records.filter(r => r.attended)).toHaveLength(41);
  });

  it("excludes semester-exempt members from the eligible set", async () => {
    const org = await createOrg("Att Org", "att-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true, name: "Admin" });
    const away = await createBrother({ orgId: org.id, name: "Abroad" });
    const semester = await createSemester({ orgId: org.id, isActive: true });
    const event = await createCalendarEvent({ orgId: org.id, mandatory: true });
    await testPrisma.attendanceExemption.create({
      data: { organizationId: org.id, brotherId: away.id, semesterId: semester.id, reason: "abroad" },
    });
    const ctx = ctxFor(org.id, admin.id);

    await recordAttendance(ctx, { calendarEventId: event.id, attendedIds: [admin.id] });

    const records = await testPrisma.attendanceRecord.findMany({ where: { calendarEventId: event.id } });
    // Only the admin gets a row; the exempt member is not enrolled at all.
    expect(records).toHaveLength(1);
    expect(records[0].brotherId).toBe(admin.id);
  });

  it("is idempotent — re-recording updates in place", async () => {
    const org = await createOrg("Att Org", "att-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    await createSemester({ orgId: org.id, isActive: true });
    const event = await createCalendarEvent({ orgId: org.id, mandatory: true });
    const ctx = ctxFor(org.id, admin.id);

    await recordAttendance(ctx, { calendarEventId: event.id, attendedIds: [admin.id] });
    await recordAttendance(ctx, { calendarEventId: event.id, attendedIds: [] }); // now absent

    const records = await testPrisma.attendanceRecord.findMany({ where: { calendarEventId: event.id } });
    expect(records).toHaveLength(1);
    expect(records[0].attended).toBe(false);
  });

  it("rejects non-mandatory events", async () => {
    const org = await createOrg("Att Org", "att-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    await createSemester({ orgId: org.id, isActive: true });
    const event = await createCalendarEvent({ orgId: org.id, mandatory: false });
    const ctx = ctxFor(org.id, admin.id);

    await expect(
      recordAttendance(ctx, { calendarEventId: event.id, attendedIds: [admin.id] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws when there is no active semester", async () => {
    const org = await createOrg("Att Org", "att-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const event = await createCalendarEvent({ orgId: org.id, mandatory: true });
    const ctx = ctxFor(org.id, admin.id);

    await expect(
      recordAttendance(ctx, { calendarEventId: event.id, attendedIds: [admin.id] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError for a missing event", async () => {
    const org = await createOrg("Att Org", "att-org");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    await createSemester({ orgId: org.id, isActive: true });
    const ctx = ctxFor(org.id, admin.id);

    await expect(
      recordAttendance(ctx, { calendarEventId: 999999, attendedIds: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
