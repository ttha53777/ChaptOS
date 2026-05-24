import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recalcBrotherAttendance } from "@/lib/attendance";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { logError } from "@/lib/observability";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_ATTENDANCE");
  if (error) return error;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return Response.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  const rejectionNote = action === "reject" && typeof body.rejectionNote === "string"
    ? body.rejectionNote.trim().slice(0, 1000) || null
    : null;

  try {
    // updateMany lets us scope the where clause to `status: "pending"` so a race with a
    // resubmission can't silently overwrite a freshly-pending row, and so a double-click
    // doesn't re-decide an already-decided row. count===0 means the row already moved on.
    const result = await prisma.attendanceExcuse.updateMany({
      where: { id: numId, status: "pending" },
      data: {
        status:        action === "approve" ? "approved" : "rejected",
        decidedById:   user.id,
        decidedAt:     new Date(),
        rejectionNote,
      },
    });
    if (result.count === 0) {
      return Response.json({ error: "Excuse is no longer pending" }, { status: 409 });
    }
    const updated = await prisma.attendanceExcuse.findUnique({
      where: { id: numId },
      include: {
        brother:       { select: { id: true, name: true } },
        calendarEvent: { select: { id: true, title: true } },
      },
    });
    if (!updated) return Response.json({ error: "Excuse not found" }, { status: 404 });

    // Only approval flips the attendance denominator. Rejection is a no-op for math.
    let attendance: number | null = null;
    if (action === "approve") {
      attendance = await recalcBrotherAttendance(updated.brotherId, updated.semesterId);
    }

    await logActivity({
      actorId: user.id,
      type:    action === "approve" ? "success" : "warning",
      message: action === "approve"
        ? `${user.name} approved excuse for ${updated.brother.name} (${updated.calendarEvent.title})`
        : `${user.name} rejected excuse for ${updated.brother.name} (${updated.calendarEvent.title})`,
    });

    return Response.json({
      id:        updated.id,
      brotherId: updated.brotherId,
      status:    updated.status,
      attendance,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Excuse not found" }, { status: 404 });
    }
    logError(e, { route: "/api/excuses/[id]", method: "PATCH", userId: user?.id });
    return Response.json({ error: "Failed to update excuse" }, { status: 500 });
  }
}
