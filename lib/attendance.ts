import { db } from "@/lib/db";
import { ATTENDANCE_EXEMPT } from "@/lib/thresholds";

export { ATTENDANCE_EXEMPT };

/** Org-scoped data accessor (same shape as ctx.db). */
type Scoped = ReturnType<typeof db>;

export async function getActiveSemester(scoped: Scoped) {
  return scoped.semester.findFirst({ where: { isActive: true } });
}

/**
 * The set of calendar-event ids (for one org) whose attendance counts toward the
 * chapter-wide ratio: mandatory events only. Optional events — including
 * non-mandatory party roll — are tracked but excluded from a brother's %.
 */
async function mandatoryEventIds(scoped: Scoped): Promise<Set<number>> {
  const events = await scoped.calendarEvent.findMany({
    where: { mandatory: true },
    select: { id: true },
  });
  return new Set(events.map(e => e.id));
}

/**
 * Recompute one brother's attendance ratio for the semester.
 * Reads only records/excuses belonging to that brother; writes only that
 * brother's row and scopes the update to the owning org. Only mandatory events
 * count toward the ratio (optional events / optional party roll are excluded).
 */
export async function recalcBrotherAttendance(
  scoped: Scoped,
  brotherId: number,
  semesterId: number,
): Promise<number> {
  const [records, excuses, exemption, mandatory] = await Promise.all([
    // Relation-scoped wrappers AND the org via the record's/excuse's parent, so
    // these bare brotherId/semesterId reads stay org-safe.
    scoped.attendanceRecord.findMany({ where: { brotherId, semesterId } }),
    scoped.attendanceExcuse.findMany({ where: { brotherId, semesterId, status: "approved" } }),
    scoped.attendanceExemption.findFirst({ where: { brotherId, semesterId }, select: { id: true } }),
    mandatoryEventIds(scoped),
  ]);

  // Exempt this semester → park at the sentinel, skip the ratio math entirely.
  if (exemption) {
    await scoped.brother.updateMany({ where: { id: brotherId }, data: { attendance: ATTENDANCE_EXEMPT } });
    return ATTENDANCE_EXEMPT;
  }

  const excusedEventIds = new Set(excuses.map(e => e.calendarEventId));
  const eligible = records.filter(r => mandatory.has(r.calendarEventId) && !excusedEventIds.has(r.calendarEventId));

  const numerator   = eligible.filter(r => r.attended).length;
  const denominator = eligible.length;
  const ratio       = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

  // The scoped wrapper injects organizationId, so a brother from another org
  // matches zero rows rather than being updated.
  await scoped.brother.updateMany({
    where: { id: brotherId },
    data: { attendance: ratio },
  });

  return ratio;
}

/**
 * Recompute every non-ghost brother's attendance ratio for the semester.
 *
 * Strategy: fetch all records + excuses in two queries, compute ratios in
 * memory grouped by distinct ratio value, then issue one updateMany per
 * distinct value.  This reduces N individual UPDATEs to at most ~101 batch
 * statements (one per 0–100 percentage point) regardless of chapter size.
 *
 * All writes go inside a single $transaction so either every brother's ratio
 * updates or none do.
 */
export async function recalcAllBrothersInSemester(
  scoped: Scoped,
  semesterId: number,
): Promise<void> {
  const [brothers, allRecords, allExcuses, allExemptions, mandatory] = await Promise.all([
    scoped.brother.findMany({
      where: { isGhost: false },
      select: { id: true },
    }),
    scoped.attendanceRecord.findMany({ where: { semesterId } }),
    scoped.attendanceExcuse.findMany({ where: { semesterId, status: "approved" } }),
    scoped.attendanceExemption.findMany({ where: { semesterId }, select: { brotherId: true } }),
    mandatoryEventIds(scoped),
  ]);

  const exemptBrotherIds = new Set(allExemptions.map(e => e.brotherId));

  const recordsByBrother  = new Map<number, typeof allRecords>();
  const excusedByBrother  = new Map<number, Set<number>>();

  for (const r of allRecords) {
    const arr = recordsByBrother.get(r.brotherId) ?? [];
    arr.push(r);
    recordsByBrother.set(r.brotherId, arr);
  }
  for (const e of allExcuses) {
    const set = excusedByBrother.get(e.brotherId) ?? new Set<number>();
    set.add(e.calendarEventId);
    excusedByBrother.set(e.brotherId, set);
  }

  // Group brother IDs by computed ratio so we can batch updateMany per ratio value.
  const byRatio = new Map<number, number[]>();
  for (const b of brothers) {
    // Exempt this semester → the sentinel bucket, no ratio math.
    if (exemptBrotherIds.has(b.id)) {
      const ids = byRatio.get(ATTENDANCE_EXEMPT) ?? [];
      ids.push(b.id);
      byRatio.set(ATTENDANCE_EXEMPT, ids);
      continue;
    }
    const records  = recordsByBrother.get(b.id) ?? [];
    const excused  = excusedByBrother.get(b.id) ?? new Set<number>();
    const eligible = records.filter(r => mandatory.has(r.calendarEventId) && !excused.has(r.calendarEventId));
    const num      = eligible.filter(r => r.attended).length;
    const den      = eligible.length;
    const ratio    = den === 0 ? 0 : Math.round((num / den) * 100);
    const ids      = byRatio.get(ratio) ?? [];
    ids.push(b.id);
    byRatio.set(ratio, ids);
  }

  // One updateMany per distinct ratio. In a transaction so partial commits
  // cannot happen, and via scoped.$transaction so app.org_id is set for the
  // batch. The tx client is raw, so the `organizationId` guard stays explicit —
  // it ensures we never update brothers from a different org even if the
  // semesterId were reused.
  const entries = Array.from(byRatio.entries());
  if (entries.length > 0) {
    await scoped.$transaction(async tx => {
      for (const [ratio, ids] of entries) {
        await tx.brother.updateMany({
          where: { id: { in: ids }, organizationId: scoped.orgId },
          data: { attendance: ratio },
        });
      }
    });
  }
}
