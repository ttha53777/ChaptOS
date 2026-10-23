import { Prisma } from "@/app/generated/prisma/client";
import { scheduleEndTime, scheduleSchema, scheduleTime, wallTimeToInstant, type Schedule } from "@/lib/calendar-feed/schedule";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { fromCents, kindOf, toCents } from "@/lib/fundraisers";
import type { Fundraiser as FundraiserDTO, FundraiserKind } from "@/lib/api-types/fundraisers";
import type { AddSupplyInput, CreateFundraiserInput, UpdateFundraiserInput, UpdateSupplyInput, WrapFundraiserInput } from "@/lib/validation/fundraiser";
import { assertWithinActiveSemester } from "./semester-bounds";

// Fundraisers keep their own three numbers and never touch Treasury. Scheduling
// (title/date/time/place) lives on the mirrored CalendarEvent; this service
// writes both rows in one transaction, like service events.

const INCLUDE = {
  calendarEvent: { select: { title: true, date: true, location: true, schedule: true } },
  supplies: { orderBy: [{ position: "asc" }, { id: "asc" }] },
} as const satisfies Prisma.FundraiserInclude;

type Row = Prisma.FundraiserGetPayload<{ include: typeof INCLUDE }>;

function toDTO(row: Row): FundraiserDTO {
  const schedule = parseSchedule(row.calendarEvent.schedule);
  const spentCents = row.supplies.reduce((a, s) => a + s.costCents, 0);
  const wrapped = row.wrappedAt != null && row.cameInCents != null;
  return {
    id:              row.id,
    calendarEventId: row.calendarEventId,
    name:            row.calendarEvent.title,
    date:            row.calendarEvent.date,
    startTime:       schedule ? scheduleTime(schedule) : null,
    endTime:         schedule ? scheduleEndTime(schedule) : null,
    place:           row.calendarEvent.location,
    kind:            row.kind as FundraiserKind,
    goal:            row.goalCents == null ? null : fromCents(row.goalCents),
    supplies:        row.supplies.map(s => ({ id: s.id, name: s.name, cost: fromCents(s.costCents), position: s.position })),
    spent:           fromCents(spentCents),
    cameIn:          wrapped ? fromCents(row.cameInCents!) : null,
    made:            wrapped ? fromCents(row.cameInCents! - spentCents) : null,
    wrappedAt:       wrapped ? row.wrappedAt!.toISOString() : null,
    createdAt:       row.createdAt.toISOString(),
  };
}

function parseSchedule(value: Prisma.JsonValue): Schedule | null {
  if (value == null) return null;
  const parsed = scheduleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A start time makes the event timed in the viewer's zone; no time means all day. */
function buildSchedule(date: string, startTime: string | null | undefined, endTime: string | null | undefined, timeZone: string | null | undefined): Schedule | null {
  if (!startTime) return null;
  if (!timeZone) throw new ValidationError("A time zone is needed with a start time.");
  try {
    const start = wallTimeToInstant(`${date}T${startTime}`, timeZone);
    const end = endTime ? wallTimeToInstant(`${date}T${endTime}`, timeZone) : undefined;
    return scheduleSchema.parse({ kind: "timed", start, ...(end && { end }), timeZone });
  } catch {
    throw new ValidationError("That time doesn't exist on that day (a clock change). Pick another.");
  }
}

async function load(ctx: RequestContext, id: number): Promise<Row> {
  const row = await ctx.db.fundraiser.findFirst({ where: { id }, include: INCLUDE });
  if (!row) throw new NotFoundError("Fundraiser");
  return row;
}

export async function listFundraisers(ctx: RequestContext): Promise<FundraiserDTO[]> {
  const rows = await ctx.db.fundraiser.findMany({ include: INCLUDE });
  return rows.map(toDTO).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

export async function getFundraiser(ctx: RequestContext, id: number): Promise<FundraiserDTO> {
  return toDTO(await load(ctx, id));
}

export async function createFundraiser(ctx: RequestContext, input: CreateFundraiserInput): Promise<FundraiserDTO> {
  // Guard before the transaction so neither row is written out of term.
  await assertWithinActiveSemester(ctx, input.date);
  const schedule = buildSchedule(input.date, input.startTime, input.endTime, input.timeZone);
  const orgId = ctx.orgId;

  const fundraiser = await ctx.db.$transaction(async (tx) => {
    const calendarEvent = await tx.calendarEvent.create({
      data: {
        organizationId: orgId,
        title:     input.name,
        date:      input.date,
        schedule:  schedule ?? Prisma.DbNull,
        time:      schedule ? scheduleTime(schedule) : null,
        category:  "fundraising",
        mandatory: false,
        location:  input.place || null,
      },
    });
    return tx.fundraiser.create({
      data: {
        organizationId:  orgId,
        calendarEventId: calendarEvent.id,
        kind:            input.kind ?? kindOf(input.name),
        goalCents:       input.goal ? toCents(input.goal) : null,
        createdById:     ctx.actorId,
      },
    });
  });

  await emit(ctx, "fundraiser.created", { type: "Fundraiser", id: fundraiser.id }, {
    name: input.name, date: input.date, calendarEventId: fundraiser.calendarEventId,
  });
  return getFundraiser(ctx, fundraiser.id);
}

export async function updateFundraiser(ctx: RequestContext, id: number, input: UpdateFundraiserInput): Promise<FundraiserDTO> {
  const existing = await load(ctx, id);
  if (input.date !== undefined && input.date !== existing.calendarEvent.date) await assertWithinActiveSemester(ctx, input.date);

  const changedFields = (Object.keys(input) as (keyof UpdateFundraiserInput)[]).filter(k => input[k] !== undefined && k !== "timeZone");
  const calData: Prisma.CalendarEventUpdateInput = {};
  if (input.name  !== undefined) calData.title    = input.name;
  if (input.date  !== undefined) calData.date     = input.date;
  if (input.place !== undefined) calData.location = input.place || null;
  // Any timing field re-derives the whole schedule from date + start/end.
  if (input.date !== undefined || input.startTime !== undefined || input.endTime !== undefined) {
    const current = parseSchedule(existing.calendarEvent.schedule);
    const date  = input.date ?? existing.calendarEvent.date;
    const start = input.startTime !== undefined ? input.startTime : current ? scheduleTime(current) : null;
    const end   = input.endTime   !== undefined ? input.endTime   : current ? scheduleEndTime(current) : null;
    const zone  = input.timeZone ?? (current?.kind === "timed" ? current.timeZone : undefined);
    if (end && (!start || end <= start)) throw new ValidationError("End must be after start.");
    const schedule = buildSchedule(date, start, end, zone);
    calData.schedule = schedule ?? Prisma.DbNull;
    calData.time = schedule ? scheduleTime(schedule) : null;
  }
  const data: Prisma.FundraiserUncheckedUpdateInput = {};
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.goal !== undefined) data.goalCents = input.goal ? toCents(input.goal) : null;

  await ctx.db.$transaction(async (tx) => {
    // Both ids come from the org-scoped load above.
    if (Object.keys(calData).length) await tx.calendarEvent.update({ where: { id: existing.calendarEventId }, data: calData });
    if (Object.keys(data).length) await tx.fundraiser.update({ where: { id }, data });
  });

  await emit(ctx, "fundraiser.updated", { type: "Fundraiser", id }, { name: input.name ?? existing.calendarEvent.title, changedFields });
  return getFundraiser(ctx, id);
}

export async function deleteFundraiser(ctx: RequestContext, id: number): Promise<void> {
  const existing = await load(ctx, id);
  // The calendar row owns the fundraiser: deleting it cascades the fundraiser and its list.
  await ctx.db.calendarEvent.delete({ where: { id: existing.calendarEventId } });
  await emit(ctx, "fundraiser.deleted", { type: "Fundraiser", id }, { name: existing.calendarEvent.title });
}

function assertOpen(row: Row) {
  if (row.wrappedAt) throw new ConflictError("This fundraiser is wrapped up. Reopen it to change the shopping list.");
}

export async function addSupply(ctx: RequestContext, id: number, input: AddSupplyInput): Promise<FundraiserDTO> {
  const row = await load(ctx, id);
  assertOpen(row);
  const position = row.supplies.reduce((m, s) => Math.max(m, s.position + 1), 0);
  await ctx.db.fundraiserSupply.create({ data: { fundraiserId: id, name: input.name, costCents: toCents(input.cost), position } });
  return getFundraiser(ctx, id);
}

export async function updateSupply(ctx: RequestContext, id: number, supplyId: number, input: UpdateSupplyInput): Promise<FundraiserDTO> {
  const row = await load(ctx, id);
  assertOpen(row);
  if (!row.supplies.some(s => s.id === supplyId)) throw new NotFoundError("Supply");
  const data: Prisma.FundraiserSupplyUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.cost !== undefined) data.costCents = toCents(input.cost);
  if (Object.keys(data).length) await ctx.db.fundraiserSupply.update({ where: { id: supplyId }, data });
  return getFundraiser(ctx, id);
}

export async function removeSupply(ctx: RequestContext, id: number, supplyId: number): Promise<FundraiserDTO> {
  const row = await load(ctx, id);
  assertOpen(row);
  if (!row.supplies.some(s => s.id === supplyId)) throw new NotFoundError("Supply");
  await ctx.db.fundraiserSupply.delete({ where: { id: supplyId } });
  return getFundraiser(ctx, id);
}

export async function wrapUpFundraiser(ctx: RequestContext, id: number, input: WrapFundraiserInput): Promise<FundraiserDTO> {
  const row = await load(ctx, id);
  if (row.wrappedAt) throw new ConflictError("Already wrapped up. Reopen it to change the total.");
  const cameInCents = toCents(input.cameIn);
  const spentCents = row.supplies.reduce((a, s) => a + s.costCents, 0);
  await ctx.db.fundraiser.update({ where: { id }, data: { cameInCents, wrappedAt: new Date() } });
  const madeCents = cameInCents - spentCents;
  await emit(ctx, "fundraiser.wrapped", { type: "Fundraiser", id }, {
    name: row.calendarEvent.title, cameInCents, spentCents, madeCents,
  }, { activityType: madeCents < 0 ? "warning" : "success" });
  return getFundraiser(ctx, id);
}

export async function reopenFundraiser(ctx: RequestContext, id: number): Promise<FundraiserDTO> {
  const row = await load(ctx, id);
  if (!row.wrappedAt) return toDTO(row);
  await ctx.db.fundraiser.update({ where: { id }, data: { cameInCents: null, wrappedAt: null } });
  await emit(ctx, "fundraiser.reopened", { type: "Fundraiser", id }, { name: row.calendarEvent.title });
  return getFundraiser(ctx, id);
}
