import { prisma } from "./prisma";

export async function getActiveSemester(orgId: number) {
  return prisma.semester.findFirst({ where: { organizationId: orgId, isActive: true } });
}

/**
 * The set of calendar-event ids (for one org) whose attendance counts toward the
 * chapter-wide ratio: mandatory events only. Optional events — including
 * non-mandatory party roll — are tracked but excluded from a brother's %.
 */
async function mandatoryEventIds(orgId: number): Promise<Set<number>> {
  const events = await prisma.calendarEvent.findMany({
    where: { organizationId: orgId, mandatory: true },
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
  brotherId: number,
  semesterId: number,
  orgId: number,
): Promise<number> {
  const [records, excuses, mandatory] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { brotherId, semesterId } }),
    prisma.attendanceExcuse.findMany({ where: { brotherId, semesterId, status: "approved" } }),
    mandatoryEventIds(orgId),
  ]);

  const excusedEventIds = new Set(excuses.map(e => e.calendarEventId));
  const eligible = records.filter(r => mandatory.has(r.calendarEventId) && !excusedEventIds.has(r.calendarEventId));

  const numerator   = eligible.filter(r => r.attended).length;
  const denominator = eligible.length;
  const ratio       = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

  // Scope the write to orgId so a bug in the caller cannot update a brother
  // from a different org.
  await prisma.brother.updateMany({
    where: { id: brotherId, organizationId: orgId },
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
  semesterId: number,
  orgId: number,
): Promise<void> {
  const [brothers, allRecords, allExcuses, mandatory] = await Promise.all([
    prisma.brother.findMany({
      where: { organizationId: orgId, isGhost: false },
      select: { id: true },
    }),
    prisma.attendanceRecord.findMany({ where: { semesterId } }),
    prisma.attendanceExcuse.findMany({ where: { semesterId, status: "approved" } }),
    mandatoryEventIds(orgId),
  ]);

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
  // cannot happen. The `organizationId` guard ensures we never update
  // brothers from a different org even if the semesterId were reused.
  const writes = Array.from(byRatio.entries()).map(([ratio, ids]) =>
    prisma.brother.updateMany({
      where: { id: { in: ids }, organizationId: orgId },
      data: { attendance: ratio },
    }),
  );

  if (writes.length > 0) {
    await prisma.$transaction(writes);
  }
}
