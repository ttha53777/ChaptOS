import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const events = await prisma.serviceEvent.findMany({ orderBy: { date: "asc" } });
    return Response.json(events);
  } catch (e) {
    logError(e, { route: "/api/service-events", method: "GET", userId: user?.id });
    return Response.json({ error: "Failed to fetch service events" }, { status: 500 });
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = checkMutationRate(user.id);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // `notes` is the service-page name; `description` is the calendar/timeline name.
  // Accept either so the same API serves both call sites without renaming on the client.
  const { title, date, time, location, notes, description, mandatory } = body;
  if (!title || !date) {
    return Response.json({ error: "title and date are required" }, { status: 400 });
  }
  const dateStr = String(date);
  if (!DATE_RE.test(dateStr)) {
    return Response.json({ error: "Date must use YYYY-MM-DD format" }, { status: 400 });
  }

  const titleStr    = String(title);
  const locationStr = location ? String(location) : "";
  const notesStr    = notes ? String(notes) : description ? String(description) : "";
  const timeStr     = time ? String(time).trim() : "";
  const mandatoryBool = typeof mandatory === "boolean" ? mandatory : false;

  try {
    const { serviceEvent, calendarEvent } = await prisma.$transaction(async (tx) => {
      const calendarEvent = await tx.calendarEvent.create({
        data: {
          title:       titleStr,
          date:        dateStr,
          time:        timeStr || null,
          category:    "service",
          mandatory:   mandatoryBool,
          location:    locationStr || null,
          description: notesStr    || null,
        },
      });
      const serviceEvent = await tx.serviceEvent.create({
        data: {
          title:           titleStr,
          date:            dateStr,
          location:        locationStr,
          notes:           notesStr,
          calendarEventId: calendarEvent.id,
        },
      });
      return { serviceEvent, calendarEvent };
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} added service event ${serviceEvent.title} on ${serviceEvent.date}`,
    });

    // Top-level fields preserve the original ServiceEvent shape for the service
    // page; `calendarEvent` is an additive field for clients (e.g. the timeline)
    // that need the linked calendar row to update their local state without a refetch.
    return Response.json({ ...serviceEvent, calendarEvent }, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/service-events", method: "POST", userId: user?.id });
    return Response.json({ error: "Failed to create service event" }, { status: 500 });
  }
}
