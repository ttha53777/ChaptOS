import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getActiveSemester } from "@/lib/attendance";
import { logError } from "@/lib/observability";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const brotherId = Number(id);
    if (!Number.isInteger(brotherId) || brotherId <= 0) {
      return Response.json({ error: "Invalid brother ID" }, { status: 400 });
    }

    const semester = await getActiveSemester();
    if (!semester) return Response.json([], { status: 200 });

    const [records, excuses, events] = await Promise.all([
      db(user.orgId).attendanceRecord.findMany({
        where: { brotherId, semesterId: semester.id },
        select: { calendarEventId: true, attended: true },
      }),
      db(user.orgId).attendanceExcuse.findMany({
        where: { brotherId, semesterId: semester.id },
        select: { calendarEventId: true, reason: true, status: true, rejectionNote: true },
      }),
      db(user.orgId).calendarEvent.findMany({
        where: { mandatory: true },
        orderBy: { date: "asc" },
        select: { id: true, title: true, date: true },
      }),
    ]);

    const recordMap = new Map(records.map(r => [r.calendarEventId, r.attended]));
    const excuseMap = new Map(excuses.map(e => [e.calendarEventId, e]));

    const history = events.map(event => {
      const excuse = excuseMap.get(event.id);
      return {
        calendarEventId: event.id,
        title:            event.title,
        date:             event.date,
        attended:         recordMap.get(event.id) ?? null,
        excused:          !!excuse && excuse.status === "approved",
        excuseReason:     excuse?.reason ?? null,
        excuseStatus:     excuse?.status ?? null,
        excuseRejection:  excuse?.rejectionNote ?? null,
      };
    });

    return Response.json(history);
  } catch (e) {
    logError(e, { route: "/api/brothers/[id]/attendance", method: "GET", userId: user?.id });
    return Response.json({ error: "Failed to fetch attendance history" }, { status: 500 });
  }
}
