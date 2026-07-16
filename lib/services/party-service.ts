import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { ExcuseStatus } from "@/lib/state";
import { getActiveSemester } from "@/lib/attendance";
import type { CreatePartyInput, UpdatePartyInput, WrapUpPartyInput } from "@/lib/validation/party";

export async function listParties(ctx: RequestContext) {
  return ctx.db.partyEvent.findMany({ orderBy: { id: "asc" } });
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
  const p = await ctx.db.partyEvent.create({
    data: {
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
  await emit(ctx, "party.created", { type: "PartyEvent", id: p.id }, { name: p.name, date: p.date });
  return p;
}

export async function updateParty(ctx: RequestContext, id: number, input: UpdatePartyInput) {
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

  const p = await ctx.db.partyEvent.update({ where: { id }, data });
  if (completing) {
    await emit(ctx, "party.completed", { type: "PartyEvent", id: p.id }, { name: p.name, date: p.date });
  } else {
    await emit(ctx, "party.updated", { type: "PartyEvent", id: p.id }, { name: p.name, changedFields });
  }
  return p;
}

export async function deleteParty(ctx: RequestContext, id: number) {
  const target = await ctx.db.partyEvent.findUnique({ where: { id }, select: { name: true, attendanceEventId: true } });
  if (!target) throw new NotFoundError("Party event");
  await ctx.db.partyEvent.delete({ where: { id } });
  // Clean up the backing attendance event (and its records cascade via FK) if one
  // was created. SetNull already detached the party side; remove the orphan event.
  if (target.attendanceEventId != null) {
    // Best-effort cleanup: the backing event may already be gone (SetNull detached
    // the party side). Stay non-throwing so the party delete still succeeds, but
    // surface a genuine DB failure through the structured pipeline rather than
    // swallowing it silently.
    await ctx.db.calendarEvent.delete({ where: { id: target.attendanceEventId } }).catch(e => {
      logError(e, {
        route: "lib/services/party-service",
        userId: ctx.actorId,
        requestId: ctx.requestId,
        extra: { fn: "deleteParty", partyId: id, attendanceEventId: target.attendanceEventId },
      });
    });
  }
  await emit(ctx, "party.deleted", { type: "PartyEvent", id }, { name: target.name });
}

/**
 * Wrap up a party: set its money fields + completed, and (optionally) record
 * member roll in the same call. Roll flows through the shared AttendanceRecord
 * system via a backing CalendarEvent created lazily the first time a party is
 * rolled. `mandatory` decides whether that roll counts toward the chapter-wide
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
  if (takingRoll && semester) {
    let eventId = party.attendanceEventId;
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
      await ctx.db.calendarEvent.update({ where: { id: eventId }, data: { mandatory: input.mandatory ?? false } });
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
  return updated;
}

/**
 * Upsert attendance for every eligible (non-ghost, non-excused) brother against a
 * party's backing calendar event. Mirrors attendance-service.recordAttendance's
 * upsert/eligibility, minus the mandatory guard — the event was created by us for
 * this purpose, and a party's mandatory flag is intentionally allowed to be false.
 */
async function recordPartyRoll(ctx: RequestContext, calendarEventId: number, semesterId: number, attendedIds: number[]) {
  const [excuses, brothers] = await Promise.all([
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId, semesterId, status: ExcuseStatus.Approved },
      select: { brotherId: true },
    }),
    ctx.db.brother.findMany({ where: { isGhost: false }, select: { id: true } }),
  ]);
  const excused = new Set(excuses.map(e => e.brotherId));
  const eligible = brothers.filter(b => !excused.has(b.id));
  const eligibleIds = eligible.map(b => b.id);
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
        data: eligible.map(b => ({
          calendarEventId,
          brotherId:  b.id,
          semesterId,
          attended:   attended.has(b.id),
        })),
      });
    }
  }, { timeout: 15_000 });
}
