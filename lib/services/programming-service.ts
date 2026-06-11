import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError } from "@/lib/errors";
import {
  formatProgrammingTitle,
  fromProgrammingInput,
  isProgrammingCategory,
  parseProgrammingTitle,
  PROGRAMMING_CATEGORIES,
  toProgrammingTask,
  typeLabelToCategory,
} from "@/lib/programming";
import type { CreateProgrammingTaskInput, UpdateProgrammingTaskInput } from "@/lib/validation/programming";

const ROW_SELECT = {
  id: true,
  title: true,
  date: true,
  location: true,
  time: true,
  status: true,
  category: true,
} as const;

function isServiceCategory(category: string) {
  return category === "service";
}

async function syncServiceEvent(
  tx: Prisma.TransactionClient,
  orgId: number,
  calendarEvent: { id: number; title: string; date: string; location: string | null },
) {
  await tx.serviceEvent.upsert({
    where:  { calendarEventId: calendarEvent.id },
    create: {
      organizationId:  orgId,
      title:           calendarEvent.title,
      date:            calendarEvent.date,
      location:        calendarEvent.location ?? "",
      notes:           "",
      calendarEventId: calendarEvent.id,
    },
    update: {
      title:    calendarEvent.title,
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

async function requireProgrammingEvent(ctx: RequestContext, id: number) {
  const row = await ctx.db.calendarEvent.findUnique({
    where: { id },
    select: ROW_SELECT,
  });
  if (!row || !isProgrammingCategory(row.category)) {
    throw new NotFoundError("Programming event");
  }
  return row;
}

export async function listProgrammingTasks(ctx: RequestContext) {
  const rows = await ctx.db.calendarEvent.findMany({
    where: { category: { in: [...PROGRAMMING_CATEGORIES] } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: ROW_SELECT,
  });
  return rows.map(toProgrammingTask);
}

export async function createProgrammingTask(ctx: RequestContext, input: CreateProgrammingTaskInput) {
  const data = fromProgrammingInput(input);
  const orgId = ctx.orgId;

  const event = isServiceCategory(data.category)
    ? await ctx.db.$transaction(async (tx) => {
        const calendarEvent = await tx.calendarEvent.create({
          data: { ...data, organizationId: orgId },
        });
        await syncServiceEvent(tx, orgId, calendarEvent);
        return calendarEvent;
      })
    : await ctx.db.calendarEvent.create({ data });

  await emit(ctx, "calendar.created", { type: "CalendarEvent", id: event.id }, {
    title: event.title, date: event.date, category: event.category,
  });
  return toProgrammingTask(event);
}

export async function updateProgrammingTask(ctx: RequestContext, id: number, input: UpdateProgrammingTaskInput) {
  const existing = await requireProgrammingEvent(ctx, id);

  const data: Prisma.CalendarEventUpdateInput = {};
  const changedFields: string[] = [];

  if (input.title !== undefined || input.collab !== undefined) {
    const parsed = parseProgrammingTitle(existing.title);
    const base = input.title ?? parsed.title;
    const collab = input.collab !== undefined ? input.collab : parsed.collab;
    data.title = formatProgrammingTitle(base, collab);
    changedFields.push("title");
  }
  if (input.dueDate !== undefined)  { data.date = input.dueDate; changedFields.push("date"); }
  if (input.location !== undefined) { data.location = input.location; changedFields.push("location"); }
  if (input.time !== undefined) {
    const trimmed = input.time?.trim();
    data.time = trimmed ? trimmed : null;
    changedFields.push("time");
  }
  if (input.status !== undefined)   { data.status = input.status; changedFields.push("status"); }
  if (input.type !== undefined) {
    data.category = typeLabelToCategory(input.type);
    changedFields.push("category");
  }

  const nextCategory = (data.category as string | undefined) ?? existing.category;
  const wasService = isServiceCategory(existing.category);
  const willService = isServiceCategory(nextCategory);

  const event = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.calendarEvent.update({ where: { id }, data });

    if (willService) {
      await syncServiceEvent(tx, ctx.orgId, updated);
    } else if (wasService) {
      await removeServiceEvent(tx, id);
    }

    return updated;
  });

  await emit(ctx, "calendar.updated", { type: "CalendarEvent", id: event.id }, {
    title: event.title, changedFields,
  });
  return toProgrammingTask(event);
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
