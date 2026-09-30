import { UNCLEAR_TIME, scheduleDate, scheduleTime, timeIsClear } from "@/lib/calendar-feed/schedule";
import { followDateChange } from "@/lib/calendar-feed/reschedule";
import { Prisma, type CalendarEvent } from "@/app/generated/prisma/client";
import { guardLegacyNotes, withoutNotesDoc } from "@/lib/collaboration/notes-compat";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertWithinActiveSemester } from "./semester-bounds";
import type { CreateServiceEventInput, UpdateServiceEventInput } from "@/lib/validation/service-event";

export async function listServiceEvents(ctx: RequestContext) {
  const events = await ctx.db.serviceEvent.findMany({ orderBy: { date: "asc" } });
  // The start/end lives on the linked calendar entry; editors need it to prefill.
  const calendar = await ctx.db.calendarEvent.findMany({
    where: { id: { in: events.flatMap(e => e.calendarEventId == null ? [] : [e.calendarEventId]) } },
    select: { id: true, schedule: true, time: true },
  });
  const byId = new Map(calendar.map(row => [row.id, row]));
  return events.map(event => {
    const linked = byId.get(event.calendarEventId ?? -1);
    return { ...event, schedule: linked?.schedule ?? null, time: linked?.time ?? null };
  });
}

export async function createServiceEvent(ctx: RequestContext, input: CreateServiceEventInput) {
  if (input.schedule) input = { ...input, date: scheduleDate(input.schedule), time: scheduleTime(input.schedule) ?? undefined };
  if (!timeIsClear(input.time ?? "")) throw new ValidationError(UNCLEAR_TIME);
  // Guard before the transaction so neither the CalendarEvent nor the
  // ServiceEvent row is written when the date is out of the active semester.
  await assertWithinActiveSemester(ctx, input.date);

  const titleStr    = input.title;
  const locationStr = input.location ?? "";
  const notesStr    = input.notes ?? input.description ?? "";
  const timeStr     = (input.time ?? "").trim();
  const mandatory   = input.mandatory ?? false;

  const orgId = ctx.orgId;
  const { serviceEvent, calendarEvent } = await ctx.db.$transaction(async (tx) => {
    const calendarEvent = await tx.calendarEvent.create({
      data: {
        organizationId: orgId,
        schedule: input.schedule ?? Prisma.DbNull,
        title:       titleStr,
        date:        input.date,
        time:        timeStr || null,
        category:    "service",
        mandatory,
        location:    locationStr || null,
        description: notesStr    || null,
      },
    });
    const serviceEvent = await tx.serviceEvent.create({
      data: {
        organizationId:  orgId,
        title:           titleStr,
        date:            input.date,
        location:        locationStr,
        notes:           notesStr,
        calendarEventId: calendarEvent.id,
      },
    });
    return { serviceEvent, calendarEvent };
  });

  await emit(ctx, "service_event.created", { type: "ServiceEvent", id: serviceEvent.id }, {
    title: serviceEvent.title, date: serviceEvent.date, calendarEventId: calendarEvent.id,
  });

  return { ...serviceEvent, calendarEvent: withoutNotesDoc(calendarEvent), schedule: calendarEvent.schedule, time: calendarEvent.time };
}

export async function updateServiceEvent(ctx: RequestContext, id: number, input: UpdateServiceEventInput) {
  if (input.schedule) input = { ...input, date: scheduleDate(input.schedule) };
  // Only re-validate when the date is actually changing; this update also mirrors
  // the date onto the linked CalendarEvent, so the same bound applies there.
  if (input.date !== undefined) await assertWithinActiveSemester(ctx, input.date);

  const data: Prisma.ServiceEventUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateServiceEventInput)[]) {
    if (input[k] === undefined) continue;
    if (k === "schedule") continue; // lives on the linked calendar entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = input[k];
    changedFields.push(k);
  }

  // Pre-verify org ownership and fetch calendarEventId before the transaction.
  // The raw tx client cannot use the org-scoped wrapper for point mutations.
  const existing = await ctx.db.serviceEvent.findUnique({
    where: { id },
    select: { id: true, calendarEventId: true },
  });
  if (!existing) throw new NotFoundError("Service event");

  const event = await ctx.db.$transaction(async (tx) => {
    let notesChanged = false;
    let calendar: CalendarEvent | undefined;
    // Calendar before service row: use the same lock ordering as notes saves.
    if (existing.calendarEventId) {
      [calendar] = await tx.$queryRaw<CalendarEvent[]>(Prisma.sql`SELECT * FROM "CalendarEvent" WHERE id = ${existing.calendarEventId} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
      if (!calendar) throw new NotFoundError("Calendar event");
      guardLegacyNotes(calendar, { description: input.notes });
      notesChanged = input.notes !== undefined && (input.notes ?? "") !== (calendar.description ?? "");
    }
    const updated = await tx.serviceEvent.update({ where: { id: existing.id }, data });
    if (existing.calendarEventId) {
      const calData: Prisma.CalendarEventUpdateInput = {};
      if (input.title    !== undefined) calData.title       = String(input.title);
      if (input.date     !== undefined) calData.date        = String(input.date);
      // An explicit schedule wins; a bare date change keeps the event's times.
      const timing = input.schedule !== undefined
        ? { schedule: input.schedule, time: input.schedule ? scheduleTime(input.schedule) : null }
        : input.date !== undefined ? followDateChange(calendar?.schedule, input.date) : undefined;
      if (timing) { calData.schedule = timing.schedule ?? Prisma.DbNull; calData.time = timing.time; }
      if (input.location !== undefined) calData.location    = String(input.location) || null;
      if (input.notes    !== undefined) calData.description = String(input.notes)    || null;
      if (notesChanged) { calData.notesContentRevision = { increment: 1 }; calData.notesUpdatedAt = new Date(); }
      if (Object.keys(calData).length > 0) {
        await tx.calendarEvent.update({ where: { id: existing.calendarEventId }, data: calData });
      }
    }
    return updated;
  });

  await emit(ctx, "service_event.updated", { type: "ServiceEvent", id: event.id }, {
    title: event.title, changedFields,
  });
  const linked = existing.calendarEventId == null ? null : await ctx.db.calendarEvent.findUnique({ where: { id: existing.calendarEventId }, select: { schedule: true, time: true } });
  return { ...event, schedule: linked?.schedule ?? null, time: linked?.time ?? null };
}

export async function deleteServiceEvent(ctx: RequestContext, id: number) {
  // Pre-verify org ownership before the transaction. The org-scoped findUnique
  // also fetches calendarEventId so the transaction doesn't need its own lookup.
  const existing = await ctx.db.serviceEvent.findUnique({
    where: { id },
    select: { title: true, calendarEventId: true },
  });
  if (!existing) throw new NotFoundError("Service event");

  await ctx.db.$transaction(async (tx) => {
    // Both ids are pre-verified above — safe to use in the raw tx client.
    await tx.serviceEvent.delete({ where: { id } });
    if (existing.calendarEventId) {
      // FK constraint guarantees the CalendarEvent exists if the FK is set.
      await tx.calendarEvent.delete({ where: { id: existing.calendarEventId } });
    }
  });

  await emit(ctx, "service_event.deleted", { type: "ServiceEvent", id }, { title: existing.title });
}
