/**
 * Tests for the active-semester boundary guard on dated items.
 *
 * Dated creations/updates (calendar events, deadlines, service events,
 * programming tasks) must fall within the org's active semester. With no active
 * semester, dated creation is blocked. The guard lives in
 * lib/services/semester-bounds.ts and is wired into each service.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createEventType, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { createCalendar, updateCalendar } from "@/lib/services/calendar-service";
import { createTask, updateTask } from "@/lib/services/task-service";
import { createServiceEvent } from "@/lib/services/service-event-service";
import { createProgrammingTask, updateProgrammingTask, setStage } from "@/lib/services/programming-service";
import { ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     0,
    maxRank:         0,
    isOrgAdmin:      true,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

const START = "2026-01-01";
const END = "2026-06-30";

/** Org + admin with an active Spring 2026 semester (Jan 1 – Jun 30). */
async function seedWithSemester() {
  const org = await createOrg("Bounds Org", "bounds-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  await createSemester({ orgId: org.id, startDate: START, endDate: END });
  // "program" is an org-owned custom type now, not a built-in.
  await createEventType({ orgId: org.id, slug: "program", label: "Program" });
  return { ctx: ctxFor(org.id, admin.id), org, admin };
}

/** Org + admin with NO semester at all. */
async function seedWithoutSemester() {
  const org = await createOrg("No-Sem Org", "no-sem-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  await createEventType({ orgId: org.id, slug: "program", label: "Program" });
  return { ctx: ctxFor(org.id, admin.id), org, admin };
}

/** Pull the code discriminator off a thrown ValidationError's details. */
function codeOf(err: unknown): string | undefined {
  if (err instanceof ValidationError) {
    return (err.details as { code?: string } | undefined)?.code;
  }
  return undefined;
}

describe("calendar events", () => {
  it("allows a date within the semester (inclusive of both bounds)", async () => {
    const { ctx } = await seedWithSemester();
    const base = { category: "chapter" as const, mandatory: true };
    await expect(createCalendar(ctx, { title: "Start", date: START, ...base })).resolves.toBeTruthy();
    await expect(createCalendar(ctx, { title: "End", date: END, ...base })).resolves.toBeTruthy();
    await expect(createCalendar(ctx, { title: "Mid", date: "2026-03-15", ...base })).resolves.toBeTruthy();
  });

  it("rejects a date one day before / after the semester", async () => {
    const { ctx } = await seedWithSemester();
    const base = { category: "chapter" as const, mandatory: true };
    const before = createCalendar(ctx, { title: "Too early", date: "2025-12-31", ...base });
    const after = createCalendar(ctx, { title: "Too late", date: "2026-07-01", ...base });
    await expect(before).rejects.toThrow(ValidationError);
    await expect(after).rejects.toThrow(ValidationError);
    await expect(before.catch(e => codeOf(e))).resolves.toBe("DATE_OUTSIDE_SEMESTER");
  });

  it("blocks creation with NO_ACTIVE_SEMESTER when none is active", async () => {
    const { ctx } = await seedWithoutSemester();
    const p = createCalendar(ctx, { title: "x", date: "2026-03-01", category: "chapter", mandatory: true });
    await expect(p.catch(e => codeOf(e))).resolves.toBe("NO_ACTIVE_SEMESTER");
  });

  it("allows editing a non-date field on a legacy out-of-range event", async () => {
    const { ctx, org } = await seedWithSemester();
    // Insert an out-of-range event directly (bypasses the create guard, like legacy data).
    const legacy = await testPrisma.calendarEvent.create({
      data: { organizationId: org.id, title: "Old", date: "2025-09-01", category: "chapter", mandatory: true },
    });
    await expect(updateCalendar(ctx, legacy.id, { title: "Renamed" })).resolves.toBeTruthy();
  });

  it("rejects moving an event's date out of range", async () => {
    const { ctx } = await seedWithSemester();
    const ev = await createCalendar(ctx, { title: "Move me", date: "2026-03-01", category: "chapter", mandatory: true });
    await expect(updateCalendar(ctx, ev.id, { date: "2026-08-01" })).rejects.toThrow(ValidationError);
  });
});

describe("tasks (deadlines)", () => {
  it("allows in-range and rejects out-of-range creation", async () => {
    const { ctx, admin } = await seedWithSemester();
    await expect(createTask(ctx, { title: "ok", dueDate: "2026-02-01", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] })).resolves.toBeTruthy();
    await expect(createTask(ctx, { title: "bad", dueDate: "2026-12-01", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] })).rejects.toThrow(ValidationError);
  });

  it("does not bound an undated task", async () => {
    const { ctx, admin } = await seedWithoutSemester();
    // No dueDate → semester bounds don't apply, so this succeeds even with no active semester.
    await expect(createTask(ctx, { title: "loose todo", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] })).resolves.toBeTruthy();
  });

  it("blocks dated creation when no semester is active", async () => {
    const { ctx, admin } = await seedWithoutSemester();
    const p = createTask(ctx, { title: "x", dueDate: "2026-02-01", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });
    await expect(p.catch(e => codeOf(e))).resolves.toBe("NO_ACTIVE_SEMESTER");
  });

  it("only re-checks the date when it changes on update", async () => {
    const { ctx, org, admin } = await seedWithSemester();
    const legacy = await testPrisma.task.create({
      data: { organizationId: org.id, title: "Old", dueDate: "2025-09-01", status: "open" },
    });
    // Editing the title (no dueDate in payload) must succeed despite out-of-range date.
    await expect(updateTask(ctx, legacy.id, { title: "New", assigneeBrotherIds: [admin.id] })).resolves.toBeTruthy();
    // Moving the date out of range must fail.
    await expect(updateTask(ctx, legacy.id, { dueDate: "2026-12-01" })).rejects.toThrow(ValidationError);
  });
});

describe("service events", () => {
  it("allows an in-range create", async () => {
    const { ctx } = await seedWithSemester();
    await expect(createServiceEvent(ctx, { title: "Cleanup", date: "2026-04-01" })).resolves.toBeTruthy();
  });

  it("writes neither row when the date is out of range", async () => {
    const { ctx } = await seedWithSemester();
    await expect(createServiceEvent(ctx, { title: "Cleanup", date: "2026-08-01" })).rejects.toThrow(ValidationError);
    expect(await testPrisma.serviceEvent.count()).toBe(0);
    expect(await testPrisma.calendarEvent.count()).toBe(0);
  });
});

describe("programming tasks", () => {
  it("blocks a dateless Idea when no semester is active", async () => {
    const { ctx } = await seedWithoutSemester();
    const p = createProgrammingTask(ctx, { title: "Idea", category: "program" });
    await expect(p.catch(e => codeOf(e))).resolves.toBe("NO_ACTIVE_SEMESTER");
  });

  it("allows a dateless Idea when a semester is active", async () => {
    const { ctx } = await seedWithSemester();
    const task = await createProgrammingTask(ctx, { title: "Idea", category: "program" });
    expect(task.stage).toBe("idea");
    expect(task.dueDate).toBeNull();
  });

  it("rejects an Idea created with an out-of-range dueDate", async () => {
    const { ctx } = await seedWithSemester();
    await expect(createProgrammingTask(ctx, { title: "Idea", category: "program", dueDate: "2026-09-01" })).rejects.toThrow(ValidationError);
  });

  it("rejects promotion when the date is out of range, leaving no CalendarEvent", async () => {
    const { ctx } = await seedWithSemester();
    // Seed a programming row directly with an out-of-range date (an Idea can be
    // created in range, but legacy/edge rows may carry an out-of-range date).
    const pe = await testPrisma.programmingEvent.create({
      data: { organizationId: ctx.orgId, title: "Late", date: "2026-09-01", category: "program", stage: "idea", status: "Upcoming", owner: "", collabOrg: "" },
    });
    await expect(setStage(ctx, pe.id, { stage: "planning" })).rejects.toThrow(ValidationError);
    expect(await testPrisma.calendarEvent.count()).toBe(0);
    const after = await testPrisma.programmingEvent.findUnique({ where: { id: pe.id } });
    expect(after?.stage).toBe("idea");
    expect(after?.calendarEventId).toBeNull();
  });

  it("allows clearing an Idea's date to null", async () => {
    const { ctx } = await seedWithSemester();
    const task = await createProgrammingTask(ctx, { title: "Idea", category: "program", dueDate: "2026-03-01" });
    const updated = await updateProgrammingTask(ctx, task.id, { dueDate: null });
    expect(updated.dueDate).toBeNull();
  });
});
