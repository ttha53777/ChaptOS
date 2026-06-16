import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ExcuseStatus, CALENDAR_CATEGORIES } from "@/lib/state";
import { getActiveSemester } from "@/lib/attendance";
import type { RecordAttendanceInput } from "@/lib/validation/attendance";

export type AttendanceSummaryRow = {
  calendarEventId: number;
  present:         number;
  eligible:        number;
};

/**
 * Per-event present/eligible counts for every calendar event in a category,
 * aggregated in two queries instead of one round-trip per event.
 *
 * Tenancy: the attendance join tables have no organizationId column (they are
 * raw pass-throughs in lib/db/tenant.ts). Isolation comes from two org-scoped
 * anchors — the event-id set is read through the org-scoped ctx.db.calendarEvent,
 * and records are filtered by the org's active semesterId — so a record can never
 * match both this org's semester and a foreign event. Mirrors the guarantee the
 * /api/attendance/[eventId] route relies on, but batched.
 *
 * Returns [] when there is no active semester (rather than throwing) so a
 * page-wide summary degrades to blank counts instead of erroring.
 */
export async function summarizeAttendance(
  ctx: RequestContext,
  opts: { category?: string | null } = {},
): Promise<AttendanceSummaryRow[]> {
  const category =
    opts.category && (CALENDAR_CATEGORIES as readonly string[]).includes(opts.category)
      ? opts.category
      : undefined;

  const [events, semester] = await Promise.all([
    ctx.db.calendarEvent.findMany({
      where: category ? { category } : {},
      select: { id: true },
    }),
    getActiveSemester(ctx.orgId),
  ]);

  const eventIds = events.map(e => e.id);
  if (eventIds.length === 0 || !semester) {
    // No semester → no records to count; return zeroed rows so the caller still
    // learns which events exist.
    return eventIds.map(id => ({ calendarEventId: id, present: 0, eligible: 0 }));
  }

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

  // Excused brothers are dropped from both numerator and denominator, matching
  // the [eventId] route: eligible = records that aren't excused, present =
  // eligible AND attended.
  const excusedByEvent = new Map<number, Set<number>>();
  for (const e of excuses) {
    const set = excusedByEvent.get(e.calendarEventId) ?? new Set<number>();
    set.add(e.brotherId);
    excusedByEvent.set(e.calendarEventId, set);
  }

  const counts = new Map<number, { present: number; eligible: number }>();
  for (const id of eventIds) counts.set(id, { present: 0, eligible: 0 });
  for (const r of records) {
    const excused = excusedByEvent.get(r.calendarEventId);
    if (excused?.has(r.brotherId)) continue;
    const c = counts.get(r.calendarEventId);
    if (!c) continue;
    c.eligible += 1;
    if (r.attended) c.present += 1;
  }

  return eventIds.map(id => ({ calendarEventId: id, ...counts.get(id)! }));
}

export async function recordAttendance(ctx: RequestContext, input: RecordAttendanceInput) {
  const [event, semester] = await Promise.all([
    ctx.db.calendarEvent.findUnique({ where: { id: input.calendarEventId } }),
    getActiveSemester(ctx.orgId),
  ]);
  if (!event)            throw new NotFoundError("Event");
  if (!event.mandatory)  throw new ValidationError("Only mandatory events track attendance");
  if (!semester)         throw new ValidationError("No active semester");

  const [excuses, brothers] = await Promise.all([
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId: input.calendarEventId, semesterId: semester.id, status: ExcuseStatus.Approved },
    }),
    ctx.db.brother.findMany({ where: { isGhost: false }, select: { id: true } }),
  ]);
  const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
  const eligible = brothers.filter(b => !excusedBrotherIds.has(b.id));

  // The tenant $transaction wrapper takes a callback (it SET LOCALs the org id),
  // so run the upserts inside it rather than passing an operation array.
  await ctx.db.$transaction(async tx => {
    for (const b of eligible) {
      await tx.attendanceRecord.upsert({
        where:  { calendarEventId_brotherId: { calendarEventId: input.calendarEventId, brotherId: b.id } },
        update: { attended: input.attendedIds.includes(b.id) },
        create: {
          calendarEventId: input.calendarEventId,
          brotherId:       b.id,
          semesterId:      semester.id,
          attended:        input.attendedIds.includes(b.id),
        },
      });
    }
  });

  await emit(ctx, "attendance.recorded", { type: "CalendarEvent", id: event.id }, {
    calendarEventId: event.id,
    semesterId:      semester.id,
    eventTitle:      event.title,
    presentCount:    input.attendedIds.length,
    eligibleCount:   eligible.length,
  });

  // Handler ran the recalc; reload visible brothers for response.
  return ctx.db.brother.findMany({ where: { isGhost: false } });
}
