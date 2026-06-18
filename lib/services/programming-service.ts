import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { scrapeMetadata } from "@/lib/og-metadata";
import {
  fromProgrammingInput,
  isProgrammingCategory,
  PROGRAMMING_CATEGORIES,
  resolveProgrammingDisplay,
  toCalendarFields,
  toProgrammingTask,
  typeLabelToCategory,
} from "@/lib/programming";
import { isProgrammingStage, stageRequiresCalendar } from "@/lib/state/programming-stage";
import { programmingPrepScore } from "@/lib/programming";
import { isRoomStatus } from "@/lib/state/programming-prep";
import { assertWithinActiveSemester } from "./semester-bounds";
import type {
  AttachProgrammingDocInput,
  CreateChecklistItemInput,
  CreateProgrammingTaskInput,
  SetStageInput,
  UpdateChecklistItemInput,
  UpdateProgrammingTaskInput,
} from "@/lib/validation/programming";

// ProgrammingEvent is now the owning record. CalendarEvent exists only for
// Planning+ stages (created on promotion, deleted on demotion).
const ROW_SELECT = {
  id:              true,
  title:           true,
  date:            true,
  category:        true,
  location:        true,
  time:            true,
  description:     true,
  status:          true,
  stage:           true,
  mandatory:       true,
  owner:           true,
  collabOrg:       true,
  itineraryUrl:    true,
  attachmentUrl:   true,
  attachmentDocId: true,
  roomStatus:      true,
  itineraryNotNeeded: true,
  flyerPosted:     true,
  socialsMeeting:  true,
  spendingCents:   true,
  successRating:   true,
  wrapUpNotes:     true,
  calendarEventId: true,
  _count:          { select: { docs: true } },
  checklist:       { select: { id: true, label: true, done: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
} as const satisfies Prisma.ProgrammingEventSelect;

type ProgrammingRow = Prisma.ProgrammingEventGetPayload<{ select: typeof ROW_SELECT }>;
type ProgrammingDocLinkWithDoc = Prisma.ProgrammingEventDocGetPayload<{ include: { doc: true } }>;

function isServiceCategory(category: string) {
  return category === "service";
}

async function syncServiceEvent(
  tx: Prisma.TransactionClient,
  orgId: number,
  calendarEventId: number,
  row: { title: string; collabOrg: string; date: string | null; location: string | null },
) {
  const { title } = resolveProgrammingDisplay({ title: row.title, collabOrg: row.collabOrg });
  await tx.serviceEvent.upsert({
    where:  { calendarEventId },
    create: {
      organizationId:  orgId,
      title,
      date:            row.date ?? "",
      location:        row.location ?? "",
      notes:           "",
      calendarEventId,
    },
    update: {
      title,
      date:     row.date ?? "",
      location: row.location ?? "",
    },
  });
}

async function removeServiceEvent(tx: Prisma.TransactionClient, calendarEventId: number) {
  const linked = await tx.serviceEvent.findUnique({ where: { calendarEventId }, select: { id: true } });
  if (linked) await tx.serviceEvent.delete({ where: { id: linked.id } });
}

async function requireProgrammingEvent(ctx: RequestContext, id: number): Promise<ProgrammingRow> {
  // The scoped findUnique wrapper isn't select-narrowed in its return type; the
  // runtime select matches ROW_SELECT, so cast to the known payload.
  const row = await ctx.db.programmingEvent.findUnique({ where: { id }, select: ROW_SELECT }) as ProgrammingRow | null;
  if (!row || !isProgrammingCategory(row.category)) {
    throw new NotFoundError("Programming event");
  }
  return row;
}

async function loadTask(ctx: RequestContext, id: number) {
  const row = await ctx.db.programmingEvent.findUnique({ where: { id }, select: ROW_SELECT }) as ProgrammingRow | null;
  return toProgrammingTask(row!);
}

export async function listProgrammingTasks(ctx: RequestContext) {
  const rows = await ctx.db.programmingEvent.findMany({
    where:   { category: { in: [...PROGRAMMING_CATEGORIES] } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select:  ROW_SELECT,
  });
  return rows.map(toProgrammingTask);
}

export async function createProgrammingTask(ctx: RequestContext, input: CreateProgrammingTaskInput) {
  // Requires an active semester even for a dateless Idea; when a dueDate is set
  // it must fall within the semester (it lands on the calendar on promotion).
  await assertWithinActiveSemester(ctx, input.dueDate);
  // Always starts in Idea: a ProgrammingEvent with no CalendarEvent.
  const data = fromProgrammingInput(input);
  const created = await ctx.db.programmingEvent.create({
    data: data as Omit<Prisma.ProgrammingEventUncheckedCreateInput, "organizationId">,
    select: ROW_SELECT,
  });
  await emit(ctx, "programming.created", { type: "ProgrammingEvent", id: created.id }, {
    title: created.title, stage: created.stage,
  });
  return toProgrammingTask(created);
}

export async function updateProgrammingTask(ctx: RequestContext, id: number, input: UpdateProgrammingTaskInput) {
  const existing = await requireProgrammingEvent(ctx, id);

  const data: Prisma.ProgrammingEventUncheckedUpdateInput = {};
  const changedFields: string[] = [];

  if (input.title !== undefined)        { data.title = input.title.trim(); changedFields.push("title"); }
  if (input.collab !== undefined)       { data.collabOrg = input.collab?.trim() ?? ""; changedFields.push("collabOrg"); }
  if (input.dueDate !== undefined) {
    // A promoted event (Planning+) is on the calendar and must keep a date.
    if (input.dueDate == null && existing.stage !== "idea") {
      throw new ValidationError("A scheduled event must keep its date. Move it back to Idea first to clear the date.");
    }
    // Setting a concrete date must stay within the active semester; clearing it
    // to null (Idea only, handled above) is exempt.
    if (input.dueDate != null) await assertWithinActiveSemester(ctx, input.dueDate);
    data.date = input.dueDate;
    changedFields.push("date");
  }
  if (input.location !== undefined)     { data.location = input.location?.trim() || null; changedFields.push("location"); }
  if (input.time !== undefined)         { data.time = input.time?.trim() || null; changedFields.push("time"); }
  if (input.owner !== undefined)        { data.owner = input.owner.trim(); changedFields.push("owner"); }
  if (input.status !== undefined)       { data.status = input.status; changedFields.push("status"); }
  if (input.description !== undefined)  { data.description = input.description; changedFields.push("description"); }
  if (input.itineraryUrl !== undefined)  { data.itineraryUrl = input.itineraryUrl; changedFields.push("itineraryUrl"); }
  if (input.attachmentUrl !== undefined) { data.attachmentUrl = input.attachmentUrl; changedFields.push("attachmentUrl"); }
  if (input.attachmentDocId !== undefined) { data.attachmentDocId = input.attachmentDocId; changedFields.push("attachmentDocId"); }
  if (input.roomStatus !== undefined)   { data.roomStatus = input.roomStatus; changedFields.push("roomStatus"); }
  if (input.itineraryNotNeeded !== undefined) { data.itineraryNotNeeded = input.itineraryNotNeeded; changedFields.push("itineraryNotNeeded"); }
  if (input.flyerPosted !== undefined)  { data.flyerPosted = input.flyerPosted; changedFields.push("flyerPosted"); }
  if (input.socialsMeeting !== undefined) { data.socialsMeeting = input.socialsMeeting; changedFields.push("socialsMeeting"); }
  if (input.spendingCents !== undefined) { data.spendingCents = input.spendingCents; changedFields.push("spendingCents"); }
  if (input.successRating !== undefined) { data.successRating = input.successRating; changedFields.push("successRating"); }
  if (input.wrapUpNotes !== undefined)  { data.wrapUpNotes = input.wrapUpNotes; changedFields.push("wrapUpNotes"); }
  if (input.type !== undefined)         { data.category = typeLabelToCategory(input.type); changedFields.push("category"); }

  const nextCategory = (data.category as string | undefined) ?? existing.category;
  const wasService   = isServiceCategory(existing.category);
  const willService  = isServiceCategory(nextCategory);

  await ctx.db.$transaction(async (tx) => {
    const updated = await tx.programmingEvent.update({
      where: { id },
      data,
      select: ROW_SELECT,
    });

    // Mirror calendar-relevant fields onto the CalendarEvent if this event is
    // promoted (Planning+). Idea events have no calendar row to mirror to.
    if (updated.calendarEventId != null) {
      await tx.calendarEvent.update({
        where: { id: updated.calendarEventId },
        data:  toCalendarFields(updated),
      });
      if (willService) {
        await syncServiceEvent(tx, ctx.orgId, updated.calendarEventId, updated);
      } else if (wasService) {
        await removeServiceEvent(tx, updated.calendarEventId);
      }
    }
  });

  const full = await loadTask(ctx, id);
  if (existing.calendarEventId != null) {
    await emit(ctx, "calendar.updated", { type: "CalendarEvent", id: existing.calendarEventId }, {
      title: full.title, changedFields,
    });
  }
  return full;
}

/**
 * Promote/demote engine. Crossing into Planning+ creates a CalendarEvent (and a
 * ServiceEvent for service-category events); dropping back to Idea deletes it.
 * Lateral moves among calendar-backed stages only flip the stage column.
 */
export async function setStage(ctx: RequestContext, id: number, input: SetStageInput) {
  const next = input.stage;
  if (!isProgrammingStage(next)) throw new ValidationError("Unknown stage");
  const pe = await requireProgrammingEvent(ctx, id);
  if (pe.stage === next) return toProgrammingTask(pe);

  const promoting = stageRequiresCalendar(next) && pe.calendarEventId == null;
  const demoting  = !stageRequiresCalendar(next) && pe.calendarEventId != null;

  if (promoting && !pe.date) {
    throw new ValidationError("A date is required to move an event out of Idea.");
  }
  // Promotion puts the event on the calendar — its date (set while in Idea, where
  // the bound isn't enforced) must fall within the active semester.
  if (promoting) await assertWithinActiveSemester(ctx, pe.date);

  if (next === "confirmed" && pe.stage === "planning") {
    const roomStatus = isRoomStatus(pe.roomStatus) ? pe.roomStatus : "not_submitted";
    const { done, total } = programmingPrepScore({ ...pe, roomStatus });
    if (done < total) {
      throw new ValidationError(
        `Finish the prep checklist before confirming — ${total - done} item${total - done === 1 ? "" : "s"} still need${total - done === 1 ? "s" : ""} to be checked off.`,
      );
    }
  }

  let createdCalendarId: number | null = null;
  let deletedCalendarId: number | null = null;

  await ctx.db.$transaction(async (tx) => {
    if (promoting) {
      const ce = await tx.calendarEvent.create({
        data: { organizationId: ctx.orgId, ...toCalendarFields(pe) },
      });
      await tx.programmingEvent.update({ where: { id }, data: { stage: next, calendarEventId: ce.id } });
      if (isServiceCategory(pe.category)) {
        await syncServiceEvent(tx, ctx.orgId, ce.id, pe);
      }
      createdCalendarId = ce.id;
    } else if (demoting) {
      const calId = pe.calendarEventId!;
      if (isServiceCategory(pe.category)) await removeServiceEvent(tx, calId);
      // Null the link first so the FK SET NULL doesn't race the row delete, then
      // remove the CalendarEvent (drops it from the Timeline).
      await tx.programmingEvent.update({ where: { id }, data: { stage: next, calendarEventId: null } });
      await tx.calendarEvent.delete({ where: { id: calId } });
      deletedCalendarId = calId;
    } else {
      await tx.programmingEvent.update({ where: { id }, data: { stage: next } });
    }
  });

  if (createdCalendarId != null) {
    await emit(ctx, "calendar.created", { type: "CalendarEvent", id: createdCalendarId }, {
      title: pe.title, date: pe.date ?? "", category: pe.category,
    });
  }
  if (deletedCalendarId != null) {
    await emit(ctx, "calendar.deleted", { type: "CalendarEvent", id: deletedCalendarId }, { title: pe.title });
  }
  return loadTask(ctx, id);
}

export async function deleteProgrammingTask(ctx: RequestContext, id: number) {
  const target = await requireProgrammingEvent(ctx, id);

  await ctx.db.$transaction(async (tx) => {
    if (target.calendarEventId != null) {
      if (isServiceCategory(target.category)) await removeServiceEvent(tx, target.calendarEventId);
      // Deleting the PE first would SET NULL then orphan the CalendarEvent; null
      // the link, delete the calendar row, then delete the PE (checklist + docs cascade).
      await tx.programmingEvent.update({ where: { id }, data: { calendarEventId: null } });
      await tx.calendarEvent.delete({ where: { id: target.calendarEventId } });
    }
    await tx.programmingEvent.delete({ where: { id } });
  });

  await emit(ctx, "programming.deleted", { type: "ProgrammingEvent", id }, { title: target.title });
  if (target.calendarEventId != null) {
    await emit(ctx, "calendar.deleted", { type: "CalendarEvent", id: target.calendarEventId }, { title: target.title });
  }
}

/* ---------------------------------------------------------------- */
/* Docs                                                              */
/* ---------------------------------------------------------------- */

export async function listProgrammingEventDocs(ctx: RequestContext, eventId: number) {
  await requireProgrammingEvent(ctx, eventId);
  const links = await ctx.db.programmingEventDoc.findMany({
    where:   { programmingEventId: eventId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { doc: true },
  }) as ProgrammingDocLinkWithDoc[];
  return links.map(link => link.doc);
}

export async function attachProgrammingDoc(ctx: RequestContext, eventId: number, input: AttachProgrammingDocInput) {
  await requireProgrammingEvent(ctx, eventId);
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
      data: { organizationId: ctx.orgId, programmingEventId: eventId, docId: doc.id },
    });
    return { doc, link };
  });
  await emit(ctx, "doc.created", { type: "Doc", id: doc.id }, { title: doc.title, url: doc.url });
  return doc;
}

export async function detachProgrammingDoc(ctx: RequestContext, eventId: number, docId: number) {
  await requireProgrammingEvent(ctx, eventId);
  const link = await ctx.db.programmingEventDoc.findFirst({
    where: { docId, programmingEventId: eventId },
    include: { doc: true },
  }) as ProgrammingDocLinkWithDoc | null;
  if (!link) throw new NotFoundError("Doc");
  await ctx.db.$transaction(async (tx) => {
    await tx.programmingEventDoc.delete({ where: { id: link.id } });
    await tx.doc.delete({ where: { id: docId } });
  });
  await emit(ctx, "doc.deleted", { type: "Doc", id: docId }, { title: link.doc.title });
}

/* ---------------------------------------------------------------- */
/* Checklist                                                        */
/* ---------------------------------------------------------------- */

export async function listChecklist(ctx: RequestContext, eventId: number) {
  await requireProgrammingEvent(ctx, eventId);
  return ctx.db.programmingChecklistItem.findMany({
    where:   { programmingEventId: eventId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select:  { id: true, label: true, done: true, sortOrder: true },
  });
}

export async function addChecklistItem(ctx: RequestContext, eventId: number, input: CreateChecklistItemInput) {
  await requireProgrammingEvent(ctx, eventId);
  const agg = await ctx.db.programmingChecklistItem.aggregate({
    where: { programmingEventId: eventId },
    _max:  { sortOrder: true },
  });
  const nextOrder = (agg._max?.sortOrder ?? -1) + 1;
  return ctx.db.programmingChecklistItem.create({
    data: { programmingEventId: eventId, label: input.label, sortOrder: nextOrder },
    select: { id: true, label: true, done: true, sortOrder: true },
  });
}

export async function updateChecklistItem(
  ctx: RequestContext,
  eventId: number,
  itemId: number,
  input: UpdateChecklistItemInput,
) {
  await requireProgrammingEvent(ctx, eventId);
  const item = await ctx.db.programmingChecklistItem.findFirst({
    where: { id: itemId, programmingEventId: eventId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError("Checklist item");
  return ctx.db.programmingChecklistItem.update({
    where: { id: itemId },
    data:  {
      ...(input.label !== undefined     ? { label: input.label } : {}),
      ...(input.done !== undefined      ? { done: input.done } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: { id: true, label: true, done: true, sortOrder: true },
  });
}

export async function deleteChecklistItem(ctx: RequestContext, eventId: number, itemId: number) {
  await requireProgrammingEvent(ctx, eventId);
  const item = await ctx.db.programmingChecklistItem.findFirst({
    where: { id: itemId, programmingEventId: eventId },
    select: { id: true },
  });
  if (!item) throw new NotFoundError("Checklist item");
  await ctx.db.programmingChecklistItem.delete({ where: { id: itemId } });
}
