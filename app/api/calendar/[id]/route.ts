import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";

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
    const body = await req.json();

    const stringFields = ["title", "date", "time", "category", "description", "location"] as const;
    const data: Record<string, string | boolean | null> = {};

    for (const key of stringFields) {
      if (key in body) data[key] = optionalString(body[key]);
    }
    if ("mandatory" in body) {
      if (typeof body.mandatory !== "boolean") {
        return Response.json({ error: "Mandatory must be a boolean" }, { status: 400 });
      }
      data["mandatory"] = body.mandatory;
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

    const event = await prisma.calendarEvent.update({
      where: { id: Number(id) },
      data,
    });

    return Response.json(event);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Calendar event not found" }, { status: 404 });
    }
    console.error("PATCH /api/calendar/[id] failed:", e);
    return Response.json({ error: "Failed to update calendar event" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    await prisma.calendarEvent.delete({ where: { id: Number(id) } });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Calendar event not found" }, { status: 404 });
      if (e.code === "P2003") return Response.json({ error: "Cannot delete event with existing attendance records" }, { status: 409 });
    }
    console.error("DELETE /api/calendar/[id] failed:", e);
    return Response.json({ error: "Failed to delete calendar event" }, { status: 500 });
  }
}
