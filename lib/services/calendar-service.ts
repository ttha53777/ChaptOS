import { UNCLEAR_TIME, scheduleDate, scheduleTime, timeIsClear } from "@/lib/calendar-feed/schedule";
import { followDateChange } from "@/lib/calendar-feed/reschedule";
import { Prisma, type CalendarEvent } from "@/app/generated/prisma/client";
import { guardLegacyNotes, withoutNotesDoc } from "@/lib/collaboration/notes-compat";
import { collaborativeNotesEnabled } from "@/lib/collaboration/notes-config";
import { can } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { assertWithinActiveSemester } from "./semester-bounds";
import type { CreateCalendarInput, UpdateCalendarInput } from "@/lib/validation/calendar";

/**
 * Validate an event's category against the org's CalendarEventType rows — the
 * per-org replacement for the old fixed-enum CHECK. On create the type must be
 * creatable-from-the-timeline and not hidden (deadlines are managed
 * through tasks; hidden types are retired). Workflow-gating is a client/picker
 * concern, not enforced here. On update we only require the type to exist, so a
 * legacy event keeps an editable category even after its type was hidden.
 */
async function assertCategoryUsable(ctx: RequestContext, slug: string, mode: "create" | "update") {
  const type = await ctx.db.calendarEventType.findFirst({ where: { slug } });
  if (!type) throw new ValidationError(`Unknown event type "${slug}"`);
  if (mode === "create" && (!type.creatable || type.hidden)) {
    throw new ValidationError(`The "${type.label}" event type isn't available for new events`);
  }
}

export async function listCalendar(ctx: RequestContext, opts: { category?: string | null } = {}) {
  // Trust the category string as a plain WHERE filter — valid values are now
  // per-org CalendarEventType slugs, so custom categories must pass through.
  const where: Prisma.CalendarEventWhereInput = opts.category ? { category: opts.category } : {};
  // The scoped wrapper's return type doesn't carry the `include` through, so type the
  // payload explicitly. The runtime select matches this shape.
  type CalendarRowWithProgramming = Prisma.CalendarEventGetPayload<{
    include: { programmingEvent: { select: { id: true } }; partyEvent: { select: { id: true } } };
    omit: { notesDoc: true };
  }>;
  const rows = await ctx.db.calendarEvent.findMany({
    where,
    omit: { notesDoc: true },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    // Pull the owning ProgrammingEvent id (1:1 back-relation) so the Timeline can
    // deep-link a programming-backed event into the Programming page.
    include: { programmingEvent: { select: { id: true } }, partyEvent: { select: { id: true } } },
  }) as unknown as CalendarRowWithProgramming[];
  // Fetch only IDs of initialized documents, never the binary state in list reads.
  const initialized = new Set((await ctx.db.calendarEvent.findMany({ where: { ...where, notesDoc: { not: null } }, select: { id: true } })).map(row => row.id));
  // Flatten the relation to a scalar so the client DTO stays flat (app/data.ts).
  return rows.map(({ programmingEvent, partyEvent, ...row }) => ({
    ...row,
    notesInitialized: initialized.has(row.id),
    notesCollaborationEnabled: collaborativeNotesEnabled(ctx.orgId) && can(ctx, "MANAGE_EVENTS") && row.category === "chapter",
    programmingEventId: programmingEvent?.id ?? null,
    partyEventId: partyEvent?.id ?? null,
  }));
}

export async function createCalendar(ctx: RequestContext, input: CreateCalendarInput) {
  if (input.schedule) input = { ...input, date: scheduleDate(input.schedule), time: scheduleTime(input.schedule) };
  if (!timeIsClear(input.time ?? "")) throw new ValidationError(UNCLEAR_TIME);
  await assertCategoryUsable(ctx, input.category, "create");
  await assertWithinActiveSemester(ctx, input.date);
  const { event, partyEventId } = await ctx.db.$transaction(async tx => {
    const event = await tx.calendarEvent.create({
      data: {
        organizationId: ctx.orgId,
        schedule: input.schedule ?? Prisma.DbNull,
        title:       input.title,
        date:        input.date,
        time:        input.time ?? null,
        category:    input.category,
        mandatory:   input.mandatory,
        description: input.description ?? null,
        location:    input.location ?? null,
      },
    });
    // The calendar entry and its ledger are one creation, so commit both or neither.
    const party = input.category === "party" ? await tx.partyEvent.create({
      data: { organizationId: ctx.orgId, name: event.title, date: event.date, attendanceEventId: event.id },
    }) : null;
    return { event, partyEventId: party?.id ?? null };
  });
  await emit(ctx, "calendar.created", { type: "CalendarEvent", id: event.id }, {
    title: event.title, date: event.date, category: event.category,
  });
  return { ...withoutNotesDoc(event), partyEventId };
}

export async function updateCalendar(ctx: RequestContext, id: number, input: UpdateCalendarInput) {
  if (input.schedule) input = { ...input, date: scheduleDate(input.schedule), time: scheduleTime(input.schedule) };
  if (input.category != null) await assertCategoryUsable(ctx, input.category, "update");
  // Only re-validate when the date is actually being moved to a concrete value;
  // clearing it (null) or leaving it untouched (undefined) skips the bound check
  // so harmless edits to legacy out-of-range events aren't blocked.
  if (input.date != null) await assertWithinActiveSemester(ctx, input.date);

  const data: Prisma.CalendarEventUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateCalendarInput)[]) {
    const v = input[k];
    if (v === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = k === "schedule" && v === null ? Prisma.DbNull : v;
    changedFields.push(k);
  }
  if (input.description !== undefined) {
    // Bump notesUpdatedAt so the client can flag a stale AI summary.
    data.notesUpdatedAt = new Date();
  }

  // Verify org ownership before entering the transaction — the raw tx client
  // cannot use the org-scoped wrapper for point mutations.
  const existing = await ctx.db.calendarEvent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError("Calendar event");

  const event = await ctx.db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<CalendarEvent[]>(Prisma.sql`SELECT * FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    if (!locked) throw new NotFoundError("Calendar event");
    const party = await tx.partyEvent.findFirst({ where: { attendanceEventId: id, organizationId: ctx.orgId } });
    // A linked ledger contains party-specific history. Keep its category stable
    // rather than silently discarding that history in the generic editor.
    if (party && input.category !== undefined && input.category !== "party") {
      throw new ValidationError("This event has a party ledger. Keep the Party category to preserve its records.");
    }
    guardLegacyNotes(locked, input);
    // Only a time being changed must say AM/PM, so older events stay editable.
    if (input.time && input.time.trim() !== (locked.time ?? "").trim() && !timeIsClear(input.time)) throw new ValidationError(UNCLEAR_TIME);
    if (input.date != null && input.schedule === undefined && input.time === undefined) {
      const followed = followDateChange(locked.schedule, input.date);
      if (followed) { data.schedule = followed.schedule; data.time = followed.time; }
    }
    if (input.description !== undefined) {
      if ((input.description ?? "") === (locked.description ?? "")) delete data.notesUpdatedAt;
      else data.notesContentRevision = { increment: 1 };
    }
    const updated = await tx.calendarEvent.update({ where: { id: existing.id, organizationId: ctx.orgId }, data });
    const attachedParty = !party && updated.category === "party"
      ? await tx.partyEvent.create({ data: { organizationId: ctx.orgId, name: updated.title, date: updated.date, attendanceEventId: id } })
      : party;

    // Sync linked ServiceEvent. description→notes, others map 1:1.
    const svcData: Record<string, string> = {};
    if (input.title    !== undefined) svcData.title    = String(input.title    ?? "");
    if (input.date     !== undefined) svcData.date     = String(input.date     ?? "");
    if (input.location !== undefined) svcData.location = String(input.location ?? "");
    if (input.description !== undefined) svcData.notes = String(input.description ?? "");
    if (Object.keys(svcData).length > 0) {
      // Include organizationId: the tx client is raw (no scoped wrapper), so we
      // must guard explicitly to prevent touching service events from another org.
      await tx.serviceEvent.updateMany({
        where: { calendarEventId: id, organizationId: ctx.orgId },
        data: svcData,
      });
    }
    return { ...updated, partyEventId: attachedParty?.id ?? null };
  });

  await emit(ctx, "calendar.updated", { type: "CalendarEvent", id: event.id }, {
    title: event.title, changedFields,
  });
  return withoutNotesDoc(event);
}

export async function deleteCalendar(ctx: RequestContext, id: number) {
  const target = await ctx.db.calendarEvent.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!target) throw new NotFoundError("Calendar event");

  const { services: deletedServices, party: deletedParty } = await ctx.db.$transaction(async (tx) => {
    // Lock the parent before removing children so concurrent attendance writes
    // cannot insert a new FK reference between cleanup and deletion.
    const [locked] = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT id FROM "CalendarEvent" WHERE id = ${id} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
    if (!locked) throw new NotFoundError("Calendar event");
    const party = await tx.partyEvent.findFirst({ where: { attendanceEventId: id, organizationId: ctx.orgId } });
    if (party && !can(ctx, "MANAGE_PARTIES")) {
      throw new ForbiddenError("Managing parties is required to delete an event with a party ledger");
    }
    await tx.partyEvent.deleteMany({ where: { attendanceEventId: id, organizationId: ctx.orgId } });
    const attendanceWhere = { calendarEventId: id, calendarEvent: { organizationId: ctx.orgId } };
    await tx.attendanceRecord.deleteMany({ where: attendanceWhere });
    await tx.attendanceExcuse.deleteMany({ where: attendanceWhere });
    const services = await tx.serviceEvent.findMany({
      where: { calendarEventId: id, organizationId: ctx.orgId },
      select: { id: true, title: true },
    });
    // Explicit organizationId: tx client is raw, no scoped wrapper.
    await tx.serviceEvent.deleteMany({ where: { calendarEventId: id, organizationId: ctx.orgId } });
    // A programming event backed by this calendar entry falls back to Idea
    // (the FK SET NULLs the link; resetting the stage keeps the CHECK valid and
    // returns the event to the board's Idea column instead of destroying it).
    await tx.programmingEvent.updateMany({
      where: { calendarEventId: id, organizationId: ctx.orgId },
      data:  { stage: "idea", calendarEventId: null },
    });
    await tx.calendarEvent.delete({ where: { id, organizationId: ctx.orgId } });
    return { services, party };
  });

  await emit(ctx, "calendar.deleted", { type: "CalendarEvent", id }, { title: target.title });
  if (deletedParty) {
    await emit(ctx, "party.deleted", { type: "PartyEvent", id: deletedParty.id }, { name: deletedParty.name });
  }
  for (const service of deletedServices) {
    await emit(ctx, "service_event.deleted", { type: "ServiceEvent", id: service.id }, { title: service.title });
  }
}
