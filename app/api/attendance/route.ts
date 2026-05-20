import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveSemester, recalcAllBrothersInSemester } from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
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

    // Stage 1: event + semester in parallel (excuses needs semester.id so must come after)
    const [event, semester] = await Promise.all([
      prisma.calendarEvent.findUnique({ where: { id: calendarEventId } }),
      getActiveSemester(),
    ]);
    if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
    if (!event.mandatory) return Response.json({ error: "Only mandatory events track attendance" }, { status: 400 });
    if (!semester) return Response.json({ error: "No active semester" }, { status: 400 });

    // Stage 2: excuses + brothers in parallel
    const [excuses, brothers] = await Promise.all([
      prisma.attendanceExcuse.findMany({ where: { calendarEventId, semesterId: semester.id } }),
      prisma.brother.findMany({ select: { id: true } }),
    ]);
    const excusedBrotherIds = new Set(excuses.map(e => e.brotherId));
    const eligible = brothers.filter(b => !excusedBrotherIds.has(b.id));

    await Promise.all(
      eligible.map(b =>
        prisma.attendanceRecord.upsert({
          where: { calendarEventId_brotherId: { calendarEventId, brotherId: b.id } },
          update: { attended: attendedIds.includes(b.id) },
          create: { calendarEventId, brotherId: b.id, semesterId: semester.id, attended: attendedIds.includes(b.id) },
        })
      )
    );

    await recalcAllBrothersInSemester(semester.id);

    const updatedBrothers = await prisma.brother.findMany();
    return Response.json(updatedBrothers);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("POST /api/attendance prisma error:", e.code, e.message);
      return Response.json({ error: "Database error logging attendance" }, { status: 500 });
    }
    console.error("POST /api/attendance failed:", e);
    return Response.json({ error: "Failed to log attendance" }, { status: 500 });
  }
}
