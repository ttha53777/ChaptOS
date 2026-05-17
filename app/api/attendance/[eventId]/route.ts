import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveSemester } from "@/lib/attendance";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const calendarEventId = Number(eventId);
  if (!Number.isInteger(calendarEventId) || calendarEventId <= 0) {
    return Response.json({ error: "Invalid eventId" }, { status: 400 });
  }

  const semester = await getActiveSemester();
  if (!semester) return Response.json({ excused: [], unexcused: [], attended: [] });

  const [records, excuses] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { calendarEventId, semesterId: semester.id },
      include: { brother: { select: { id: true, name: true } } },
    }),
    prisma.attendanceExcuse.findMany({
      where: { calendarEventId, semesterId: semester.id },
      include: { brother: { select: { id: true, name: true } } },
    }),
  ]);

  const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));

  const attended = records
    .filter(r => r.attended && !excusedBrotherIds.has(r.brotherId))
    .map(r => ({ brotherId: r.brotherId, brotherName: r.brother.name }));

  const unexcused = records
    .filter(r => !r.attended && !excusedBrotherIds.has(r.brotherId))
    .map(r => ({ brotherId: r.brotherId, brotherName: r.brother.name }));

  const excused = excuses.map(e => ({
    brotherId: e.brotherId,
    brotherName: e.brother.name,
    reason: e.reason,
    isRetroactive: e.isRetroactive,
  }));

  return Response.json({ excused, unexcused, attended });
}
