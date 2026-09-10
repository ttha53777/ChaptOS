import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { RequestContext } from "@/lib/context";
import { openMeetingNotes, readMeetingNotes, saveMeetingNotes } from "@/lib/services/meeting-notes-service";
import { updateCalendar, listCalendar } from "@/lib/services/calendar-service";
import { loadNotes, decodeNotes, seedNotes } from "@/lib/collaboration/notes-document";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createCalendarEvent } from "../setup/factories";
import { appPrisma, applyEnforcingRls, dropEnforcingRls, asOrg } from "../setup/rls";
import type { Prisma } from "@/app/generated/prisma/client";

beforeEach(resetDb);
afterAll(async () => { delete process.env.COLLABORATIVE_NOTES_ORG_IDS; await testPrisma.$disconnect(); });

async function scenario() {
  const org = await createOrg("Notes", "notes");
  const actor = await createBrother({ orgId: org.id, name: "Rob", isOrgAdmin: true });
  const event = await createCalendarEvent({ orgId: org.id });
  process.env.COLLABORATIVE_NOTES_ORG_IDS = String(org.id);
  const ctx: RequestContext = { requestId: randomUUID(), orgId: org.id, actorId: actor.id, actorName: "Rob", actorEmail: null,
    authUserId: actor.authUserId!, membershipId: null, permissions: 4, maxRank: 1, isOrgAdmin: true, isPlatformAdmin: false, db: db(org.id) };
  return { ctx, event };
}

function payload(doc: Y.Doc, generation = 1) {
  return { protocolVersion: 1 as const, notesDoc: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"), generation, lastSeenSeq: 0 };
}

describe("durable collaborative notes", () => {
  it("initializes and saves with database RLS enforced, denying a mismatched org", async () => {
    const { ctx, event } = await scenario();
    await applyEnforcingRls();
    try {
      const scoped = { ...ctx, db: { ...ctx.db, $transaction: ((fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => asOrg(ctx.orgId, fn)) as typeof ctx.db.$transaction } };
      const initial = await openMeetingNotes(scoped, event.id);
      const doc = loadNotes(decodeNotes(initial.notesDoc));
      doc.getText("notes").insert(0, "RLS persisted");
      expect(await saveMeetingNotes(scoped, event.id, payload(doc))).toMatchObject({ description: "RLS persisted" });
      doc.destroy();
      const other = await createOrg("Other", "other");
      process.env.COLLABORATIVE_NOTES_ORG_IDS += `,${other.id}`;
      // SQL still runs as the first org, even if the controller context is wrong.
      const foreign = await createCalendarEvent({ orgId: other.id });
      await expect(openMeetingNotes({ ...scoped, orgId: other.id }, foreign.id)).rejects.toThrow("not found");
    } finally { await dropEnforcingRls(); await appPrisma.$disconnect(); }
  });

  it("initializes the legacy description once even when two officers open together", async () => {
    const { ctx, event } = await scenario();
    await testPrisma.calendarEvent.update({ where: { id: event.id }, data: { description: "Original minutes" } });
    const [a, b] = await Promise.all([openMeetingNotes(ctx, event.id), openMeetingNotes(ctx, event.id)]);
    expect(a.notesDoc).toBe(b.notesDoc);
    const doc = loadNotes(decodeNotes(a.notesDoc));
    Y.applyUpdate(doc, decodeNotes(b.notesDoc));
    expect(doc.getText("notes").toString()).toBe("Original minutes");
    expect(a.notesContentRevision).toBe(0);
    doc.destroy();
  });

  it("merges concurrent divergent snapshots and survives a fresh load", async () => {
    const { ctx, event } = await scenario();
    const initial = await openMeetingNotes(ctx, event.id);
    const a = loadNotes(decodeNotes(initial.notesDoc));
    const b = loadNotes(decodeNotes(initial.notesDoc));
    a.getText("notes").insert(0, "Decision. ");
    b.getText("notes").insert(0, "Action. ");
    await Promise.all([saveMeetingNotes(ctx, event.id, payload(a)), saveMeetingNotes(ctx, event.id, payload(b))]);
    const saved = await openMeetingNotes(ctx, event.id);
    expect(saved.description).toContain("Decision. ");
    expect(saved.description).toContain("Action. ");
    expect(saved.notesDocSeq).toBe(2);
    const fresh = loadNotes(decodeNotes(saved.notesDoc));
    expect(fresh.getText("notes").toString()).toBe(saved.description);
    for (const doc of [a, b, fresh]) doc.destroy();
  });

  it("does not resurrect a deleted span when a stale snapshot arrives", async () => {
    const { ctx, event } = await scenario();
    await testPrisma.calendarEvent.update({ where: { id: event.id }, data: { description: "Keep Remove" } });
    const initial = await openMeetingNotes(ctx, event.id);
    const a = loadNotes(decodeNotes(initial.notesDoc));
    const b = loadNotes(decodeNotes(initial.notesDoc));
    a.getText("notes").delete(5, 6);
    b.getText("notes").insert(0, "New ");
    await saveMeetingNotes(ctx, event.id, payload(a));
    const saved = await saveMeetingNotes(ctx, event.id, payload(b));
    expect(saved.description).toBe("New Keep ");
    a.destroy(); b.destroy();
  });

  it("mirrors text, suppresses activity, and makes retried saves a no-op", async () => {
    const { ctx, event } = await scenario();
    const linked = await testPrisma.serviceEvent.create({ data: { title: "Linked", date: event.date, organizationId: ctx.orgId, calendarEventId: event.id } });
    const initial = await openMeetingNotes(ctx, event.id);
    const doc = loadNotes(decodeNotes(initial.notesDoc));
    doc.getText("notes").insert(0, "Motion passed");
    const first = await saveMeetingNotes(ctx, event.id, payload(doc));
    const second = await saveMeetingNotes(ctx, event.id, payload(doc, 2));
    expect(second.notesUpdatedAt).toBe(first.notesUpdatedAt);
    expect(second.notesContentRevision).toBe(1);
    expect(second.notesDocSeq).toBe(1);
    expect(second.generation).toBe(2);
    expect((await testPrisma.serviceEvent.findUniqueOrThrow({ where: { id: linked.id } })).notes).toBe("Motion passed");
    expect(await testPrisma.activityLog.count()).toBe(0);
    expect(await testPrisma.operationalEvent.count({ where: { action: "calendar.notes_saved" } })).toBe(1);
    doc.destroy();
  });

  it("blocks legacy overwrite and category conversion, but permits metadata edits", async () => {
    const { ctx, event } = await scenario();
    await openMeetingNotes(ctx, event.id);
    await expect(updateCalendar(ctx, event.id, { description: "Old browser" })).rejects.toThrow("shared");
    await expect(updateCalendar(ctx, event.id, { category: "service" })).rejects.toThrow("event type");
    await expect(updateCalendar(ctx, event.id, { title: "New title" })).resolves.toMatchObject({ title: "New title" });
    const rows = await listCalendar(ctx);
    expect(rows[0]).not.toHaveProperty("notesDoc");
  });

  it("denies foreign organizations, disabled pilot, and insufficient permissions", async () => {
    const { ctx, event } = await scenario();
    const other = await createOrg("Other", "other");
    const foreign = await createCalendarEvent({ orgId: other.id });
    await expect(openMeetingNotes(ctx, foreign.id)).rejects.toThrow("not found");
    await expect(readMeetingNotes({ ...ctx, isOrgAdmin: false, permissions: 0 }, event.id)).rejects.toThrow("Forbidden");
    process.env.COLLABORATIVE_NOTES_ORG_IDS = "";
    await expect(openMeetingNotes(ctx, event.id)).rejects.toThrow("not enabled");
  });

  it("exposes saved minutes read-only when the pilot is paused", async () => {
    const { ctx, event } = await scenario();
    await openMeetingNotes(ctx, event.id);
    process.env.COLLABORATIVE_NOTES_ORG_IDS = "";
    expect((await listCalendar(ctx))[0]).toMatchObject({ notesInitialized: true, notesCollaborationEnabled: false });
    await expect(updateCalendar(ctx, event.id, { description: "Legacy overwrite" })).rejects.toThrow("shared");
  });

  it("rejects invalid, rich, incomplete and oversized documents", async () => {
    const { ctx, event } = await scenario();
    await openMeetingNotes(ctx, event.id);
    const doc = new Y.Doc();
    await expect(saveMeetingNotes(ctx, event.id, { ...payload(doc), notesDoc: "not base64" })).rejects.toThrow("encoding");
    doc.getText("notes").insertEmbed(0, { html: "unsafe" });
    await expect(saveMeetingNotes(ctx, event.id, payload(doc))).rejects.toThrow("plain text");
    expect(() => seedNotes("x".repeat(50_001))).toThrow("50,000");
    doc.destroy();
  });
});
