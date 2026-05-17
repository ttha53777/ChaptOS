// TODO: verify officer role before allowing this action
import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveSemester, recalcBrotherAttendance } from "@/lib/attendance";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const calendarEventId = Number(body.calendarEventId);
    const brotherId = Number(body.brotherId);
    const reason = String(body.reason ?? "").trim();

    if (!Number.isInteger(calendarEventId) || calendarEventId <= 0) {
      return Response.json({ error: "Invalid calendarEventId" }, { status: 400 });
    }
    if (!Number.isInteger(brotherId) || brotherId <= 0) {
      return Response.json({ error: "Invalid brotherId" }, { status: 400 });
    }
    if (!reason) return Response.json({ error: "Reason is required" }, { status: 400 });

    const [semester, brotherExists, existingRecord] = await Promise.all([
      getActiveSemester(),
      prisma.brother.findUnique({ where: { id: brotherId }, select: { id: true } }),
      prisma.attendanceRecord.findUnique({ where: { calendarEventId_brotherId: { calendarEventId, brotherId } } }),
    ]);
    if (!semester) return Response.json({ error: "No active semester" }, { status: 400 });
    if (!brotherExists) return Response.json({ error: "Brother not found" }, { status: 404 });
    const isRetroactive = !!existingRecord;

    await prisma.attendanceExcuse.upsert({
      where: { calendarEventId_brotherId: { calendarEventId, brotherId } },
      update: { reason, isRetroactive },
      create: { calendarEventId, brotherId, semesterId: semester.id, reason, isRetroactive },
    });

    const newAttendance = await recalcBrotherAttendance(brotherId, semester.id);
    const brother = await prisma.brother.findUnique({ where: { id: brotherId } });
    if (!brother) return Response.json({ error: "Brother not found" }, { status: 404 });

    return Response.json({ ...brother, attendance: newAttendance });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("POST /api/excuses prisma error:", e.code, e.message);
    } else {
      console.error("POST /api/excuses failed:", e);
    }
    return Response.json({ error: "Failed to record excuse" }, { status: 500 });
  }
}
