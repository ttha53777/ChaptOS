import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const events = await prisma.serviceEvent.findMany({ orderBy: { date: "asc" } });
    return Response.json(events);
  } catch (e) {
    console.error("GET /api/service-events failed:", e);
    return Response.json({ error: "Failed to fetch service events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { title, date, location, notes } = body;
  if (!title || !date) {
    return Response.json({ error: "title and date are required" }, { status: 400 });
  }

  try {
    const event = await prisma.serviceEvent.create({
      data: {
        title:    String(title),
        date:     String(date),
        location: location ? String(location) : "",
        notes:    notes    ? String(notes)    : "",
      },
    });
    return Response.json(event, { status: 201 });
  } catch (e) {
    console.error("POST /api/service-events failed:", e);
    return Response.json({ error: "Failed to create service event" }, { status: 500 });
  }
}
