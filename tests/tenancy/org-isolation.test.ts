/**
 * Tenancy isolation tests.
 *
 * For each domain table: seed rows in two different orgs, query through
 * db(orgA), confirm orgB rows are not returned. The single most important
 * test category — the wrapper exists precisely to make this true.
 *
 * If this file ever goes red, every other test that relies on isolation is
 * suspect. Treat regressions here as P0.
 *
 * Coverage: all 13 org-scoped models in lib/db/tenant.ts.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, resetDb } from "../setup/prisma";
import {
  createOrg, createBrother, createSemester, createCalendarEvent, createTransaction,
  createServiceEvent, createServiceParticipation, createPartyEvent, createTask, createInstagramTask,
  createDoc, createBudget, createActivityLog, createAnnouncement,
} from "../setup/factories";
import { db } from "@/lib/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Brother
// ---------------------------------------------------------------------------
describe("tenancy: Brother", () => {
  it("findMany only returns the active org's rows", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id, name: "A1" });
    await createBrother({ orgId: orgA.id, name: "A2" });
    await createBrother({ orgId: orgB.id, name: "B1" });

    const fromA = await db(orgA.id).brother.findMany();
    const fromB = await db(orgB.id).brother.findMany();

    expect(fromA.map(b => b.name).sort()).toEqual(["A1", "A2"]);
    expect(fromB.map(b => b.name)).toEqual(["B1"]);
  });

  it("create injects organizationId automatically", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const created = await db(orgA.id).brother.create({
      data: { name: "Injected", role: "Brother", attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0 },
    });
    expect(created.organizationId).toBe(orgA.id);
  });

  it("count is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id });
    await createBrother({ orgId: orgB.id });
    await createBrother({ orgId: orgB.id });
    expect(await db(orgA.id).brother.count()).toBe(1);
    expect(await db(orgB.id).brother.count()).toBe(2);
  });

  it("findFirst with cross-org id returns null", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const b = await createBrother({ orgId: orgB.id, name: "Across-org" });
    const leak = await db(orgA.id).brother.findFirst({ where: { id: b.id } });
    expect(leak).toBeNull();
  });

  it("updateMany only updates rows in the active org", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id });
    await createBrother({ orgId: orgB.id });
    await db(orgA.id).brother.updateMany({ where: {}, data: { duesOwed: 99 } });
    const bBrothers = await db(orgB.id).brother.findMany();
    expect(bBrothers.every(b => b.duesOwed === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------
describe("tenancy: Role", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await db(orgA.id).role.create({ data: { name: "President", rank: 100, permissions: 0, isSystem: true } });
    await db(orgB.id).role.create({ data: { name: "President", rank: 100, permissions: 0, isSystem: true } });
    expect(await db(orgA.id).role.count()).toBe(1);
    expect(await db(orgB.id).role.count()).toBe(1);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const r = await db(org.id).role.create({ data: { name: "VP", rank: 50, permissions: 0 } });
    expect(r.organizationId).toBe(org.id);
  });
});

// ---------------------------------------------------------------------------
// Semester
// ---------------------------------------------------------------------------
describe("tenancy: Semester", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createSemester({ orgId: orgA.id, label: "SPR26" });
    await createSemester({ orgId: orgB.id, label: "SPR26" });
    const fromA = await db(orgA.id).semester.findMany();
    expect(fromA.every(s => s.organizationId === orgA.id)).toBe(true);
    expect(fromA).toHaveLength(1);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const s = await db(org.id).semester.create({
      data: { label: "FA26", startDate: "2026-08-01", endDate: "2026-12-15" },
    });
    expect(s.organizationId).toBe(org.id);
  });
});

// ---------------------------------------------------------------------------
// CalendarEvent
// ---------------------------------------------------------------------------
describe("tenancy: CalendarEvent", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createCalendarEvent({ orgId: orgA.id, title: "A meeting" });
    await createCalendarEvent({ orgId: orgB.id, title: "B meeting" });
    const fromA = await db(orgA.id).calendarEvent.findMany();
    expect(fromA.map(e => e.title)).toEqual(["A meeting"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const e = await db(org.id).calendarEvent.create({
      data: { title: "Injected", date: "2026-05-01", category: "chapter", mandatory: false },
    });
    expect(e.organizationId).toBe(org.id);
  });
});

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------
describe("tenancy: Transaction", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createTransaction({ orgId: orgA.id, description: "A tx" });
    await createTransaction({ orgId: orgB.id, description: "B tx" });
    const fromA = await db(orgA.id).transaction.findMany();
    expect(fromA.map(t => t.description)).toEqual(["A tx"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const t = await db(org.id).transaction.create({
      data: { type: "income", category: "Dues", amount: 50, amountCents: BigInt(5000), date: "2026-05-01", description: "test" },
    });
    expect(t.organizationId).toBe(org.id);
  });
});

// ---------------------------------------------------------------------------
// ServiceEvent
// ---------------------------------------------------------------------------
describe("tenancy: ServiceEvent", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createServiceEvent({ orgId: orgA.id, title: "A service" });
    await createServiceEvent({ orgId: orgB.id, title: "B service" });
    const fromA = await db(orgA.id).serviceEvent.findMany();
    expect(fromA.map(e => e.title)).toEqual(["A service"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const e = await db(org.id).serviceEvent.create({
      data: { title: "Injected Service", date: "2026-05-01", location: "Park" },
    });
    expect(e.organizationId).toBe(org.id);
  });

  it("count is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createServiceEvent({ orgId: orgA.id });
    await createServiceEvent({ orgId: orgB.id });
    await createServiceEvent({ orgId: orgB.id });
    expect(await db(orgA.id).serviceEvent.count()).toBe(1);
    expect(await db(orgB.id).serviceEvent.count()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ServiceParticipation
// ---------------------------------------------------------------------------
describe("tenancy: ServiceParticipation", () => {
  it("findMany only returns the active org's rows", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const evA = await createServiceEvent({ orgId: orgA.id });
    const evB = await createServiceEvent({ orgId: orgB.id });
    const bA = await createBrother({ orgId: orgA.id });
    const bB = await createBrother({ orgId: orgB.id });
    await createServiceParticipation({ orgId: orgA.id, serviceEventId: evA.id, brotherId: bA.id, hours: 3 });
    await createServiceParticipation({ orgId: orgB.id, serviceEventId: evB.id, brotherId: bB.id, hours: 5 });

    const fromA = await db(orgA.id).serviceParticipation.findMany();
    const fromB = await db(orgB.id).serviceParticipation.findMany();
    expect(fromA.map(p => p.hours)).toEqual([3]);
    expect(fromB.map(p => p.hours)).toEqual([5]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const ev = await createServiceEvent({ orgId: org.id });
    const b = await createBrother({ orgId: org.id });
    const p = await db(org.id).serviceParticipation.create({
      data: { serviceEventId: ev.id, brotherId: b.id, hours: 4 },
    });
    expect(p.organizationId).toBe(org.id);
  });

  it("findFirst with a cross-org id returns null", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const evB = await createServiceEvent({ orgId: orgB.id });
    const bB = await createBrother({ orgId: orgB.id });
    const pB = await createServiceParticipation({ orgId: orgB.id, serviceEventId: evB.id, brotherId: bB.id, hours: 5 });
    const leak = await db(orgA.id).serviceParticipation.findFirst({ where: { id: pB.id } });
    expect(leak).toBeNull();
  });

  it("deleteMany only affects the active org", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const evA = await createServiceEvent({ orgId: orgA.id });
    const evB = await createServiceEvent({ orgId: orgB.id });
    const bA = await createBrother({ orgId: orgA.id });
    const bB = await createBrother({ orgId: orgB.id });
    await createServiceParticipation({ orgId: orgA.id, serviceEventId: evA.id, brotherId: bA.id, hours: 3 });
    await createServiceParticipation({ orgId: orgB.id, serviceEventId: evB.id, brotherId: bB.id, hours: 5 });

    await db(orgA.id).serviceParticipation.deleteMany();
    expect(await db(orgA.id).serviceParticipation.count()).toBe(0);
    expect(await db(orgB.id).serviceParticipation.count()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PartyEvent
// ---------------------------------------------------------------------------
describe("tenancy: PartyEvent", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createPartyEvent({ orgId: orgA.id, name: "Alpha Party" });
    await createPartyEvent({ orgId: orgB.id, name: "Beta Party" });
    const fromA = await db(orgA.id).partyEvent.findMany();
    expect(fromA.map(p => p.name)).toEqual(["Alpha Party"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const p = await db(org.id).partyEvent.create({
      data: { name: "Injected Party", date: "2026-06-01", partyType: "Open" },
    });
    expect(p.organizationId).toBe(org.id);
  });
});

// ---------------------------------------------------------------------------
// Deadline
// ---------------------------------------------------------------------------
describe("tenancy: Task", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createTask({ orgId: orgA.id, title: "A task" });
    await createTask({ orgId: orgB.id, title: "B task" });
    const fromA = await db(orgA.id).task.findMany();
    expect(fromA.map(d => d.title)).toEqual(["A task"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const d = await db(org.id).task.create({
      data: { title: "Injected", dueDate: "2026-07-01", status: "open" },
    });
    expect(d.organizationId).toBe(org.id);
  });

  it("taskAssignment findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const brotherA = await createBrother({ orgId: orgA.id, name: "A1" });
    await createTask({ orgId: orgA.id, title: "A task", assigneeBrotherId: brotherA.id });
    expect(await db(orgA.id).taskAssignment.findMany()).toHaveLength(1);
    expect(await db(orgB.id).taskAssignment.findMany()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// InstagramTask
// ---------------------------------------------------------------------------
describe("tenancy: InstagramTask", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createInstagramTask({ orgId: orgA.id, title: "A task" });
    await createInstagramTask({ orgId: orgB.id, title: "B task" });
    const fromA = await db(orgA.id).instagramTask.findMany();
    expect(fromA.map(t => t.title)).toEqual(["A task"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const t = await db(org.id).instagramTask.create({
      data: { title: "Injected IG", dueDate: "2026-06-01", status: "Upcoming", type: "Story" },
    });
    expect(t.organizationId).toBe(org.id);
  });
});

// ---------------------------------------------------------------------------
// Doc
// ---------------------------------------------------------------------------
describe("tenancy: Doc", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createDoc({ orgId: orgA.id, title: "A doc" });
    await createDoc({ orgId: orgB.id, title: "B doc" });
    const fromA = await db(orgA.id).doc.findMany();
    expect(fromA.map(d => d.title)).toEqual(["A doc"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const d = await db(org.id).doc.create({
      data: { title: "Injected Doc", url: "https://example.com" },
    });
    expect(d.organizationId).toBe(org.id);
  });

  it("event-scoped docs are org-isolated", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const eventA = await createCalendarEvent({ orgId: orgA.id, title: "Event A", category: "program", mandatory: false });
    const eventB = await createCalendarEvent({ orgId: orgB.id, title: "Event B", category: "program", mandatory: false });

    const programmingA = await testPrisma.programmingEvent.create({
      data: { organizationId: orgA.id, calendarEventId: eventA.id, title: "Event A", category: "program", stage: "confirmed" },
    });
    const programmingB = await testPrisma.programmingEvent.create({
      data: { organizationId: orgB.id, calendarEventId: eventB.id, title: "Event B", category: "program", stage: "confirmed" },
    });

    const docA = await testPrisma.doc.create({
      data: {
        organizationId:  orgA.id,
        title:           "A attachment",
        url:             "https://example.com/a",
      },
    });
    const docB = await testPrisma.doc.create({
      data: {
        organizationId:  orgB.id,
        title:           "B attachment",
        url:             "https://example.com/b",
      },
    });
    await testPrisma.programmingEventDoc.create({
      data: { organizationId: orgA.id, programmingEventId: programmingA.id, docId: docA.id },
    });
    await testPrisma.programmingEventDoc.create({
      data: { organizationId: orgB.id, programmingEventId: programmingB.id, docId: docB.id },
    });

    const fromA = await db(orgA.id).programmingEventDoc.findMany({
      where: { programmingEventId: programmingA.id },
      include: { doc: true },
    }) as unknown as { doc: { title: string } }[];
    expect(fromA.map(link => link.doc.title)).toEqual(["A attachment"]);
  });
});

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------
describe("tenancy: Budget", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBudget({ orgId: orgA.id, semester: "SPR26" });
    await createBudget({ orgId: orgB.id, semester: "SPR26" });
    const fromA = await db(orgA.id).budget.findMany();
    expect(fromA.every(b => b.organizationId === orgA.id)).toBe(true);
    expect(fromA).toHaveLength(1);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const b = await db(org.id).budget.create({
      data: { semester: "FA26", carryoverBalance: 0, carryoverBalanceCents: BigInt(0), reserveAmount: 0, reserveAmountCents: BigInt(0) },
    });
    expect(b.organizationId).toBe(org.id);
  });

  it("findUniqueWithAllocations is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBudget({ orgId: orgA.id, semester: "SPR26" });
    await createBudget({ orgId: orgB.id, semester: "SPR26" });
    const fromA = await db(orgA.id).budget.findUniqueWithAllocations("SPR26");
    expect(fromA?.organizationId).toBe(orgA.id);
    // orgB's budget for the same semester must not be returned
    const fromB = await db(orgA.id).budget.findUniqueWithAllocations("SPR26");
    expect(fromB?.organizationId).not.toBe(orgB.id);
  });
});

// ---------------------------------------------------------------------------
// ActivityLog
// ---------------------------------------------------------------------------
describe("tenancy: ActivityLog", () => {
  it("findMany is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createActivityLog({ orgId: orgA.id, message: "A log" });
    await createActivityLog({ orgId: orgB.id, message: "B log" });
    const fromA = await db(orgA.id).activityLog.findMany();
    expect(fromA.map(l => l.message)).toEqual(["A log"]);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const l = await db(org.id).activityLog.create({
      data: { type: "info", message: "Injected log" },
    });
    expect(l.organizationId).toBe(org.id);
  });

  it("count is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createActivityLog({ orgId: orgA.id });
    await createActivityLog({ orgId: orgB.id });
    await createActivityLog({ orgId: orgB.id });
    expect(await db(orgA.id).activityLog.count()).toBe(1);
    expect(await db(orgB.id).activityLog.count()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ChapterAnnouncement
// ---------------------------------------------------------------------------
describe("tenancy: ChapterAnnouncement", () => {
  it("findFirst is org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createAnnouncement({ orgId: orgA.id, title: "Alpha News" });
    await createAnnouncement({ orgId: orgB.id, title: "Beta News" });
    const fromA = await db(orgA.id).chapterAnnouncement.findFirst({ where: {} });
    expect(fromA?.title).toBe("Alpha News");
    expect(fromA?.organizationId).toBe(orgA.id);
  });

  it("create injects organizationId", async () => {
    const org = await createOrg("Alpha", "alpha");
    const a = await db(org.id).chapterAnnouncement.create({
      data: { title: "Injected", body: "Body" },
    });
    expect(a.organizationId).toBe(org.id);
  });

  it("upsert updates existing row for same org", async () => {
    const org = await createOrg("Alpha", "alpha");
    await createAnnouncement({ orgId: org.id, title: "Old Title" });
    await db(org.id).chapterAnnouncement.upsert({
      where:  { organizationId: org.id },
      create: { organizationId: org.id, title: "New Title", body: "New" },
      update: { title: "New Title" },
    });
    const rows = await db(org.id).chapterAnnouncement.findFirst({ where: {} });
    expect(rows?.title).toBe("New Title");
    const total = await testPrisma.chapterAnnouncement.count({ where: { organizationId: org.id } });
    expect(total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Org-column-less join tables (F2 hardening): no organizationId column, scoped
// through a required relation to an org-bound parent. These were raw
// pass-throughs before — a bare id/brotherId WHERE used to leak cross-org rows.
// ---------------------------------------------------------------------------
describe("tenancy: AttendanceRecord (relation-scoped via CalendarEvent)", () => {
  it("findMany never returns another org's records", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const semA = await createSemester({ orgId: orgA.id });
    const semB = await createSemester({ orgId: orgB.id });
    const evtA = await createCalendarEvent({ orgId: orgA.id });
    const evtB = await createCalendarEvent({ orgId: orgB.id });
    const broA = await createBrother({ orgId: orgA.id });
    const broB = await createBrother({ orgId: orgB.id });
    await testPrisma.attendanceRecord.create({ data: { calendarEventId: evtA.id, brotherId: broA.id, semesterId: semA.id, attended: true } });
    await testPrisma.attendanceRecord.create({ data: { calendarEventId: evtB.id, brotherId: broB.id, semesterId: semB.id, attended: true } });

    // Cross-org read attempt: orgA asks for orgB's event id (the F3 IDOR shape).
    const leak = await db(orgA.id).attendanceRecord.findMany({ where: { calendarEventId: evtB.id } });
    expect(leak).toEqual([]);

    const own = await db(orgA.id).attendanceRecord.findMany({ where: { calendarEventId: evtA.id } });
    expect(own).toHaveLength(1);
  });

  it("findUnique by cross-org composite key returns null", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const semB = await createSemester({ orgId: orgB.id });
    const evtB = await createCalendarEvent({ orgId: orgB.id });
    const broB = await createBrother({ orgId: orgB.id });
    await testPrisma.attendanceRecord.create({ data: { calendarEventId: evtB.id, brotherId: broB.id, semesterId: semB.id, attended: true } });

    const leak = await db(orgA.id).attendanceRecord.findUnique({
      where: { calendarEventId_brotherId: { calendarEventId: evtB.id, brotherId: broB.id } },
    });
    expect(leak).toBeNull();
  });
});

describe("tenancy: AttendanceExcuse (relation-scoped via Brother)", () => {
  it("findMany and updateMany never touch another org's excuse", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const semB = await createSemester({ orgId: orgB.id });
    const evtB = await createCalendarEvent({ orgId: orgB.id });
    const broB = await createBrother({ orgId: orgB.id });
    const excuseB = await testPrisma.attendanceExcuse.create({
      data: { calendarEventId: evtB.id, brotherId: broB.id, semesterId: semB.id, reason: "B reason", status: "pending" },
    });

    // Cross-org read: orgA sees nothing.
    expect(await db(orgA.id).attendanceExcuse.findMany({ where: { id: excuseB.id } })).toEqual([]);
    expect(await db(orgA.id).attendanceExcuse.findUnique({ where: { id: excuseB.id } })).toBeNull();

    // Cross-org write (the decideExcuse IDOR): zero rows affected, B unchanged.
    const res = await db(orgA.id).attendanceExcuse.updateMany({
      where: { id: excuseB.id, status: "pending" },
      data:  { status: "approved" },
    });
    expect(res.count).toBe(0);
    const stillPending = await testPrisma.attendanceExcuse.findUnique({ where: { id: excuseB.id } });
    expect(stillPending?.status).toBe("pending");
  });
});

describe("tenancy: BudgetAllocation (relation-scoped via Budget)", () => {
  it("findMany never returns another org's allocations", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const budgetB = await createBudget({ orgId: orgB.id, semester: "SPR26" });
    await testPrisma.budgetAllocation.create({ data: { budgetId: budgetB.id, category: "Events", percent: 50 } });

    expect(await db(orgA.id).budgetAllocation.findMany({ where: { budgetId: budgetB.id } })).toEqual([]);
    expect(await db(orgA.id).budgetAllocation.count()).toBe(0);
    expect(await db(orgB.id).budgetAllocation.count()).toBe(1);
  });
});

describe("tenancy: InviteRedemption (relation-scoped via OrgInvite)", () => {
  it("findMany never returns another org's redemptions", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    const broB = await createBrother({ orgId: orgB.id });
    const inviteB = await testPrisma.orgInvite.create({
      data: { organizationId: orgB.id, token: "tok-beta", mode: "open", createdByBrotherId: broB.id },
    });
    await testPrisma.inviteRedemption.create({ data: { inviteId: inviteB.id, brotherId: broB.id } });

    expect(await db(orgA.id).inviteRedemption.findMany({ where: { inviteId: inviteB.id } })).toEqual([]);
    expect(await db(orgA.id).inviteRedemption.count()).toBe(0);
    expect(await db(orgB.id).inviteRedemption.count()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Membership (now org-scoped by organizationId injection)
// ---------------------------------------------------------------------------
describe("tenancy: Membership", () => {
  it("memberships seed correctly per org via createBrother factory", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id });
    await createBrother({ orgId: orgB.id });
    const aMembers = await testPrisma.membership.count({ where: { organizationId: orgA.id } });
    const bMembers = await testPrisma.membership.count({ where: { organizationId: orgB.id } });
    expect(aMembers).toBe(1);
    expect(bMembers).toBe(1);
  });

  it("isOrgAdmin is set correctly on membership", async () => {
    const org = await createOrg("Alpha", "alpha");
    const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
    const m = await testPrisma.membership.findUnique({
      where: { brotherId_organizationId: { brotherId: admin.id, organizationId: org.id } },
    });
    expect(m?.isOrgAdmin).toBe(true);
  });

  it("ctx.db.membership.count and findMany are org-scoped", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await createBrother({ orgId: orgA.id });
    await createBrother({ orgId: orgB.id });
    await createBrother({ orgId: orgB.id });
    expect(await db(orgA.id).membership.count()).toBe(1);
    expect(await db(orgB.id).membership.count()).toBe(2);
    const fromA = await db(orgA.id).membership.findMany();
    expect(fromA.every(m => m.organizationId === orgA.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Organization root (id-scoped: a request can only touch its own org row)
// ---------------------------------------------------------------------------
describe("tenancy: Organization (root, id-scoped)", () => {
  it("findUnique can never return a different org's row", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    // The wrapper forces where.id = the active org, so asking for orgB's id
    // through orgA's client resolves to orgA's own row — never orgB's. The point
    // is that orgB's data is unreachable, not the precise miss/hit semantics.
    const viaForeignId = await db(orgA.id).organization.findUnique({ where: { id: orgB.id } });
    expect(viaForeignId?.id).not.toBe(orgB.id);

    const own = await db(orgA.id).organization.findUnique({ where: { id: orgA.id } });
    expect(own?.id).toBe(orgA.id);
  });

  it("update only ever mutates the active org's row", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await db(orgA.id).organization.update({ where: { id: orgB.id }, data: { name: "Hijacked" } });
    const a = await testPrisma.organization.findUnique({ where: { id: orgA.id } });
    const b = await testPrisma.organization.findUnique({ where: { id: orgB.id } });
    expect(a?.name).toBe("Hijacked"); // the write landed on orgA, not orgB
    expect(b?.name).toBe("Beta");
  });
});

// ---------------------------------------------------------------------------
// OrganizationConfig (Milestone 1: org-type + config sibling)
// ---------------------------------------------------------------------------
describe("tenancy: OrganizationConfig", () => {
  it("config rows are 1:1 with the org and isolated by organizationId", async () => {
    const orgA = await createOrg("Alpha", "alpha");
    const orgB = await createOrg("Beta", "beta");
    await testPrisma.organizationConfig.create({
      data: { organizationId: orgA.id, enabledWorkflows: ["members", "events"] },
    });
    await testPrisma.organizationConfig.create({
      data: { organizationId: orgB.id, enabledWorkflows: ["finance"] },
    });

    const aCfg = await testPrisma.organizationConfig.findUnique({ where: { organizationId: orgA.id } });
    const bCfg = await testPrisma.organizationConfig.findUnique({ where: { organizationId: orgB.id } });

    expect(aCfg?.enabledWorkflows).toEqual(["members", "events"]);
    expect(bCfg?.enabledWorkflows).toEqual(["finance"]);
  });

  it("organizationId is unique — second config insert for same org fails", async () => {
    const org = await createOrg("Alpha", "alpha");
    await testPrisma.organizationConfig.create({
      data: { organizationId: org.id, enabledWorkflows: [] },
    });
    await expect(
      testPrisma.organizationConfig.create({
        data: { organizationId: org.id, enabledWorkflows: ["events"] },
      }),
    ).rejects.toThrow();
  });

  it("config cascades when the parent org is deleted", async () => {
    const org = await createOrg("Alpha", "alpha");
    await testPrisma.organizationConfig.create({
      data: { organizationId: org.id, enabledWorkflows: ["members"] },
    });
    await testPrisma.organization.delete({ where: { id: org.id } });
    const remaining = await testPrisma.organizationConfig.findMany({
      where: { organizationId: org.id },
    });
    expect(remaining).toEqual([]);
  });

  it("Organization.orgType persists when set on create", async () => {
    const org = await testPrisma.organization.create({
      data: { name: "Alpha", slug: "alpha", orgType: "fraternity" },
    });
    const read = await testPrisma.organization.findUnique({ where: { id: org.id } });
    expect(read?.orgType).toBe("fraternity");
  });
});
