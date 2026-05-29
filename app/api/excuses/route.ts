import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { db } from "@/lib/db";
import { getActiveSemester, recalcBrotherAttendance } from "@/lib/attendance";
import { requireUser } from "@/lib/auth/require-user";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { user, error } = await requirePermission("MANAGE_ATTENDANCE");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const pendingOnly = searchParams.get("status") === "pending" || searchParams.get("pending") === "true";
  const where: Prisma.AttendanceExcuseWhereInput = pendingOnly ? { status: "pending" } : {};

  try {
    const excuses = await db(user.orgId).attendanceExcuse.findMany({
      where,
      orderBy: { submittedAt: "asc" },
      include: {
        brother:       { select: { id: true, name: true } },
        calendarEvent: { select: { id: true, title: true, date: true } },
      },
    });
    return Response.json(
      excuses.map(e => ({
        id:              e.id,
        brotherId:       e.brotherId,
        brotherName:     e.brother.name,
        calendarEventId: e.calendarEventId,
        eventTitle:      e.calendarEvent.title,
        eventDate:       e.calendarEvent.date,
        reason:          e.reason,
        status:          e.status,
        submittedAt:     e.submittedAt.toISOString(),
        isRetroactive:   e.isRetroactive,
        rejectionNote:   e.rejectionNote,
      })),
    );
  } catch (e) {
    logError(e, { route: "/api/excuses", method: "GET", userId: user.id });
    return Response.json({ error: "Failed to fetch excuses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = checkMutationRate(user.id);
  if (limited) return limited;
  try {
    const body = await req.json();
    const calendarEventId = Number(body.calendarEventId);
    // Non-admins can only submit excuses for themselves; ignore any passed-in brotherId.
    const brotherId = user.isAdmin ? Number(body.brotherId) : user.id;
    const reason = String(body.reason ?? "").trim();

    if (!Number.isInteger(calendarEventId) || calendarEventId <= 0) {
      return Response.json({ error: "Invalid calendarEventId" }, { status: 400 });
    }
    if (!Number.isInteger(brotherId) || brotherId <= 0) {
      return Response.json({ error: "Invalid brotherId" }, { status: 400 });
    }
    if (!reason) return Response.json({ error: "Reason is required" }, { status: 400 });
    if (reason.length > 1000) return Response.json({ error: "Reason too long" }, { status: 400 });

    const [semester, brotherExists, existingRecord] = await Promise.all([
      getActiveSemester(),
      db(user.orgId).brother.findUnique({ where: { id: brotherId }, select: { id: true } }),
      db(user.orgId).attendanceRecord.findUnique({ where: { calendarEventId_brotherId: { calendarEventId, brotherId } } }),
    ]);
    if (!semester) return Response.json({ error: "No active semester" }, { status: 400 });
    if (!brotherExists) return Response.json({ error: "Brother not found" }, { status: 404 });

    const isRetroactive = !!existingRecord;

    // Admin submissions auto-approve (they are the approval). Members go through the queue.
    // Resubmission after rejection: payload below clears decidedBy/decidedAt/rejectionNote
    // and resets status to pending, so the row flips back into the officer queue.
    const status = user.isAdmin ? "approved" : "pending";
    const decidedById = user.isAdmin ? user.id : null;
    const decidedAt = user.isAdmin ? new Date() : null;

    // Re-read status inside the transaction so two concurrent submissions can't
    // both overwrite an approved/pending excuse (TOCTOU between the outer read
    // above and the upsert below).
    type StatusConflict = "approved" | "pending";
    let conflict: StatusConflict | null = null;
    await db(user.orgId).$transaction(async (tx) => {
      const current = await tx.attendanceExcuse.findUnique({
        where: { calendarEventId_brotherId: { calendarEventId, brotherId } },
        select: { status: true },
      });

      if (!user.isAdmin && current && current.status !== "rejected") {
        conflict = current.status === "approved" ? "approved" : "pending";
        return;
      }

      await tx.attendanceExcuse.upsert({
        where: { calendarEventId_brotherId: { calendarEventId, brotherId } },
        update: {
          reason,
          isRetroactive,
          status,
          decidedById,
          decidedAt,
          rejectionNote: null,
          submittedAt: new Date(),
        },
        create: {
          calendarEventId,
          brotherId,
          semesterId: semester.id,
          reason,
          isRetroactive,
          status,
          decidedById,
          decidedAt,
        },
      });
    });

    if (conflict) {
      return Response.json(
        { error: conflict === "approved" ? "Excuse already approved" : "Excuse already pending review" },
        { status: 409 },
      );
    }

    // Only approved excuses affect attendance math. Pending excuses are inert until decided.
    const newAttendance = status === "approved"
      ? await recalcBrotherAttendance(brotherId, semester.id)
      : null;
    const brother = await db(user.orgId).brother.findUnique({ where: { id: brotherId } });
    if (!brother) return Response.json({ error: "Brother not found" }, { status: 404 });

    const event = await db(user.orgId).calendarEvent.findUnique({
      where: { id: calendarEventId },
      select: { title: true },
    });
    await logActivity({
      actorId: user.id,
      type: "info",
      message: status === "approved"
        ? `${user.name} ${isRetroactive ? "submitted retroactive excuse for" : "excused"} ${brother.name} from ${event?.title ?? "an event"}`
        : `${user.name} submitted excuse for review (${event?.title ?? "an event"})`,
      orgId: user.orgId,
    });

    return Response.json({
      ...brother,
      attendance: newAttendance ?? brother.attendance,
      excuseStatus: status,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      logError(e, { route: "/api/excuses", method: "POST", userId: user.id, extra: { prismaCode: e.code } });
    } else {
      logError(e, { route: "/api/excuses", method: "POST", userId: user.id });
    }
    return Response.json({ error: "Failed to record excuse" }, { status: 500 });
  }
}
