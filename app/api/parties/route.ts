import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const parties = await prisma.partyEvent.findMany({ orderBy: { id: "asc" } });
    return Response.json(parties);
  } catch {
    return Response.json({ error: "Failed to fetch party events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { name, date, doorRevenue, attendance, notes } = body;

  if (!name || !date || doorRevenue == null || attendance == null || notes == null) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  const numDoorRevenue = Number(doorRevenue);
  const numAttendance  = Number(attendance);
  if (isNaN(numDoorRevenue) || numDoorRevenue < 0) {
    return Response.json({ error: "doorRevenue must be a non-negative number" }, { status: 400 });
  }
  if (isNaN(numAttendance) || numAttendance < 0) {
    return Response.json({ error: "attendance must be a non-negative number" }, { status: 400 });
  }

  try {
    const party = await prisma.partyEvent.create({
      data: {
        name: String(name),
        date: String(date),
        doorRevenue: numDoorRevenue,
        attendance:  numAttendance,
        notes: String(notes),
      },
    });
    return Response.json(party, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Duplicate entry" }, { status: 409 });
    }
    return Response.json({ error: "Failed to create party event" }, { status: 500 });
  }
}
