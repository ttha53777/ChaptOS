import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { coerceString } from "@/lib/coerce";
import { logError } from "@/lib/observability";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const data: Prisma.ServiceEventUpdateInput = {};
  for (const key of ["title", "date", "location", "notes"] as const) {
    if (!(key in body)) continue;
    const s = coerceString(body[key]);
    if (s === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
    data[key] = s;
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  try {
    const event = await prisma.$transaction(async (tx) => {
      const updated = await tx.serviceEvent.update({ where: { id: numId }, data });
      if (updated.calendarEventId) {
        const calData: Prisma.CalendarEventUpdateInput = {};
        if ("title"    in body) calData.title       = String(body.title);
        if ("date"     in body) calData.date        = String(body.date);
        if ("location" in body) calData.location    = String(body.location) || null;
        if ("notes"    in body) calData.description = String(body.notes)    || null;
        if (Object.keys(calData).length > 0) {
          await tx.calendarEvent.update({ where: { id: updated.calendarEventId }, data: calData });
        }
      }
      return updated;
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated service event ${event.title}`,
    });

    return Response.json(event);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Service event not found" }, { status: 404 });
    }
    logError(e, { route: "/api/service-events/[id]", method: "PATCH", userId: user?.id });
    return Response.json({ error: "Failed to update service event" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_SERVICE");
  if (error) return error;
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.serviceEvent.findUnique({
        where: { id: numId },
        select: { calendarEventId: true, title: true },
      });
      if (!existing) throw new Prisma.PrismaClientKnownRequestError("Not found", { code: "P2025", clientVersion: "" });
      await tx.serviceEvent.delete({ where: { id: numId } });
      // Only delete the linked calendar event if it still exists. Don't swallow
      // arbitrary errors with .catch — that defeats the transaction's atomicity
      // and can leave orphaned calendar rows.
      if (existing.calendarEventId) {
        const calendarExists = await tx.calendarEvent.findUnique({
          where: { id: existing.calendarEventId },
          select: { id: true },
        });
        if (calendarExists) {
          await tx.calendarEvent.delete({ where: { id: existing.calendarEventId } });
        }
      }
      return existing;
    });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} deleted service event ${deleted.title}`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return Response.json({ error: "Service event not found" }, { status: 404 });
    }
    return Response.json({ error: "Failed to delete service event" }, { status: 500 });
  }
}
