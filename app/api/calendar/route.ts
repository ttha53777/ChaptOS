import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const events = await prisma.calendarEvent.findMany({ orderBy: { id: "asc" } });
  return Response.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, date, category, mandatory } = body;

  if (!title || !date || !category || mandatory == null) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title: String(title),
      date: String(date),
      time: body.time != null ? String(body.time) : null,
      category: String(category),
      mandatory: Boolean(mandatory),
      description: body.description != null ? String(body.description) : null,
      location: body.location != null ? String(body.location) : null,
    },
  });

  return Response.json(event, { status: 201 });
}
