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

  const { name, date, partyType, theme, collabOrg, doorRevenue, attendance, expenses, notes } = body;

  if (!name || !date) {
    return Response.json({ error: "name and date are required" }, { status: 400 });
  }

  const numDoorRevenue = doorRevenue != null ? Number(doorRevenue) : 0;
  const numAttendance  = attendance  != null ? Number(attendance)  : 0;
  const numExpenses    = expenses    != null ? Number(expenses)    : 0;

  if (isNaN(numDoorRevenue) || numDoorRevenue < 0)
    return Response.json({ error: "doorRevenue must be a non-negative number" }, { status: 400 });
  if (isNaN(numAttendance) || numAttendance < 0)
    return Response.json({ error: "attendance must be a non-negative number" }, { status: 400 });
  if (isNaN(numExpenses) || numExpenses < 0)
    return Response.json({ error: "expenses must be a non-negative number" }, { status: 400 });

  try {
    const party = await prisma.partyEvent.create({
      data: {
        name:        String(name),
        date:        String(date),
        partyType:   partyType === "Closed" ? "Closed" : "Open",
        theme:       theme     ? String(theme)     : "",
        collabOrg:   collabOrg ? String(collabOrg) : "",
        doorRevenue: numDoorRevenue,
        attendance:  numAttendance,
        expenses:    numExpenses,
        notes:       notes ? String(notes) : "",
        completed:   false,
      },
    });
    return Response.json(party, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Duplicate entry" }, { status: 409 });
    }
    console.error("POST /api/parties failed:", e);
    return Response.json({ error: "Failed to create party event" }, { status: 500 });
  }
}
