import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import { scrapeMetadata } from "@/lib/og-metadata";
import {
  fromProgrammingInput,
  isProgrammingCategory,
  parseProgrammingTitle,
  PROGRAMMING_CATEGORIES,
  resolveProgrammingDisplay,
  toProgrammingTask,
  typeLabelToCategory,
} from "@/lib/programming";
import type {
  AttachProgrammingDocInput,
  CreateProgrammingTaskInput,
  UpdateProgrammingTaskInput,
} from "@/lib/validation/programming";

const ROW_SELECT = {
  id:              true,
  title:           true,
  date:            true,
  location:        true,
  time:            true,
  status:          true,
  category:        true,
  description:     true,
  programmingEvent: {
    select: {
      id:             true,
      owner:          true,
      collabOrg:      true,
      itineraryUrl:   true,
      roomStatus:     true,
      flyerPosted:    true,
      socialsMeeting: true,
      spendingCents:  true,
      successRating:  true,
      wrapUpNotes:    true,
      _count:         { select: { docs: true } },
    },
  },
} as const;

type ProgrammingCalendarRow = Prisma.CalendarEventGetPayload<{ select: typeof ROW_SELECT }>;
type ProgrammingDocLinkWithDoc = Prisma.ProgrammingEventDocGetPayload<{ include: { doc: true } }>;

function isServiceCategory(category: string) {
  return category === "service";
}

function eventDisplayTitle(row: { title: string; programmingEvent?: { collabOrg?: string | null } | null }) {
  return resolveProgrammingDisplay({ title: row.title, collabOrg: row.programmingEvent?.collabOrg }).title;
}

async function syncServiceEvent(
  tx: Prisma.TransactionClient,
  orgId: number,
  calendarEvent: { id: number; title: string; programmingEvent?: { collabOrg?: string | null } | null; date: string; location: string | null },
) {
  const title = eventDisplayTitle(calendarEvent);
  await tx.serviceEvent.upsert({
    where:  { calendarEventId: calendarEvent.id },
    create: {
      organizationId:  orgId,
      title,
      date:            calendarEvent.date,
      location:        calendarEvent.location ?? "",
      notes:           "",
      calendarEventId: calendarEvent.id,
    },
    update: {
      title,
      date:     calendarEvent.date,
      location: calendarEvent.location ?? "",
    },
  });
}

async function removeServiceEvent(tx: Prisma.TransactionClient, calendarEventId: number) {
  const linked = await tx.serviceEvent.findUnique({
    where:  { calendarEventId },
    select: { id: true },
  });
  if (linked) await tx.serviceEvent.delete({ where: { id: linked.id } });
}

async function requireProgrammingEvent(ctx: RequestContext, id: number): Promise<ProgrammingCalendarRow> {
  const row = await ctx.db.calendarEvent.findUnique({
    where: { id },
    select: ROW_SELECT,
  });
  if (!row || !isProgrammingCategory(row.category)) {
    throw new NotFoundError("Programming event");
  }
  return row as unknown as ProgrammingCalendarRow;
}

export async function listProgrammingTasks(ctx: RequestContext) {
  const rows = await ctx.db.calendarEvent.findMany({
    where: { category: { in: [...PROGRAMMING_CATEGORIES] } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: ROW_SELECT,
  });
  return (rows as unknown as ProgrammingCalendarRow[]).map(toProgrammingTask);
}

export async function createProgrammingTask(ctx: RequestContext, input: CreateProgrammingTaskInput) {
  const data = fromProgrammingInput(input);
  const orgId = ctx.orgId;

  const event = isServiceCategory(data.calendarEvent.category)
    ? await ctx.db.$transaction(async (tx) => {
        const calendarEvent = await tx.calendarEvent.create({
          data: { ...data.calendarEvent, organizationId: orgId },
        });
        const programmingEvent = await tx.programmingEvent.create({
          data: { ...data.programmingEvent, organizationId: orgId, calendarEventId: calendarEvent.id },
        });
        await syncServiceEvent(tx, orgId, { ...calendarEvent, programmingEvent });
        return calendarEvent;
      })
    : await ctx.db.$transaction(async (tx) => {
        const calendarEvent = await tx.calendarEvent.create({
          data: { ...data.calendarEvent, organizationId: orgId },
        });
        await tx.programmingEvent.create({
          data: { ...data.programmingEvent, organizationId: orgId, calendarEventId: calendarEvent.id },
        });
        return calendarEvent;
      });

  const full = await ctx.db.calendarEvent.findUnique({
    where: { id: event.id },
    select: ROW_SELECT,
  });

  await emit(ctx, "calendar.created", { type: "CalendarEvent", id: event.id }, {
    title: event.title, date: event.date, category: event.category,
  });
  return toProgrammingTask(full! as unknown as ProgrammingCalendarRow);
}

export async function updateProgrammingTask(ctx: RequestContext, id: number, input: UpdateProgrammingTaskInput) {
  const existing = await requireProgrammingEvent(ctx, id);

  const calendarData: Prisma.CalendarEventUpdateInput = {};
  const programmingData: Prisma.ProgrammingEventUncheckedUpdateInput = {};
  const changedFields: string[] = [];

  if (input.title !== undefined) {
    calendarData.title = input.title.trim();
    changedFields.push("title");
  }
  if (input.collab !== undefined) {
    programmingData.collabOrg = input.collab?.trim() ?? "";
    changedFields.push("collabOrg");
  } else if (input.title === undefined && !existing.programmingEvent?.collabOrg && existing.title.includes(" × (")) {
    // Legacy row: if title updated elsewhere, leave as-is
  }
  if (input.dueDate !== undefined)  { calendarData.date = input.dueDate; changedFields.push("date"); }
  if (input.location !== undefined) { calendarData.location = input.location; changedFields.push("location"); }
  if (input.time !== undefined) {
    const trimmed = input.time?.trim();
    calendarData.time = trimmed ? trimmed : null;
    changedFields.push("time");
  }
  if (input.owner !== undefined)    { programmingData.owner = input.owner.trim(); changedFields.push("owner"); }
  if (input.status !== undefined)   { calendarData.status = input.status; changedFields.push("status"); }
  if (input.description !== undefined) { calendarData.description = input.description; changedFields.push("description"); }
  if (input.itineraryUrl !== undefined) { programmingData.itineraryUrl = input.itineraryUrl; changedFields.push("itineraryUrl"); }
  if (input.roomStatus !== undefined) { programmingData.roomStatus = input.roomStatus; changedFields.push("roomStatus"); }
  if (input.flyerPosted !== undefined) { programmingData.flyerPosted = input.flyerPosted; changedFields.push("flyerPosted"); }
  if (input.socialsMeeting !== undefined) { programmingData.socialsMeeting = input.socialsMeeting; changedFields.push("socialsMeeting"); }
  if (input.spendingCents !== undefined) { programmingData.spendingCents = input.spendingCents; changedFields.push("spendingCents"); }
  if (input.successRating !== undefined) { programmingData.successRating = input.successRating; changedFields.push("successRating"); }
  if (input.wrapUpNotes !== undefined) { programmingData.wrapUpNotes = input.wrapUpNotes; changedFields.push("wrapUpNotes"); }
  if (input.type !== undefined) {
    calendarData.category = typeLabelToCategory(input.type);
    changedFields.push("category");
  }

  // Migrate legacy collab-in-title on first touch
  if (input.collab === undefined && input.title === undefined && !existing.programmingEvent?.collabOrg) {
    const parsed = parseProgrammingTitle(existing.title);
    if (parsed.collab) {
      calendarData.title = parsed.title;
      programmingData.collabOrg = parsed.collab;
    }
  }

  const nextCategory = (calendarData.category as string | undefined) ?? existing.category;
  const wasService = isServiceCategory(existing.category);
  const willService = isServiceCategory(nextCategory);

  const event = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.calendarEvent.update({ where: { id }, data: calendarData });
    const updatedProgramming = await tx.programmingEvent.upsert({
      where:  { calendarEventId: id },
      update: programmingData,
      create: { ...programmingData, organizationId: ctx.orgId, calendarEventId: id } as Prisma.ProgrammingEventUncheckedCreateInput,
    });

    if (willService) {
      await syncServiceEvent(tx, ctx.orgId, { ...updated, programmingEvent: updatedProgramming });
    } else if (wasService) {
      await removeServiceEvent(tx, id);
    }

    return updated;
  });

  const full = await ctx.db.calendarEvent.findUnique({
    where: { id: event.id },
    select: ROW_SELECT,
  });

  await emit(ctx, "calendar.updated", { type: "CalendarEvent", id: event.id }, {
    title: event.title, changedFields,
  });
  return toProgrammingTask(full! as unknown as ProgrammingCalendarRow);
}

export async function deleteProgrammingTask(ctx: RequestContext, id: number) {
  const target = await requireProgrammingEvent(ctx, id);

  if (isServiceCategory(target.category)) {
    await ctx.db.$transaction(async (tx) => {
      await removeServiceEvent(tx, id);
      await tx.calendarEvent.delete({ where: { id } });
    });
  } else {
    await ctx.db.calendarEvent.delete({ where: { id } });
  }

  await emit(ctx, "calendar.deleted", { type: "CalendarEvent", id }, { title: target.title });
}

export async function listProgrammingEventDocs(ctx: RequestContext, eventId: number) {
  const event = await requireProgrammingEvent(ctx, eventId);
  if (!event.programmingEvent) throw new NotFoundError("Programming event");
  const links = await ctx.db.programmingEventDoc.findMany({
    where: { programmingEventId: event.programmingEvent.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { doc: true },
  }) as ProgrammingDocLinkWithDoc[];
  return links.map(link => link.doc);
}

export async function listProgrammingEventDocLinks(ctx: RequestContext, eventId: number) {
  const event = await requireProgrammingEvent(ctx, eventId);
  if (!event.programmingEvent) throw new NotFoundError("Programming event");
  return ctx.db.programmingEventDoc.findMany({
    where: { programmingEventId: event.programmingEvent.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { doc: true },
  }) as Promise<ProgrammingDocLinkWithDoc[]>;
}

export async function attachProgrammingDoc(
  ctx: RequestContext,
  eventId: number,
  input: AttachProgrammingDocInput,
) {
  const event = await requireProgrammingEvent(ctx, eventId);
  if (!event.programmingEvent) throw new NotFoundError("Programming event");
  const meta = await scrapeMetadata(input.url).catch(() => null);
  const { doc } = await ctx.db.$transaction(async (tx) => {
    const doc = await tx.doc.create({
      data: {
        organizationId: ctx.orgId,
        title:          input.title,
        url:            input.url,
        description:    input.description ?? null,
        ogImage:        meta?.ogImage    ?? null,
        ogTitle:        meta?.ogTitle    ?? null,
        faviconUrl:     meta?.faviconUrl ?? null,
        embedOk:        meta?.embedOk    ?? null,
        createdById:    ctx.actorId,
      },
    });
    const link = await tx.programmingEventDoc.create({
      data: {
        organizationId:     ctx.orgId,
        programmingEventId: event.programmingEvent!.id,
        docId:              doc.id,
      },
    });
    return { doc, link };
  });
  await emit(ctx, "doc.created", { type: "Doc", id: doc.id }, { title: doc.title, url: doc.url });
  return doc;
}

export async function detachProgrammingDoc(ctx: RequestContext, eventId: number, docId: number) {
  const event = await requireProgrammingEvent(ctx, eventId);
  if (!event.programmingEvent) throw new NotFoundError("Programming event");
  const link = await ctx.db.programmingEventDoc.findFirst({
    where: { docId, programmingEventId: event.programmingEvent.id },
    include: { doc: true },
  }) as ProgrammingDocLinkWithDoc | null;
  if (!link) throw new NotFoundError("Doc");
  await ctx.db.$transaction(async (tx) => {
    await tx.programmingEventDoc.delete({ where: { id: link.id } });
    await tx.doc.delete({ where: { id: docId } });
  });
  await emit(ctx, "doc.deleted", { type: "Doc", id: docId }, { title: link.doc.title });
}
