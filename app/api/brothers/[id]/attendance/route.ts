import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { getActiveSemester } from "@/lib/attendance";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const brotherId = Number(id);

    const semester = await getActiveSemester();
    if (!semester) return Response.json([], { status: 200 });

    const [records, excuses, events] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { brotherId, semesterId: semester.id },
        select: { calendarEventId: true, attended: true },
      }),
      prisma.attendanceExcuse.findMany({
        where: { brotherId, semesterId: semester.id },
        select: { calendarEventId: true, reason: true },
      }),
      prisma.calendarEvent.findMany({
        where: { mandatory: true },
        orderBy: { date: "asc" },
        select: { id: true, title: true, date: true },
      }),
    ]);

    const recordMap  = new Map(records.map(r => [r.calendarEventId, r.attended]));
    const excuseMap  = new Map(excuses.map(e => [e.calendarEventId, e.reason]));

    const history = events.map(event => ({
      calendarEventId: event.id,
      title:   event.title,
      date:    event.date,
      attended: recordMap.get(event.id) ?? null,
      excused:  excuseMap.has(event.id),
      excuseReason: excuseMap.get(event.id) ?? null,
    }));

    return Response.json(history);
  } catch (e) {
    console.error("GET /api/brothers/[id]/attendance failed:", e);
    return Response.json({ error: "Failed to fetch attendance history" }, { status: 500 });
  }
}
