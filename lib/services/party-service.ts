import { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ExcuseStatus } from "@/lib/state";
import { getActiveSemester } from "@/lib/attendance";
import type { CreatePartyInput, UpdatePartyInput, WrapUpPartyInput } from "@/lib/validation/party";
import { assertWithinActiveSemester } from "./semester-bounds";

export async function listParties(ctx: RequestContext) {
  const parties = await ctx.db.partyEvent.findMany({ orderBy: { id: "asc" } });
  const events = await ctx.db.calendarEvent.findMany({
    where: { id: { in: parties.flatMap(p => p.attendanceEventId == null ? [] : [p.attendanceEventId]) } },
    select: { id: true, mandatory: true },
  });
  const mandatory = new Map(events.map(event => [event.id, event.mandatory]));
  return parties.map(party => ({ ...party, mandatory: mandatory.get(party.attendanceEventId ?? -1) ?? false }));
}

export type PartyAttendanceRow = { partyId: number; present: number; eligible: number };

/**
 * Present/eligible member counts for every party that has roll logged, for the
 * org's active semester. Mirrors summarizeAttendance's two-anchor tenancy: the
 * party rows (and their backing event ids) come through org-scoped ctx.db, and
 * records are filtered by the org's active semesterId, so a record can never
 * match both this org's semester and a foreign event. Returns [] when there is
 * no active semester or no rolled parties.
 */
export async function summarizePartyAttendance(ctx: RequestContext): Promise<PartyAttendanceRow[]> {
  const [parties, semester] = await Promise.all([
    ctx.db.partyEvent.findMany({
      where: { attendanceEventId: { not: null } },
      select: { id: true, attendanceEventId: true },
    }),
    getActiveSemester(ctx.db),
  ]);
  const linked = parties.flatMap(p => p.attendanceEventId != null ? [{ id: p.id, eventId: p.attendanceEventId }] : []);
  if (linked.length === 0 || !semester) return [];

  const eventIds = linked.map(p => p.eventId);
  const [records, excuses] = await Promise.all([
    ctx.db.attendanceRecord.findMany({
      where: { semesterId: semester.id, calendarEventId: { in: eventIds } },
      select: { calendarEventId: true, brotherId: true, attended: true },
    }),
    ctx.db.attendanceExcuse.findMany({
      where: { semesterId: semester.id, calendarEventId: { in: eventIds }, status: ExcuseStatus.Approved },
      select: { calendarEventId: true, brotherId: true },
    }),
  ]);

  const excusedByEvent = new Map<number, Set<number>>();
  for (const e of excuses) {
    const set = excusedByEvent.get(e.calendarEventId) ?? new Set<number>();
    set.add(e.brotherId);
    excusedByEvent.set(e.calendarEventId, set);
  }
  const counts = new Map<number, { present: number; eligible: number }>();
  for (const r of records) {
    const excused = excusedByEvent.get(r.calendarEventId);
    if (excused?.has(r.brotherId)) continue;
    const c = counts.get(r.calendarEventId) ?? { present: 0, eligible: 0 };
    c.eligible += 1;
    if (r.attended) c.present += 1;
    counts.set(r.calendarEventId, c);
  }

  return linked
    .map(p => ({ partyId: p.id, ...(counts.get(p.eventId) ?? { present: 0, eligible: 0 }) }))
    .filter(row => row.eligible > 0);
}

export async function createParty(ctx: RequestContext, input: CreatePartyInput) {
  await assertWithinActiveSemester(ctx, input.date);
  const p = await ctx.db.$transaction(async tx => {
    const event = await tx.calendarEvent.create({ data: {
      organizationId: ctx.orgId, title: input.name, date: input.date,
      category: "party", mandatory: false,
    } });
    return tx.partyEvent.create({
      data: {
        organizationId: ctx.orgId,
        attendanceEventId: event.id,
        name:        input.name,
        date:        input.date,
        partyType:   input.partyType === "Closed" ? "Closed" : "Open",
        theme:       input.theme     ?? "",
        collabOrg:   input.collabOrg ?? "",
        doorRevenue: input.doorRevenue,
        attendance:  input.attendance,
        expenses:    input.expenses,
        notes:       input.notes ?? "",
        completed:   false,
      },
    });
  });
  await emit(ctx, "party.created", { type: "PartyEvent", id: p.id }, { name: p.name, date: p.date });
  return p;
}

export async function updateParty(ctx: RequestContext, id: number, input: UpdatePartyInput) {
  if (input.date != null) await assertWithinActiveSemester(ctx, input.date);
  const data: Prisma.PartyEventUpdateInput = {};
  const changedFields: string[] = [];
  const completing = input.completed === true;

  for (const k of Object.keys(input) as (keyof UpdatePartyInput)[]) {
    if (input[k] === undefined) continue;
    if (k === "completed") continue; // handled separately below
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)[k] = input[k];
    changedFields.push(k);
  }
  if (input.completed !== undefined) {
    data.completed = completing;
    data.completedAt = completing ? new Date() : null;
    changedFields.push("completed");
  }

  const target = await ctx.db.partyEvent.findUnique({ where: { id }, select: { attendanceEventId: true } });
  if (!target) throw new NotFoundError("Party event");
  // Canonical schedule and ledger commit together. A post-commit handler cannot
  // be the only path: a restart there would leave the durable feed stale.
  const p = await ctx.db.$transaction(async tx => {
    if (target.attendanceEventId && (input.name !== undefined || input.date !== undefined)) {
      await tx.calendarEvent.update({ where: { id: target.attendanceEventId, organizationId: ctx.orgId }, data: {
        ...(input.name !== undefined ? { title: input.name } : {}),
        ...(input.date !== undefined ? { date: input.date } : {}),
      } });
    }
    return tx.partyEvent.update({ where: { id, organizationId: ctx.orgId }, data });
  });
  await emit(ctx, "party.updated", { type: "PartyEvent", id: p.id }, { name: p.name, changedFields }, { activity: !completing });
  if (completing) {
    await emit(ctx, "party.completed", { type: "PartyEvent", id: p.id }, { name: p.name, date: p.date });
  }
  return p;
}

export async function deleteParty(ctx: RequestContext, id: number) {
  const target = await ctx.db.partyEvent.findUnique({ where: { id }, select: { name: true, attendanceEventId: true } });
  if (!target) throw new NotFoundError("Party event");
  await ctx.db.$transaction(async tx => {
    if (target.attendanceEventId != null) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "CalendarEvent" WHERE id = ${target.attendanceEventId} AND "organizationId" = ${ctx.orgId} FOR UPDATE`);
      const where = { calendarEventId: target.attendanceEventId, calendarEvent: { organizationId: ctx.orgId } };
      await tx.attendanceRecord.deleteMany({ where });
      await tx.attendanceExcuse.deleteMany({ where });
      await tx.programmingEvent.updateMany({
        where: { calendarEventId: target.attendanceEventId, organizationId: ctx.orgId },
        data: { stage: "idea", calendarEventId: null },
      });
    }
    await tx.partyEvent.delete({ where: { id, organizationId: ctx.orgId } });
    if (target.attendanceEventId != null) {
      await tx.calendarEvent.deleteMany({ where: { id: target.attendanceEventId, organizationId: ctx.orgId } });
    }
  });
  if (target.attendanceEventId != null) {
    await emit(ctx, "calendar.deleted", { type: "CalendarEvent", id: target.attendanceEventId }, { title: target.name });
  }
  await emit(ctx, "party.deleted", { type: "PartyEvent", id }, { name: target.name });
}

/**
 * Wrap up a party: set its money fields + completed, and (optionally) record
 * member roll in the same call. Roll flows through the shared AttendanceRecord
 * system via its linked CalendarEvent (created lazily only for legacy rows).
 * `mandatory` decides whether that roll counts toward the chapter-wide
 * attendance % (lib/attendance.ts counts mandatory events only).
 *
 * Roll requires an active semester — when attendedIds is provided but there is
 * none, we throw rather than silently completing money-only (user decision).
 * If the party already has a backing event we update its roll in place and do
 * not create a second one.
 */
export async function wrapUpParty(ctx: RequestContext, id: number, input: WrapUpPartyInput) {
  const party = await ctx.db.partyEvent.findUnique({
    where: { id },
    select: { id: true, name: true, date: true, attendanceEventId: true },
  });
  if (!party) throw new NotFoundError("Party event");

  const takingRoll = input.attendedIds !== undefined;
  const semester = takingRoll ? await getActiveSemester(ctx.db) : null;
  if (takingRoll && !semester) {
    throw new ValidationError("Set an active semester before recording party attendance");
  }

  // 1. Money + completed.
  const updated = await ctx.db.partyEvent.update({
    where: { id },
    data: {
      doorRevenue: input.doorRevenue,
      expenses:    input.expenses,
      notes:       input.notes ?? "",
      completed:   true,
      completedAt: new Date(),
    },
  });

  // 2. Roll (optional).
  let eventId = party.attendanceEventId;
  if (takingRoll && semester) {
    if (eventId == null) {
      const event = await ctx.db.calendarEvent.create({
        data: {
          title:     party.name,
          date:      party.date,
          category:  "party",
          mandatory: input.mandatory ?? false,
          location:  "",
        },
      });
      eventId = event.id;
      await ctx.db.partyEvent.update({ where: { id }, data: { attendanceEventId: eventId } });
    } else {
      // Existing backing event: keep its mandatory flag in sync with the toggle.
      if (input.mandatory !== undefined) {
        await ctx.db.calendarEvent.update({ where: { id: eventId }, data: { mandatory: input.mandatory } });
      }
    }
    await recordPartyRoll(ctx, eventId, semester.id, input.attendedIds ?? []);
    await emit(ctx, "attendance.recorded", { type: "CalendarEvent", id: eventId }, {
      calendarEventId: eventId,
      semesterId:      semester.id,
      eventTitle:      party.name,
      presentCount:    (input.attendedIds ?? []).length,
      eligibleCount:   0, // recompute handler reads the truth; this is informational only
    });
  }

  await emit(ctx, "party.completed", { type: "PartyEvent", id: updated.id }, { name: updated.name, date: updated.date });
  const event = eventId == null ? null : await ctx.db.calendarEvent.findUnique({ where: { id: eventId }, select: { mandatory: true } });
  return { ...updated, attendanceEventId: eventId, mandatory: event?.mandatory ?? false };
}

/**
 * Upsert attendance for every eligible (non-ghost, non-excused) brother against a
 * party's backing calendar event. Mirrors attendance-service.recordAttendance's
 * upsert/eligibility, minus the mandatory guard — the event was created by us for
 * this purpose, and a party's mandatory flag is intentionally allowed to be false.
 */
async function recordPartyRoll(ctx: RequestContext, calendarEventId: number, semesterId: number, attendedIds: number[]) {
  const [excuses, brotherIds] = await Promise.all([
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId, semesterId, status: ExcuseStatus.Approved },
      select: { brotherId: true },
    }),
    ctx.db.member.listIds(),
  ]);
  const excused = new Set(excuses.map(e => e.brotherId));
  const eligible = brotherIds.filter(id => !excused.has(id));
  const eligibleIds = eligible;
  const attended = new Set(attendedIds);

  // Set-based writes: two statements regardless of roster size. A per-member upsert
  // loop here 500s (P2024 transaction timeout) once a chapter passes ~60 members —
  // same fix attendance-service.recordAttendance already applies. The tenant
  // $transaction wrapper takes a callback (it SET LOCALs the org id). Excused
  // members are absent from eligibleIds, so their pre-existing rows are left intact.
  await ctx.db.$transaction(async tx => {
    await tx.attendanceRecord.deleteMany({
      where: { calendarEventId, brotherId: { in: eligibleIds } },
    });
    if (eligibleIds.length > 0) {
      await tx.attendanceRecord.createMany({
        data: eligible.map(brotherId => ({
          calendarEventId,
          brotherId,
          semesterId,
          attended:   attended.has(brotherId),
        })),
      });
    }
  }, { timeout: 15_000 });
}
