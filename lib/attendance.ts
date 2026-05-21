import { prisma } from "./prisma";

export async function getActiveSemester() {
  return prisma.semester.findFirst({ where: { isActive: true } });
}

/**
 * Compute one brother's attendance ratio from their records/excuses for the semester
 * and write it. Single update — atomic by itself.
 */
export async function recalcBrotherAttendance(brotherId: number, semesterId: number): Promise<number> {
  const [records, excuses] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { brotherId, semesterId } }),
    prisma.attendanceExcuse.findMany({ where: { brotherId, semesterId, status: "approved" } }),
  ]);

  const excusedEventIds = new Set(excuses.map(e => e.calendarEventId));
  const eligible = records.filter(r => !excusedEventIds.has(r.calendarEventId));

  const numerator = eligible.filter(r => r.attended).length;
  const denominator = eligible.length;
  const ratio = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

  await prisma.brother.update({ where: { id: brotherId }, data: { attendance: ratio } });
  return ratio;
}

/**
 * Recompute every brother's attendance for the semester. All ratios are computed
 * up front, then committed inside a single `$transaction` so either every row
 * updates or none do (no partial commits on transient failure).
 */
export async function recalcAllBrothersInSemester(semesterId: number): Promise<void> {
  const [brothers, allRecords, allExcuses] = await Promise.all([
    prisma.brother.findMany({ select: { id: true } }),
    prisma.attendanceRecord.findMany({ where: { semesterId } }),
    prisma.attendanceExcuse.findMany({ where: { semesterId, status: "approved" } }),
  ]);

  const recordsByBrother = new Map<number, typeof allRecords>();
  for (const r of allRecords) {
    const arr = recordsByBrother.get(r.brotherId) ?? [];
    arr.push(r);
    recordsByBrother.set(r.brotherId, arr);
  }
  const excusedEventIdsByBrother = new Map<number, Set<number>>();
  for (const e of allExcuses) {
    const set = excusedEventIdsByBrother.get(e.brotherId) ?? new Set<number>();
    set.add(e.calendarEventId);
    excusedEventIdsByBrother.set(e.brotherId, set);
  }

  const writes = brothers.map(b => {
    const records = recordsByBrother.get(b.id) ?? [];
    const excused = excusedEventIdsByBrother.get(b.id) ?? new Set<number>();
    const eligible = records.filter(r => !excused.has(r.calendarEventId));
    const numerator = eligible.filter(r => r.attended).length;
    const denominator = eligible.length;
    const ratio = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
    return prisma.brother.update({ where: { id: b.id }, data: { attendance: ratio } });
  });

  // All-or-nothing commit. If any row fails, the transaction rolls back and no
  // brother's attendance is updated — better than a half-applied semester.
  await prisma.$transaction(writes);
}
