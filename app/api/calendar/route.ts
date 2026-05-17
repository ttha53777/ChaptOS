import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";

const CALENDAR_CATEGORIES = ["chapter", "social", "fundy", "program", "party", "deadline"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function validateCalendarBody(body: Record<string, unknown>) {
  const title = optionalString(body.title);
  const date = optionalString(body.date);
  const category = optionalString(body.category);

  if (!title || !date || !category || body.mandatory == null) {
    return { error: "Missing required fields" };
  }
  if (!DATE_RE.test(date)) {
    return { error: "Date must use YYYY-MM-DD format" };
  }
  if (!CALENDAR_CATEGORIES.includes(category as typeof CALENDAR_CATEGORIES[number])) {
    return { error: "Invalid calendar category" };
  }
  if (typeof body.mandatory !== "boolean") {
    return { error: "Mandatory must be a boolean" };
  }

  return {
    data: {
      title,
      date,
      time: optionalString(body.time),
      category,
      mandatory: body.mandatory,
      description: optionalString(body.description),
      location: optionalString(body.location),
    },
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const events = await prisma.calendarEvent.findMany({ orderBy: { id: "asc" } });
    return Response.json(events);
  } catch (e) {
    console.error("GET /api/calendar failed:", e);
    return Response.json({ error: "Failed to fetch calendar events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const parsed = validateCalendarBody(body);

    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const event = await prisma.calendarEvent.create({ data: parsed.data });
    return Response.json(event, { status: 201 });
  } catch (e) {
    console.error("POST /api/calendar failed:", e);
    return Response.json({ error: "Failed to create calendar event" }, { status: 500 });
  }
}
