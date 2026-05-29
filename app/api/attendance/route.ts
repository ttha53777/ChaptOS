import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { db } from "@/lib/db";
import { getActiveSemester, recalcAllBrothersInSemester } from "@/lib/attendance";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const { user, error } = await requirePermission("MANAGE_ATTENDANCE");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;
  try {
    const body = await req.json();
    const calendarEventId = Number(body.calendarEventId);
    const attendedIds: number[] = Array.isArray(body.attendedIds) ? body.attendedIds.map(Number) : [];

    if (!Number.isInteger(calendarEventId) || calendarEventId <= 0) {
      return Response.json({ error: "Invalid calendarEventId" }, { status: 400 });
    }
    if (attendedIds.some(id => !Number.isInteger(id) || id <= 0)) {
      return Response.json({ error: "Invalid attendedIds" }, { status: 400 });
    }

    const [event, semester] = await Promise.all([
      db(user.orgId).calendarEvent.findUnique({ where: { id: calendarEventId } }),
      getActiveSemester(),
    ]);
    if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
    if (!event.mandatory) return Response.json({ error: "Only mandatory events track attendance" }, { status: 400 });
    if (!semester) return Response.json({ error: "No active semester" }, { status: 400 });

    const [excuses, brothers] = await Promise.all([
      db(user.orgId).attendanceExcuse.findMany({ where: { calendarEventId, semesterId: semester.id, status: "approved" } }),
      db(user.orgId).brother.findMany({ where: { isGhost: false }, select: { id: true } }),
    ]);
    const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
    const eligible = brothers.filter(b => !excusedBrotherIds.has(b.id));

    await db(user.orgId).$transaction(
      eligible.map(b =>
        db(user.orgId).attendanceRecord.upsert({
          where: { calendarEventId_brotherId: { calendarEventId, brotherId: b.id } },
          update: { attended: attendedIds.includes(b.id) },
          create: { calendarEventId, brotherId: b.id, semesterId: semester.id, attended: attendedIds.includes(b.id) },
        })
      )
    );

    await recalcAllBrothersInSemester(semester.id);

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} recorded attendance for ${event.title}: ${attendedIds.length}/${eligible.length} present`,
      orgId: user.orgId,
    });

    const updatedBrothers = await db(user.orgId).brother.findMany({ where: { isGhost: false } });
    return Response.json(updatedBrothers);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      logError(e, { route: "/api/attendance", method: "POST", userId: user.id, extra: { prismaCode: e.code } });
      return Response.json({ error: "Database error logging attendance" }, { status: 500 });
    }
    logError(e, { route: "/api/attendance", method: "POST", userId: user.id });
    return Response.json({ error: "Failed to log attendance" }, { status: 500 });
  }
}
