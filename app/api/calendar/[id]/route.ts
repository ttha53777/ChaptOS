import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const CALENDAR_CATEGORIES = ["chapter", "social", "fundy", "program", "party", "deadline"] as const;
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
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.calendarEvent.delete({ where: { id: Number(id) } });
  return new Response(null, { status: 204 });
}
