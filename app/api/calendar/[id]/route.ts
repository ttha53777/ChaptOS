import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logActivity } from "@/lib/activity";
import { logError } from "@/lib/observability";

const CALENDAR_CATEGORIES = ["chapter", "social", "fundy", "program", "party", "deadline", "service"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    const body = await req.json();

    const stringFields = ["title", "date", "time", "category", "description", "location"] as const;
    const data: Record<string, string | boolean | null | Date> = {};

    for (const key of stringFields) {
      if (key in body) data[key] = optionalString(body[key]);
    }
    if ("mandatory" in body) {
      if (typeof body.mandatory !== "boolean") {
        return Response.json({ error: "Mandatory must be a boolean" }, { status: 400 });
      }
      data["mandatory"] = body.mandatory;
    }
    // When notes change, bump notesUpdatedAt so the client can flag a stale
    // AI summary. Cheap to compute server-side, and keeps the client honest
    // about clock skew.
    if ("description" in body) {
      data["notesUpdatedAt"] = new Date();
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 });
    }
    if ("title" in data && !data.title) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }
    if ("date" in data && (typeof data.date !== "string" || !DATE_RE.test(data.date))) {
      return Response.json({ error: "Date must use YYYY-MM-DD format" }, { status: 400 });
    }
    if ("category" in data && (typeof data.category !== "string" || !CALENDAR_CATEGORIES.includes(data.category as typeof CALENDAR_CATEGORIES[number]))) {
      return Response.json({ error: "Invalid calendar category" }, { status: 400 });
    }
    if ("description" in data && typeof data.description === "string" && data.description.length > 50000) {
      return Response.json({ error: "Description too long" }, { status: 400 });
    }

    const event = await prisma.$transaction(async (tx) => {
      const updated = await tx.calendarEvent.update({ where: { id: numId }, data });

      // Keep any linked ServiceEvent in sync. Map calendar field names → service
      // field names (description→notes; other shared names are identical).
      const svcData: Record<string, string> = {};
      if ("title"    in data && typeof data.title    === "string") svcData.title    = data.title    ?? "";
      if ("date"     in data && typeof data.date     === "string") svcData.date     = data.date     ?? "";
      if ("location" in data)                                       svcData.location = typeof data.location === "string" ? data.location ?? "" : "";
      if ("description" in data)                                    svcData.notes    = typeof data.description === "string" ? data.description ?? "" : "";
      if (Object.keys(svcData).length > 0) {
        await tx.serviceEvent.updateMany({ where: { calendarEventId: numId }, data: svcData });
      }

      return updated;
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated event ${event.title}`,
    });

    return Response.json(event);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Calendar event not found" }, { status: 404 });
    }
    logError(e, { route: "/api/calendar/[id]", method: "PATCH", userId: user.id });
    return Response.json({ error: "Failed to update calendar event" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    const target = await prisma.calendarEvent.findUnique({
      where: { id: numId },
      select: { title: true },
    });

    await prisma.$transaction(async (tx) => {
      // Remove any linked ServiceEvent before deleting the CalendarEvent so the
      // service-events page doesn't retain a stale orphaned row.
      await tx.serviceEvent.deleteMany({ where: { calendarEventId: numId } });
      await tx.calendarEvent.delete({ where: { id: numId } });
    });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} deleted event ${target?.title ?? `#${numId}`}`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Calendar event not found" }, { status: 404 });
      if (e.code === "P2003") return Response.json({ error: "Cannot delete event with existing attendance records" }, { status: 409 });
    }
    logError(e, { route: "/api/calendar/[id]", method: "DELETE", userId: user.id });
    return Response.json({ error: "Failed to delete calendar event" }, { status: 500 });
  }
}
