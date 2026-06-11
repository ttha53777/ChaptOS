import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import { CALENDAR_CATEGORIES } from "@/lib/state";
import type { CreateCalendarInput, UpdateCalendarInput } from "@/lib/validation/calendar";

export async function listCalendar(ctx: RequestContext, opts: { category?: string | null } = {}) {
  const where: Prisma.CalendarEventWhereInput =
    opts.category && (CALENDAR_CATEGORIES as readonly string[]).includes(opts.category)
      ? { category: opts.category }
      : {};
  return ctx.db.calendarEvent.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function createCalendar(ctx: RequestContext, input: CreateCalendarInput) {
  const event = await ctx.db.calendarEvent.create({
    data: {
      title:       input.title,
      date:        input.date,
      time:        input.time ?? null,
      category:    input.category,
      mandatory:   input.mandatory,
      description: input.description ?? null,
      location:    input.location ?? null,
    },
  });
  await emit(ctx, "calendar.created", { type: "CalendarEvent", id: event.id }, {
    title: event.title, date: event.date, category: event.category,
  });
  return event;
}

export async function updateCalendar(ctx: RequestContext, id: number, input: UpdateCalendarInput) {
  const data: Prisma.CalendarEventUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateCalendarInput)[]) {
    const v = input[k];
    if (v === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = v;
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
    const updated = await tx.calendarEvent.update({ where: { id: existing.id }, data });

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
    return updated;
  });

  await emit(ctx, "calendar.updated", { type: "CalendarEvent", id: event.id }, {
    title: event.title, changedFields,
  });
  return event;
}

export async function deleteCalendar(ctx: RequestContext, id: number) {
  const target = await ctx.db.calendarEvent.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!target) throw new NotFoundError("Calendar event");

  await ctx.db.$transaction(async (tx) => {
    // Explicit organizationId: tx client is raw, no scoped wrapper.
    await tx.serviceEvent.deleteMany({ where: { calendarEventId: id, organizationId: ctx.orgId } });
    // A programming event backed by this calendar entry falls back to Idea
    // (the FK SET NULLs the link; resetting the stage keeps the CHECK valid and
    // returns the event to the board's Idea column instead of destroying it).
    await tx.programmingEvent.updateMany({
      where: { calendarEventId: id, organizationId: ctx.orgId },
      data:  { stage: "idea", calendarEventId: null },
    });
    await tx.calendarEvent.delete({ where: { id } });
  });

  await emit(ctx, "calendar.deleted", { type: "CalendarEvent", id }, { title: target.title });
}
