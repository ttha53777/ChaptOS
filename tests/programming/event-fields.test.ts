/**
 * The org's optional event-field vocabulary: the CRUD service and the rules that
 * keep an answer from being lost.
 *
 * This is the table that replaced the per-event ProgrammingChecklistItem list.
 * The properties tested here are the ones that make that replacement worth it:
 * a slug is server-derived and immutable, a rename keeps the answers, "off" hides
 * without destroying, and a delete that would orphan answers is refused by name.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createEventType, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import {
  createEventField,
  deleteEventField,
  listEventFields,
  updateEventField,
} from "@/lib/services/event-field-service";
import {
  createProgrammingTask,
  listProgrammingTasks,
  updateProgrammingTask,
} from "@/lib/services/programming-service";
import { PERMISSIONS } from "@/lib/permissions";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function ctxFor(orgId: number, actorId: number, opts?: { permissions?: number; isOrgAdmin?: boolean }): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     opts?.permissions ?? 0,
    maxRank:         0,
    isOrgAdmin:      opts?.isOrgAdmin ?? true,
    isPlatformAdmin: false,
    db:              db(orgId),
  };
}

async function seedOrg() {
  const org = await createOrg("Fields Org", "fields-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  // The cases that prove answers SURVIVE a rename/disable have to create an
  // event to answer with, and creating one validates its category against the
  // org's own types — program/social/fundy are org-owned customs now, not
  // built-ins. Without these three the whole "answers survive" argument was
  // failing on "Unknown event type" before it ever reached the assertion.
  await createSemester({ orgId: org.id, startDate: "2026-01-01", endDate: "2026-12-31" });
  await createEventType({ orgId: org.id, slug: "program", label: "Program" });
  await createEventType({ orgId: org.id, slug: "social",  label: "Social" });
  await createEventType({ orgId: org.id, slug: "fundy",   label: "Fundraiser" });
  return { org, admin };
}

describe("listEventFields", () => {
  it("returns the ten built-ins, five of them enabled", async () => {
    const { org, admin } = await seedOrg();
    const fields = await listEventFields(ctxFor(org.id, admin.id));

    expect(fields).toHaveLength(10);
    expect(fields.every(f => f.builtin)).toBe(true);
    expect(fields.filter(f => f.enabled).map(f => f.slug))
      .toEqual(["description", "budget", "attachment", "headcount", "cohost"]);
  });

  it("includes DISABLED rows — the settings surface needs to see what it can turn on", async () => {
    const { org, admin } = await seedOrg();
    const fields = await listEventFields(ctxFor(org.id, admin.id));
    expect(fields.filter(f => !f.enabled).map(f => f.slug))
      .toEqual(["contact", "setup", "risk", "dress", "transport"]);
  });
});

describe("createEventField", () => {
  it("derives the slug from the label — the client never sends one", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    const field = await createEventField(ctx, { label: "Bus company", kind: "text" });
    expect(field.slug).toBe("bus-company");
    expect(field.builtin).toBe(false);
  });

  it("de-dupes a colliding slug with a numeric suffix", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    await createEventField(ctx, { label: "Bus company", kind: "text" });
    // A different LABEL that slugs the same way — the label guard doesn't catch
    // this one, so the de-dupe loop has to.
    const second = await createEventField(ctx, { label: "Bus Company!", kind: "text" });
    expect(second.slug).toBe("bus-company-2");
  });

  it("guards on the case-folded LABEL, not just the slug", async () => {
    // A pure slug check would accept a second row labelled "budget" beside the
    // built-in "Budget": different slugs, indistinguishable in a panel.
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);

    await expect(createEventField(ctx, { label: "budget", kind: "money" }))
      .rejects.toThrow(/already exists/i);
  });

  it("refuses a label that would mint a reserved slug", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    // Delete the seeded builtin so the de-dupe loop wouldn't catch it — the
    // reserved check is what has to.
    await testPrisma.eventFieldDefinition.deleteMany({ where: { organizationId: org.id, slug: "risk" } });

    await expect(createEventField(ctx, { label: "Risk", kind: "bool" })).rejects.toThrow(/reserved/i);
  });

  it("enforces the per-org ceiling", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    // Ten built-ins are already seeded; MAX_EVENT_FIELDS is 24.
    for (let i = 0; i < 14; i++) await createEventField(ctx, { label: `Field ${i}`, kind: "text" });
    await expect(createEventField(ctx, { label: "One too many", kind: "text" }))
      .rejects.toThrow(/limit/i);
  });

  // The settings editor reorders by swapping two rows' displayOrder. Untested
  // until now, and it is the ONLY thing that decides the reading order of the
  // sheet every event answers.
  it("reorders by displayOrder, and listEventFields reads it back", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const a = await createEventField(ctx, { label: "Bus company", kind: "text" });
    const b = await createEventField(ctx, { label: "Beneficiary", kind: "text" });
    expect(a.displayOrder).toBeLessThan(b.displayOrder);

    // The swap the up/down buttons perform.
    await updateEventField(ctx, a.id, { displayOrder: b.displayOrder });
    await updateEventField(ctx, b.id, { displayOrder: a.displayOrder });

    const listed = (await listEventFields(ctx)).filter(f => !f.builtin).map(f => f.slug);
    expect(listed).toEqual(["beneficiary", "bus-company"]);
  });
});

describe("permissions", () => {
  it("lets a MANAGE_EVENTS holder who is not an admin manage fields", async () => {
    // Deliberately not the org-admin gate: the officer who creates the events
    // should be able to name the fields, or adding one needs the president.
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: false, permissions: PERMISSIONS.MANAGE_EVENTS });

    const field = await createEventField(ctx, { label: "Beneficiary", kind: "text" });
    expect(field.slug).toBe("beneficiary");
  });

  it("refuses a member with no events permission", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: false, permissions: 0 });

    await expect(createEventField(ctx, { label: "Beneficiary", kind: "text" }))
      .rejects.toThrow(ForbiddenError);
  });

  it("still lets anyone READ the definitions", async () => {
    // Every member's event panel needs the labels to render an answer.
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id, { isOrgAdmin: false, permissions: 0 });
    expect(await listEventFields(ctx)).toHaveLength(10);
  });
});

describe("updateEventField", () => {
  it("renaming keeps the slug, and therefore keeps every answer", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Mixer", category: "social" });
    await updateProgrammingTask(ctx, task.id, { fieldValues: { headcount: 40 } });

    const headcount = (await listEventFields(ctx)).find(f => f.slug === "headcount")!;
    const renamed = await updateEventField(ctx, headcount.id, { label: "Expected turnout" });
    expect(renamed.label).toBe("Expected turnout");
    expect(renamed.slug).toBe("headcount");

    const row = await testPrisma.programmingEvent.findUnique({ where: { id: task.id } });
    expect((row!.fieldValues as Record<string, unknown>).headcount).toBe(40);
  });

  it("disables a BUILTIN, keeping its answers for when it comes back", async () => {
    // This used to be refused, on the grounds that the board and the gates
    // addressed these by slug. They don't: the stage gates read REQUIRED_FIELDS
    // (title, category, owner, date, location, mandatory), which are real columns
    // sharing no slug with this table. Refusing it forced every chapter to carry
    // all ten rows forever — the hardcoded-column problem this table replaced.
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const headcount = (await listEventFields(ctx)).find(f => f.slug === "headcount")!;
    const task = await createProgrammingTask(ctx, { title: "Formal", category: "social" });
    await updateProgrammingTask(ctx, task.id, { fieldValues: { headcount: 40 } });

    const off = await updateEventField(ctx, headcount.id, { enabled: false });
    expect(off.enabled).toBe(false);

    // Off hides, it does not destroy: the answer is still on disk, so switching
    // the field back on resurrects it rather than starting from blank.
    const row = await testPrisma.programmingEvent.findUnique({ where: { id: task.id } });
    expect((row!.fieldValues as Record<string, unknown>).headcount).toBe(40);

    const back = await updateEventField(ctx, headcount.id, { enabled: true });
    expect(back.enabled).toBe(true);
  });

  it("disables a CUSTOM field, hiding it without losing the answers", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const field = await createEventField(ctx, { label: "Bus company", kind: "text" });
    const task = await createProgrammingTask(ctx, { title: "Formal", category: "social" });
    await updateProgrammingTask(ctx, task.id, { fieldValues: { "bus-company": "Greyhound" } });

    await updateEventField(ctx, field.id, { enabled: false });

    const row = await testPrisma.programmingEvent.findUnique({ where: { id: task.id } });
    expect((row!.fieldValues as Record<string, unknown>)["bus-company"]).toBe("Greyhound");
  });

  it("refuses a rename onto another field's label", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const field = await createEventField(ctx, { label: "Bus company", kind: "text" });

    await expect(updateEventField(ctx, field.id, { label: "Budget" }))
      .rejects.toThrow(/already exists/i);
  });
});

describe("deleteEventField", () => {
  it("refuses to delete a builtin", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const budget = (await listEventFields(ctx)).find(f => f.slug === "budget")!;

    await expect(deleteEventField(ctx, budget.id)).rejects.toThrow(/built-in/i);
  });

  it("deletes an unanswered custom field", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const field = await createEventField(ctx, { label: "Bus company", kind: "text" });

    await deleteEventField(ctx, field.id);
    expect((await listEventFields(ctx)).some(f => f.id === field.id)).toBe(false);
  });

  it("refuses a delete that would orphan answers, and says how many", async () => {
    // sanitizeFieldValues already hides orphaned answers on read, so a silent
    // delete would LOOK clean while discarding real data. Naming the count gives
    // the officer the choice that silence would deny them.
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const field = await createEventField(ctx, { label: "Bus company", kind: "text" });

    for (const title of ["Formal", "Retreat", "Away game"]) {
      const t = await createProgrammingTask(ctx, { title, category: "social" });
      await updateProgrammingTask(ctx, t.id, { fieldValues: { "bus-company": "Greyhound" } });
    }

    await expect(deleteEventField(ctx, field.id)).rejects.toThrow(/3 events have answered/i);
    await expect(deleteEventField(ctx, field.id)).rejects.toThrow(ValidationError);
  });
});

describe("tenancy", () => {
  it("one org cannot see or touch another's fields", async () => {
    const { org, admin } = await seedOrg();
    const other = await createOrg("Other Org", "other-fields-org");
    const otherAdmin = await createBrother({ orgId: other.id, isOrgAdmin: true });

    const mine = await createEventField(ctxFor(org.id, admin.id), { label: "Beneficiary", kind: "text" });

    const otherCtx = ctxFor(other.id, otherAdmin.id);
    expect((await listEventFields(otherCtx)).some(f => f.id === mine.id)).toBe(false);
    await expect(updateEventField(otherCtx, mine.id, { label: "Stolen" })).rejects.toThrow();
    await expect(deleteEventField(otherCtx, mine.id)).rejects.toThrow();
  });
});

/**
 * Per-event attachment.
 *
 * The org list is a MENU (which fields exist, and what a new event starts with);
 * each event stores only where it diverges. The properties worth pinning are that
 * one event's choice never reaches another, that a field switched on for the org
 * still reaches events that never expressed an opinion, and that detaching an
 * answered field really does clear it — the one place this parts company with the
 * org switch's OFF ≠ DELETE promise.
 */
describe("per-event field attachment", () => {
  it("detaching a field on one event leaves every other event alone", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    await createEventField(ctx, { label: "Bus company", kind: "text" });

    const a = await createProgrammingTask(ctx, { title: "Formal", category: "social" });
    const b = await createProgrammingTask(ctx, { title: "Retreat", category: "social" });

    const afterA = await updateProgrammingTask(ctx, a.id, { detachedFields: ["bus-company"] });
    expect(afterA.detachedFields).toEqual(["bus-company"]);

    // The whole point: B never opted out, so it still collects the field.
    const stillB = (await listProgrammingTasks(ctx)).find(t => t.id === b.id)!;
    expect(stillB.detachedFields).toEqual([]);
  });

  it("clears the answer when an answered field is detached", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    await createEventField(ctx, { label: "Bus company", kind: "text" });
    const task = await createProgrammingTask(ctx, { title: "Formal", category: "social" });
    await updateProgrammingTask(ctx, task.id, { fieldValues: { "bus-company": "Greyhound" } });

    await updateProgrammingTask(ctx, task.id, { detachedFields: ["bus-company"] });

    // Gone from disk, not merely hidden: a detach says the field was never part
    // of THIS event, so an answer waiting to resurface on reattach would be a lie.
    const row = await testPrisma.programmingEvent.findUnique({ where: { id: task.id } });
    expect((row!.fieldValues as Record<string, unknown>)["bus-company"]).toBeUndefined();
  });

  it("a field switched on for the org reaches events that never opted out", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Formal", category: "social" });

    // Created AFTER the event exists. Storing exceptions rather than a full
    // attachment set is what makes this work with no backfill.
    await createEventField(ctx, { label: "Bus company", kind: "text" });

    const after = (await listProgrammingTasks(ctx)).find(t => t.id === task.id)!;
    expect(after.detachedFields).toEqual([]);
    await updateProgrammingTask(ctx, task.id, { fieldValues: { "bus-company": "Greyhound" } });
    const answered = (await listProgrammingTasks(ctx)).find(t => t.id === task.id)!;
    expect(answered.fieldValues["bus-company"]).toBe("Greyhound");
  });

  it("drops an opt-out for a field the org doesn't offer", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    const task = await createProgrammingTask(ctx, { title: "Formal", category: "social" });

    // A stale slug would otherwise sit in the column forever and silently
    // suppress the field if the org ever switched it back on.
    const after = await updateProgrammingTask(ctx, task.id, {
      detachedFields: ["not-a-real-field"],
    });
    expect(after.detachedFields).toEqual([]);
  });

  it("hides a detached field's answers from the event's DTO", async () => {
    const { org, admin } = await seedOrg();
    const ctx = ctxFor(org.id, admin.id);
    await createEventField(ctx, { label: "Bus company", kind: "text" });
    const task = await createProgrammingTask(ctx, { title: "Formal", category: "social" });
    await updateProgrammingTask(ctx, task.id, { fieldValues: { "bus-company": "Greyhound" } });

    const after = await updateProgrammingTask(ctx, task.id, { detachedFields: ["bus-company"] });
    expect(after.fieldValues["bus-company"]).toBeUndefined();
  });
});
