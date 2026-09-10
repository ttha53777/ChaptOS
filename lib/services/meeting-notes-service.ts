import * as Y from "yjs";
import { Prisma, type CalendarEvent } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { emit } from "@/lib/events";
import { collaborativeNotesEnabled, notesRealtimeEnabled } from "@/lib/collaboration/notes-config";
import { decodeNotes, loadNotes, seedNotes, encodeNotes, validateNotesDoc } from "@/lib/collaboration/notes-document";
import { NOTES_VERSION, notesTopic, type NotesSnapshot } from "@/lib/collaboration/notes-protocol";
import type { SaveNotesInput } from "@/lib/validation/meeting-notes";

function authorize(ctx: RequestContext) {
  if (!can(ctx, "MANAGE_EVENTS")) throw new ForbiddenError();
  if (!collaborativeNotesEnabled(ctx.orgId)) throw new ForbiddenError("Shared notes are not enabled for this organization.");
}

function checkEvent(event: CalendarEvent | undefined | null): asserts event is CalendarEvent {
  if (!event) throw new NotFoundError("Meeting");
  if (event.category !== "chapter") throw new ValidationError("Shared notes are available for chapter meetings.");
  if (event.notesProtocolVersion !== NOTES_VERSION) throw new ConflictError("Please reload to use this version of meeting notes.");
}

function snapshot(event: CalendarEvent): NotesSnapshot {
  if (!event.notesDoc) throw new ConflictError("Open the meeting before editing its notes.");
  return {
    notesInitialized: true,
    id: event.id, organizationId: event.organizationId,
    notesDoc: Buffer.from(event.notesDoc).toString("base64"),
    notesDocSeq: event.notesDocSeq, notesContentRevision: event.notesContentRevision,
    notesSummaryRevision: event.notesSummaryRevision, notesProtocolVersion: event.notesProtocolVersion,
    notesUpdatedAt: event.notesUpdatedAt?.toISOString() ?? null, description: event.description ?? "",
  };
}

export async function openMeetingNotes(ctx: RequestContext, id: number) {
  authorize(ctx);
  const event = await ctx.db.$transaction(async tx => {
    const [existing] = await tx.$queryRaw<CalendarEvent[]>(Prisma.sql`SELECT * FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    checkEvent(existing);
    if (existing.notesDoc) return existing;
    return tx.calendarEvent.update({ where: { id, organizationId: ctx.orgId }, data: { notesDoc: new Uint8Array(seedNotes(existing.description ?? "")) } });
  }, { maxWait: 5000, timeout: 5000 });
  return { ...snapshot(event), topic: notesTopic(ctx.orgId, id), realtime: notesRealtimeEnabled(), actor: { id: ctx.actorId, name: ctx.actorName, authUserId: ctx.authUserId } };
}

export async function readMeetingNotes(ctx: RequestContext, id: number, afterSeq?: number) {
  authorize(ctx);
  const event = await ctx.db.calendarEvent.findUnique({ where: { id } });
  checkEvent(event);
  if (event.notesDoc && afterSeq === event.notesDocSeq) return { unchanged: true as const, notesDocSeq: event.notesDocSeq };
  return snapshot(event);
}

export async function saveMeetingNotes(ctx: RequestContext, id: number, input: SaveNotesInput) {
  authorize(ctx);
  if (input.protocolVersion !== NOTES_VERSION) throw new ConflictError("Please reload the meeting.");
  // Validate the complete incoming snapshot before holding a database lock.
  const incoming = decodeNotes(input.notesDoc);
  const validated = loadNotes(incoming);
  validated.destroy();
  const result = await ctx.db.$transaction(async tx => {
    const [existing] = await tx.$queryRaw<CalendarEvent[]>(Prisma.sql`SELECT * FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    checkEvent(existing);
    if (!existing.notesDoc) throw new ConflictError("Open the meeting before editing its notes.");
    const doc = loadNotes(existing.notesDoc);
    try {
      const before = encodeNotes(doc);
      Y.applyUpdate(doc, incoming);
      const description = validateNotesDoc(doc);
      const bytes = encodeNotes(doc);
      if (Buffer.from(before).equals(Buffer.from(bytes))) return { event: existing, changed: false };
      const textChanged = description !== (existing.description ?? "");
      const updated = await tx.calendarEvent.update({ where: { id, organizationId: ctx.orgId }, data: {
        notesDoc: new Uint8Array(bytes), notesDocSeq: { increment: 1 },
        ...(textChanged ? { description, notesContentRevision: { increment: 1 }, notesUpdatedAt: new Date() } : {}),
      } });
      if (textChanged) await tx.serviceEvent.updateMany({ where: { calendarEventId: id, organizationId: ctx.orgId }, data: { notes: description } });
      return { event: updated, changed: true };
    } finally { doc.destroy(); }
  }, { maxWait: 5000, timeout: 5000 });
  if (result.changed) await emit(ctx, "calendar.notes_saved", { type: "CalendarEvent", id }, {
    title: result.event.title, revision: result.event.notesContentRevision, seq: result.event.notesDocSeq,
  }, { activity: false });
  return { ...snapshot(result.event), generation: input.generation };
}
