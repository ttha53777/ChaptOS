import type { Prisma } from "@/app/generated/prisma/client";
import { Prisma as PrismaErr } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import type { CreateServiceEventInput, UpdateServiceEventInput } from "@/lib/validation/service-event";

export async function listServiceEvents(ctx: RequestContext) {
  return ctx.db.serviceEvent.findMany({ orderBy: { date: "asc" } });
}

export async function createServiceEvent(ctx: RequestContext, input: CreateServiceEventInput) {
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
  const data: Prisma.ServiceEventUpdateInput = {};
  const changedFields: string[] = [];
  for (const k of Object.keys(input) as (keyof UpdateServiceEventInput)[]) {
    if (input[k] === undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = input[k];
    changedFields.push(k);
  }

  const event = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.serviceEvent.update({ where: { id }, data });
    if (updated.calendarEventId) {
      const calData: Prisma.CalendarEventUpdateInput = {};
      if (input.title    !== undefined) calData.title       = String(input.title);
      if (input.date     !== undefined) calData.date        = String(input.date);
      if (input.location !== undefined) calData.location    = String(input.location) || null;
      if (input.notes    !== undefined) calData.description = String(input.notes)    || null;
      if (Object.keys(calData).length > 0) {
        await tx.calendarEvent.update({ where: { id: updated.calendarEventId }, data: calData });
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
  const deleted = await ctx.db.$transaction(async (tx) => {
    const existing = await tx.serviceEvent.findUnique({
      where: { id },
      select: { calendarEventId: true, title: true },
    });
    if (!existing) {
      throw new PrismaErr.PrismaClientKnownRequestError("Not found", { code: "P2025", clientVersion: "" });
    }
    await tx.serviceEvent.delete({ where: { id } });
    if (existing.calendarEventId) {
      const cal = await tx.calendarEvent.findUnique({
        where: { id: existing.calendarEventId },
        select: { id: true },
      });
      if (cal) await tx.calendarEvent.delete({ where: { id: existing.calendarEventId } });
    }
    return existing;
  }).catch(e => {
    if (e instanceof PrismaErr.PrismaClientKnownRequestError && e.code === "P2025") {
      throw new NotFoundError("Service event");
    }
    throw e;
  });

  await emit(ctx, "service_event.deleted", { type: "ServiceEvent", id }, { title: deleted.title });
}
