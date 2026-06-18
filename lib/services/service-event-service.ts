import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import { assertWithinActiveSemester } from "./semester-bounds";
import type { CreateServiceEventInput, UpdateServiceEventInput } from "@/lib/validation/service-event";

export async function listServiceEvents(ctx: RequestContext) {
  return ctx.db.serviceEvent.findMany({ orderBy: { date: "asc" } });
}

export async function createServiceEvent(ctx: RequestContext, input: CreateServiceEventInput) {
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

  return { ...serviceEvent, calendarEvent };
}

export async function updateServiceEvent(ctx: RequestContext, id: number, input: UpdateServiceEventInput) {
  // Only re-validate when the date is actually changing; this update also mirrors
  // the date onto the linked CalendarEvent, so the same bound applies there.
  if (input.date !== undefined) await assertWithinActiveSemester(ctx, input.date);

  const data: Prisma.ServiceEventUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateServiceEventInput)[]) {
    if (input[k] === undefined) continue;
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
    const updated = await tx.serviceEvent.update({ where: { id: existing.id }, data });
    if (existing.calendarEventId) {
      const calData: Prisma.CalendarEventUpdateInput = {};
      if (input.title    !== undefined) calData.title       = String(input.title);
      if (input.date     !== undefined) calData.date        = String(input.date);
      if (input.location !== undefined) calData.location    = String(input.location) || null;
      if (input.notes    !== undefined) calData.description = String(input.notes)    || null;
      if (Object.keys(calData).length > 0) {
        await tx.calendarEvent.update({ where: { id: existing.calendarEventId }, data: calData });
      }
    }
    return updated;
  });

  await emit(ctx, "service_event.updated", { type: "ServiceEvent", id: event.id }, {
    title: event.title, changedFields,
  });
  return event;
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
