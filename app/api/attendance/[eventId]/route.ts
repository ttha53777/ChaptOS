import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { getActiveSemester } from "@/lib/attendance";
import { ExcuseStatus } from "@/lib/state";
import { logError } from "@/lib/observability";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { eventId } = await params;
    const calendarEventId = Number(eventId);
    if (!Number.isInteger(calendarEventId) || calendarEventId <= 0) throw new ValidationError("Invalid eventId");

    const semester = await getActiveSemester();
    if (!semester) throw new ValidationError("No active semester");

    const [records, excuses] = await Promise.all([
      ctx.db.attendanceRecord.findMany({
        where: { calendarEventId, semesterId: semester.id },
        include: { brother: { select: { id: true, name: true } } },
      }),
      ctx.db.attendanceExcuse.findMany({
        where: { calendarEventId, semesterId: semester.id, status: ExcuseStatus.Approved },
        include: { brother: { select: { id: true, name: true } } },
      }),
    ]);

    const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
    const attended = records.filter(r => r.attended && !excusedBrotherIds.has(r.brotherId))
      .map(r => ({ brotherId: r.brotherId, brotherName: r.brother.name }));
    const unexcused = records.filter(r => !r.attended && !excusedBrotherIds.has(r.brotherId))
      .map(r => ({ brotherId: r.brotherId, brotherName: r.brother.name }));
    const excused = excuses.map(e => ({
      brotherId: e.brotherId,
      brotherName: e.brother.name,
      reason: e.reason,
      isRetroactive: e.isRetroactive,
    }));

    return Response.json({ excused, unexcused, attended });
  } catch (e) {
    logError(e, { route: "/api/attendance/[eventId]", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
