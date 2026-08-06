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
    await scoped.member.updateManyByBrotherIds([brotherId], { attendance: ATTENDANCE_EXEMPT });
    return ATTENDANCE_EXEMPT;
  }

  const excusedEventIds = new Set(excuses.map(e => e.calendarEventId));
  const eligible = records.filter(r => mandatory.has(r.calendarEventId) && !excusedEventIds.has(r.calendarEventId));

  const numerator   = eligible.filter(r => r.attended).length;
  const denominator = eligible.length;
  const ratio       = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

  // Writes the ratio onto this org's roster row (Membership), not onto the
  // shared account — the same person can carry a different attendance % in
  // every chapter they belong to. The scoped delegate injects organizationId,
  // so a brother who is not on THIS roster matches zero rows.
  await scoped.member.updateManyByBrotherIds([brotherId], { attendance: ratio });

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
  const [brotherIds, allRecords, allExcuses, allExemptions, mandatory] = await Promise.all([
    // Everyone on THIS org's roster — ghosts excluded, as before.
    scoped.member.listIds(),
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
  for (const brotherId of brotherIds) {
    // Exempt this semester → the sentinel bucket, no ratio math.
    if (exemptBrotherIds.has(brotherId)) {
      const ids = byRatio.get(ATTENDANCE_EXEMPT) ?? [];
      ids.push(brotherId);
      byRatio.set(ATTENDANCE_EXEMPT, ids);
      continue;
    }
    const records  = recordsByBrother.get(brotherId) ?? [];
    const excused  = excusedByBrother.get(brotherId) ?? new Set<number>();
    const eligible = records.filter(r => mandatory.has(r.calendarEventId) && !excused.has(r.calendarEventId));
    const num      = eligible.filter(r => r.attended).length;
    const den      = eligible.length;
    const ratio    = den === 0 ? 0 : Math.round((num / den) * 100);
    const ids      = byRatio.get(ratio) ?? [];
    ids.push(brotherId);
    byRatio.set(ratio, ids);
  }

  // One updateMany per distinct ratio. In a transaction so partial commits
  // cannot happen, and via scoped.$transaction so app.org_id is set for the
  // batch. The tx client is raw, so the roster writes go through
  // member.onTx(tx) rather than a hand-written WHERE: on Membership, an
  // updateMany that forgot organizationId would rewrite this person's
  // attendance in every chapter they belong to.
  const entries = Array.from(byRatio.entries());
  if (entries.length > 0) {
    await scoped.$transaction(async tx => {
      const member = scoped.member.onTx(tx);
      for (const [ratio, ids] of entries) {
        await member.updateManyByBrotherIds(ids, { attendance: ratio });
      }
    });
  }
}
