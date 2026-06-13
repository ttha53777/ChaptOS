/**
 * Tests for the programming service. ProgrammingEvent is the owning record;
 * a CalendarEvent exists only once an event is promoted out of the Idea stage.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent } from "../setup/factories";
import { db } from "@/lib/db";
import {
  addChecklistItem,
  createProgrammingTask,
  deleteChecklistItem,
  deleteProgrammingTask,
  listChecklist,
  listProgrammingTasks,
  setStage,
  updateChecklistItem,
  updateProgrammingTask,
} from "@/lib/services/programming-service";
import { programmingPrepScore } from "@/lib/programming";
import { NotFoundError, ValidationError } from "@/lib/errors";
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

/** Create + promote to confirmed (gives the event a CalendarEvent). */
async function createConfirmed(ctx: RequestContext, input: Parameters<typeof createProgrammingTask>[1]) {
  const task = await createProgrammingTask(ctx, input);
  return setStage(ctx, task.id, { stage: "confirmed" });
}

describe("createProgrammingTask", () => {
  it("starts in Idea with no CalendarEvent", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const task = await createProgrammingTask(ctx, { title: "Speaker Series", type: "Program" });

    expect(task.stage).toBe("idea");
    expect(task.type).toBe("Program");
    expect(task.dueDate).toBeNull();

    const pe = await testPrisma.programmingEvent.findUnique({ where: { id: task.id } });
    expect(pe?.calendarEventId).toBeNull();
    expect(pe?.category).toBe("program");
    expect(await testPrisma.calendarEvent.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("stores collab in collabOrg with a clean title", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const task = await createProgrammingTask(ctx, { title: "Brotherhood Social", collab: "KDF", type: "Social" });
    expect(task.title).toBe("Brotherhood Social");
    expect(task.collab).toBe("KDF");

    const pe = await testPrisma.programmingEvent.findUnique({ where: { id: task.id } });
    expect(pe?.collabOrg).toBe("KDF");
  });
});

describe("listProgrammingTasks", () => {
  it("returns program, social, fundy, and service programming events", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    await createProgrammingTask(ctx, { title: "Program Night", type: "Program" });
    await createProgrammingTask(ctx, { title: "Mixer", type: "Social" });
    await createProgrammingTask(ctx, { title: "Philanthropy", type: "Fundraiser" });
    await createProgrammingTask(ctx, { title: "Park Cleanup", type: "Community Service" });
    // A non-programming calendar row should not surface as a task.
    await createCalendarEvent({ orgId: org.id, title: "Chapter Mtg", category: "chapter" });

    const tasks = await listProgrammingTasks(ctx);
    expect(tasks).toHaveLength(4);
    expect(tasks.map(t => t.title).sort()).toEqual(["Mixer", "Park Cleanup", "Philanthropy", "Program Night"]);
    expect(tasks.find(t => t.title === "Park Cleanup")?.type).toBe("Community Service");
  });
});

describe("setStage", () => {
  it("requires a date to promote out of Idea", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Undated", type: "Program" });

    await expect(setStage(ctx, task.id, { stage: "planning" })).rejects.toThrow(ValidationError);
  });

  it("promotes to Planning+ by creating a CalendarEvent", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, {
      title: "Speaker Series", dueDate: "2026-09-15", location: "EMU", time: "7:00 PM", type: "Program",
    });

    const promoted = await setStage(ctx, task.id, { stage: "planning" });
    expect(promoted.stage).toBe("planning");

    const pe = await testPrisma.programmingEvent.findUnique({ where: { id: task.id } });
    expect(pe?.calendarEventId).not.toBeNull();
    const ce = await testPrisma.calendarEvent.findUnique({ where: { id: pe!.calendarEventId! } });
    expect(ce?.title).toBe("Speaker Series");
    expect(ce?.date).toBe("2026-09-15");
    expect(ce?.category).toBe("program");
  });

  it("creates a ServiceEvent when a service event is promoted", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, {
      title: "Park Cleanup", dueDate: "2026-09-18", location: "City Park", type: "Community Service",
    });

    const promoted = await setStage(ctx, task.id, { stage: "confirmed" });
    const pe = await testPrisma.programmingEvent.findUnique({ where: { id: promoted.id } });
    const svc = await testPrisma.serviceEvent.findUnique({ where: { calendarEventId: pe!.calendarEventId! } });
    expect(svc?.title).toBe("Park Cleanup");
    expect(svc?.location).toBe("City Park");
  });

  it("demotes to Idea by deleting the CalendarEvent (and ServiceEvent), keeping the event", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const confirmed = await createConfirmed(ctx, {
      title: "Park Cleanup", dueDate: "2026-09-18", location: "City Park", type: "Community Service",
    });
    const calId = (await testPrisma.programmingEvent.findUnique({ where: { id: confirmed.id } }))!.calendarEventId!;

    const demoted = await setStage(ctx, confirmed.id, { stage: "idea" });
    expect(demoted.stage).toBe("idea");

    const pe = await testPrisma.programmingEvent.findUnique({ where: { id: confirmed.id } });
    expect(pe).not.toBeNull();                 // event preserved
    expect(pe?.calendarEventId).toBeNull();    // link removed
    expect(await testPrisma.calendarEvent.findUnique({ where: { id: calId } })).toBeNull();
    expect(await testPrisma.serviceEvent.findUnique({ where: { calendarEventId: calId } })).toBeNull();
  });

  it("re-promoting after demotion recreates a CalendarEvent", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const confirmed = await createConfirmed(ctx, { title: "Mixer", dueDate: "2026-09-01", type: "Social" });
    await setStage(ctx, confirmed.id, { stage: "idea" });

    const re = await setStage(ctx, confirmed.id, { stage: "confirmed" });
    expect(re.stage).toBe("confirmed");
    const pe = await testPrisma.programmingEvent.findUnique({ where: { id: confirmed.id } });
    expect(pe?.calendarEventId).not.toBeNull();
  });
});

describe("updateProgrammingTask / deleteProgrammingTask", () => {
  it("rejects unknown programming events", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    await expect(updateProgrammingTask(ctx, 999999, { status: "Complete" })).rejects.toThrow(NotFoundError);
    await expect(deleteProgrammingTask(ctx, 999999)).rejects.toThrow(NotFoundError);
  });

  it("updates fields and mirrors to the CalendarEvent once promoted", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const confirmed = await createConfirmed(ctx, {
      title: "Tabling", dueDate: "2026-10-01", location: "Main Quad", type: "Social",
    });

    const updated = await updateProgrammingTask(ctx, confirmed.id, {
      status: "Complete", type: "Fundraiser", location: "Parking Lot B", time: "11:00 AM", collab: "DSP",
    });
    expect(updated.type).toBe("Fundraiser");
    expect(updated.location).toBe("Parking Lot B");
    expect(updated.collab).toBe("DSP");

    const pe = await testPrisma.programmingEvent.findUnique({ where: { id: confirmed.id } });
    expect(pe?.category).toBe("fundy");
    expect(pe?.collabOrg).toBe("DSP");
    const ce = await testPrisma.calendarEvent.findUnique({ where: { id: pe!.calendarEventId! } });
    expect(ce?.category).toBe("fundy");
    expect(ce?.location).toBe("Parking Lot B");
  });

  it("rejects clearing the date on a promoted event", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const confirmed = await createConfirmed(ctx, { title: "Mixer", dueDate: "2026-09-01", type: "Social" });

    await expect(updateProgrammingTask(ctx, confirmed.id, { dueDate: null })).rejects.toThrow(ValidationError);
  });

  it("allows clearing the date on an Idea event", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Idea", dueDate: "2026-09-01", type: "Social" });

    const updated = await updateProgrammingTask(ctx, task.id, { dueDate: null });
    expect(updated.dueDate).toBeNull();
  });

  it("updates ops fields", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Block Party", type: "Social" });

    const updated = await updateProgrammingTask(ctx, task.id, {
      roomStatus: "confirmed", itineraryUrl: "https://docs.google.com/document/d/test",
      flyerPosted: true, socialsMeeting: true, spendingCents: 12500, successRating: 4,
    });
    expect(updated.roomStatus).toBe("confirmed");
    expect(updated.flyerPosted).toBe(true);
    expect(updated.spendingCents).toBe(12500);
    expect(updated.successRating).toBe(4);
  });

  it("removes the ServiceEvent when type changes away from community service", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const confirmed = await createConfirmed(ctx, {
      title: "Park Cleanup", dueDate: "2026-09-18", location: "City Park", type: "Community Service",
    });
    const calId = (await testPrisma.programmingEvent.findUnique({ where: { id: confirmed.id } }))!.calendarEventId!;

    await updateProgrammingTask(ctx, confirmed.id, { type: "Program" });
    expect(await testPrisma.serviceEvent.findUnique({ where: { calendarEventId: calId } })).toBeNull();
  });

  it("deletes the CalendarEvent + ServiceEvent when removing a promoted service event", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const confirmed = await createConfirmed(ctx, {
      title: "Park Cleanup", dueDate: "2026-09-18", location: "City Park", type: "Community Service",
    });
    const calId = (await testPrisma.programmingEvent.findUnique({ where: { id: confirmed.id } }))!.calendarEventId!;

    await deleteProgrammingTask(ctx, confirmed.id);

    expect(await testPrisma.programmingEvent.findUnique({ where: { id: confirmed.id } })).toBeNull();
    expect(await testPrisma.calendarEvent.findUnique({ where: { id: calId } })).toBeNull();
    expect(await testPrisma.serviceEvent.findUnique({ where: { calendarEventId: calId } })).toBeNull();
  });
});

describe("checklist", () => {
  it("adds, lists, toggles, and deletes items", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Mixer", type: "Social" });

    const a = await addChecklistItem(ctx, task.id, { label: "Book room" });
    const b = await addChecklistItem(ctx, task.id, { label: "Design flyer" });
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);

    let items = await listChecklist(ctx, task.id);
    expect(items.map(i => i.label)).toEqual(["Book room", "Design flyer"]);

    await updateChecklistItem(ctx, task.id, a.id, { done: true });
    items = await listChecklist(ctx, task.id);
    expect(items.find(i => i.id === a.id)?.done).toBe(true);

    // Checklist surfaces on the task DTO.
    const tasks = await listProgrammingTasks(ctx);
    expect(tasks.find(t => t.id === task.id)?.checklist).toHaveLength(2);

    await deleteChecklistItem(ctx, task.id, b.id);
    expect(await listChecklist(ctx, task.id)).toHaveLength(1);
  });
});

describe("attachment", () => {
  it("stores and patches attachmentUrl", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Block Party", type: "Social" });

    const updated = await updateProgrammingTask(ctx, task.id, {
      attachmentUrl: "https://docs.google.com/document/d/runofshow",
    });
    expect(updated.attachmentUrl).toBe("https://docs.google.com/document/d/runofshow");
    expect(updated.attachmentDocId).toBeNull();
  });

  it("stores and patches attachmentDocId", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const doc = await testPrisma.doc.create({
      data: { organizationId: org.id, title: "Bylaws", url: "https://example.com/bylaws" },
    });
    const task = await createProgrammingTask(ctx, { title: "Chapter Night", type: "Program" });

    const updated = await updateProgrammingTask(ctx, task.id, { attachmentDocId: doc.id });
    expect(updated.attachmentDocId).toBe(doc.id);
    expect(updated.attachmentUrl).toBeNull();
  });

  it("clears attachment when both set to null", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Mixer", type: "Social" });
    await updateProgrammingTask(ctx, task.id, { attachmentUrl: "https://example.com/link" });

    const cleared = await updateProgrammingTask(ctx, task.id, { attachmentUrl: null });
    expect(cleared.attachmentUrl).toBeNull();
    expect(cleared.attachmentDocId).toBeNull();
  });

  it("prep score treats has-attachment as complete", () => {
    const base = { roomStatus: "not_submitted" as const, flyerPosted: false };
    const none = programmingPrepScore({ ...base, attachmentUrl: null, attachmentDocId: null });
    expect(none.done).toBe(0);
    expect(none.total).toBe(3);

    const withUrl = programmingPrepScore({ ...base, attachmentUrl: "https://example.com", attachmentDocId: null });
    expect(withUrl.done).toBe(1);

    const withDoc = programmingPrepScore({ ...base, attachmentUrl: null, attachmentDocId: 42 });
    expect(withDoc.done).toBe(1);
  });
});
