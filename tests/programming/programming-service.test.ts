/**
 * Tests for the programming service — CalendarEvent rows in program/social/fundy/service
 * categories, exposed as tasks via /api/programming.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent } from "../setup/factories";
import { db } from "@/lib/db";
import {
  createProgrammingTask,
  deleteProgrammingTask,
  listProgrammingTasks,
  updateProgrammingTask,
} from "@/lib/services/programming-service";
import { NotFoundError } from "@/lib/errors";
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

async function seedOrg() {
  const org = await createOrg("Prog Org", "prog-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  return { org, admin };
}

describe("listProgrammingTasks", () => {
  it("returns program, social, fundy, and service calendar events", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    await createCalendarEvent({ orgId: org.id, title: "Program Night", category: "program", mandatory: false });
    await createCalendarEvent({ orgId: org.id, title: "Mixer", category: "social", mandatory: false });
    await createCalendarEvent({ orgId: org.id, title: "Philanthropy", category: "fundy", mandatory: false });
    await createCalendarEvent({ orgId: org.id, title: "Park Cleanup", category: "service", mandatory: false });
    await createCalendarEvent({ orgId: org.id, title: "Chapter Mtg", category: "chapter" });
    await createCalendarEvent({ orgId: org.id, title: "Rager", category: "party", mandatory: false });

    const tasks = await listProgrammingTasks(ctx);
    expect(tasks).toHaveLength(4);
    expect(tasks.map(t => t.title).sort()).toEqual(["Mixer", "Park Cleanup", "Philanthropy", "Program Night"]);
    expect(tasks.find(t => t.title === "Park Cleanup")?.type).toBe("Community Service");
  });
});

describe("createProgrammingTask", () => {
  it("maps type label to category and persists location/time/status", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const task = await createProgrammingTask(ctx, {
      title:    "Speaker Series",
      dueDate:  "2026-09-15",
      location: "EMU Ballroom",
      time:     "7:00 PM",
      status:   "Upcoming",
      type:     "Program",
    });

    expect(task.type).toBe("Program");
    expect(task.location).toBe("EMU Ballroom");
    expect(task.time).toBe("7:00 PM");
    expect(task.status).toBe("Upcoming");

    const row = await testPrisma.calendarEvent.findUnique({ where: { id: task.id } });
    expect(row?.category).toBe("program");
    expect(row?.date).toBe("2026-09-15");
    expect(row?.location).toBe("EMU Ballroom");
    expect(row?.time).toBe("7:00 PM");
    expect(row?.status).toBe("Upcoming");
    expect(row?.mandatory).toBe(false);
  });

  it("creates a linked ServiceEvent for community service type", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const task = await createProgrammingTask(ctx, {
      title:    "Park Cleanup",
      dueDate:  "2026-09-18",
      location: "City Park",
      status:   "Upcoming",
      type:     "Community Service",
    });

    expect(task.type).toBe("Community Service");

    const row = await testPrisma.calendarEvent.findUnique({ where: { id: task.id } });
    expect(row?.category).toBe("service");

    const serviceRow = await testPrisma.serviceEvent.findUnique({ where: { calendarEventId: task.id } });
    expect(serviceRow?.title).toBe("Park Cleanup");
    expect(serviceRow?.location).toBe("City Park");
  });

  it("appends collab org to title when provided", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const task = await createProgrammingTask(ctx, {
      title:    "Brotherhood Social",
      collab:   "KDF",
      dueDate:  "2026-09-20",
      location: "Campus Center",
      status:   "Upcoming",
      type:     "Social",
    });

    expect(task.title).toBe("Brotherhood Social × (KDF)");

    const row = await testPrisma.calendarEvent.findUnique({ where: { id: task.id } });
    expect(row?.title).toBe("Brotherhood Social × (KDF)");
  });

  it("stores null time when omitted", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const task = await createProgrammingTask(ctx, {
      title:    "Tabling",
      dueDate:  "2026-10-01",
      location: "Student Union",
      status:   "Upcoming",
      type:     "Social",
    });

    expect(task.time).toBeNull();
    const row = await testPrisma.calendarEvent.findUnique({ where: { id: task.id } });
    expect(row?.time).toBeNull();
  });
});

describe("updateProgrammingTask / deleteProgrammingTask", () => {
  it("rejects non-programming calendar rows", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const chapter = await createCalendarEvent({ orgId: org.id, category: "chapter" });

    await expect(
      updateProgrammingTask(ctx, chapter.id, { status: "Complete" }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      deleteProgrammingTask(ctx, chapter.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("updates a programming event", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const created = await createProgrammingTask(ctx, {
      title:    "Tabling",
      dueDate:  "2026-10-01",
      location: "Main Quad",
      status:   "Upcoming",
      type:     "Social",
    });

    const updated = await updateProgrammingTask(ctx, created.id, {
      status:   "Complete",
      type:     "Fundraiser",
      location: "Parking Lot B",
      time:     "11:00 AM",
      collab:   "DSP",
    });

    expect(updated.status).toBe("Complete");
    expect(updated.type).toBe("Fundraiser");
    expect(updated.location).toBe("Parking Lot B");
    expect(updated.time).toBe("11:00 AM");
    expect(updated.title).toBe("Tabling × (DSP)");

    const row = await testPrisma.calendarEvent.findUnique({ where: { id: created.id } });
    expect(row?.category).toBe("fundy");
    expect(row?.status).toBe("Complete");
  });

  it("removes linked ServiceEvent when type changes away from community service", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const created = await createProgrammingTask(ctx, {
      title:    "Park Cleanup",
      dueDate:  "2026-09-18",
      location: "City Park",
      status:   "Upcoming",
      type:     "Community Service",
    });

    await updateProgrammingTask(ctx, created.id, { type: "Program" });

    const serviceRow = await testPrisma.serviceEvent.findUnique({ where: { calendarEventId: created.id } });
    expect(serviceRow).toBeNull();
  });

  it("deletes linked ServiceEvent when removing a community service event", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const created = await createProgrammingTask(ctx, {
      title:    "Park Cleanup",
      dueDate:  "2026-09-18",
      location: "City Park",
      status:   "Upcoming",
      type:     "Community Service",
    });

    await deleteProgrammingTask(ctx, created.id);

    expect(await testPrisma.calendarEvent.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await testPrisma.serviceEvent.findUnique({ where: { calendarEventId: created.id } })).toBeNull();
  });
});
