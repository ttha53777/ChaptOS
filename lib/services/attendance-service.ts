import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ExcuseStatus } from "@/lib/state";
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
  // Trust the category string as a plain WHERE filter — valid values are now
  // per-org CalendarEventType slugs, so custom categories must pass through.
  const category = opts.category || undefined;

  const [events, semester] = await Promise.all([
    ctx.db.calendarEvent.findMany({
      where: category ? { category } : {},
      select: { id: true },
    }),
    getActiveSemester(ctx.db),
  ]);

  const eventIds = events.map(e => e.id);
  if (eventIds.length === 0 || !semester) {
    // No semester → no records to count; return zeroed rows so the caller still
    // learns which events exist.
    return eventIds.map(id => ({ calendarEventId: id, present: 0, eligible: 0 }));
  }

  const [records, excuses, exemptions] = await Promise.all([
    ctx.db.attendanceRecord.findMany({
      where: { semesterId: semester.id, calendarEventId: { in: eventIds } },
      select: { calendarEventId: true, brotherId: true, attended: true },
    }),
    ctx.db.attendanceExcuse.findMany({
      where: { semesterId: semester.id, calendarEventId: { in: eventIds }, status: ExcuseStatus.Approved },
      select: { calendarEventId: true, brotherId: true },
    }),
    ctx.db.attendanceExemption.findMany({
      where: { semesterId: semester.id },
      select: { brotherId: true },
    }),
  ]);
  // Semester-exempt members are dropped from every event's numerator and
  // denominator (they hold no eligible-attendance obligation this term).
  const exemptBrotherIds = new Set(exemptions.map(e => e.brotherId));

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
    if (exemptBrotherIds.has(r.brotherId)) continue;
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
    getActiveSemester(ctx.db),
  ]);
  if (!event)            throw new NotFoundError("Event");
  if (!event.mandatory)  throw new ValidationError("Only mandatory events track attendance");
  if (!semester)         throw new ValidationError("No active semester");

  const [excuses, exemptions, brothers] = await Promise.all([
    ctx.db.attendanceExcuse.findMany({
      where: { calendarEventId: input.calendarEventId, semesterId: semester.id, status: ExcuseStatus.Approved },
    }),
    ctx.db.attendanceExemption.findMany({
      where: { semesterId: semester.id },
      select: { brotherId: true },
    }),
    ctx.db.brother.findMany({ where: { isGhost: false }, select: { id: true } }),
  ]);
  const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
  const exemptBrotherIds  = new Set(exemptions.map(e => e.brotherId));
  // Eligible = non-ghost members, minus per-event excused, minus semester-exempt.
  const eligible = brothers.filter(b => !excusedBrotherIds.has(b.id) && !exemptBrotherIds.has(b.id));
  const eligibleIds = eligible.map(b => b.id);
  const attendedSet = new Set(input.attendedIds);

  // Set-based writes: two statements regardless of roster size. A per-member
  // upsert loop here 500s (P2024 transaction timeout) once a chapter passes ~60
  // members, because each upsert is a serial round-trip inside the transaction.
  // The tenant $transaction wrapper takes a callback (it SET LOCALs the org id).
  await ctx.db.$transaction(async tx => {
    // Only the eligible members' rows for THIS event. Excused members are absent
    // from eligibleIds, so their pre-existing rows are left intact — same
    // semantics as the old upsert loop, which also skipped excused brothers.
    await tx.attendanceRecord.deleteMany({
      where: { calendarEventId: input.calendarEventId, brotherId: { in: eligibleIds } },
    });
    if (eligibleIds.length > 0) {
      await tx.attendanceRecord.createMany({
        data: eligible.map(b => ({
          calendarEventId: input.calendarEventId,
          brotherId:       b.id,
          semesterId:      semester.id,
          attended:        attendedSet.has(b.id),
        })),
      });
    }
  }, { timeout: 15_000 });

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
