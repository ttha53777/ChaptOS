import { prisma } from "./prisma";

export async function getActiveSemester() {
  return prisma.semester.findFirst({ where: { isActive: true } });
}

export async function recalcBrotherAttendance(brotherId: number, semesterId: number): Promise<number> {
  const [records, excuses] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { brotherId, semesterId } }),
    prisma.attendanceExcuse.findMany({ where: { brotherId, semesterId } }),
  ]);

  const excusedEventIds = new Set(excuses.map(e => e.calendarEventId));
  const eligible = records.filter(r => !excusedEventIds.has(r.calendarEventId));

  const numerator = eligible.filter(r => r.attended).length;
  const denominator = eligible.length;
  const ratio = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

  await prisma.brother.update({ where: { id: brotherId }, data: { attendance: ratio } });
  return ratio;
}

export async function recalcAllBrothersInSemester(semesterId: number): Promise<void> {
  const brothers = await prisma.brother.findMany({ select: { id: true } });
  const results = await Promise.allSettled(brothers.map(b => recalcBrotherAttendance(b.id, semesterId)));
  const failed = results.filter(r => r.status === "rejected");
  if (failed.length > 0) {
    console.error(`recalcAllBrothersInSemester: ${failed.length} brother(s) failed to recalculate`, failed);
    throw new Error(`Attendance recalculation failed for ${failed.length} brother(s)`);
  }
}
