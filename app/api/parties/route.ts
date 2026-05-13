import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const parties = await prisma.partyEvent.findMany({ orderBy: { id: "asc" } });
  return Response.json(parties);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, date, doorRevenue, attendance, notes } = body;

  if (!name || !date || doorRevenue == null || attendance == null || notes == null) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const party = await prisma.partyEvent.create({
    data: {
      name: String(name),
      date: String(date),
      doorRevenue: Number(doorRevenue),
      attendance: Number(attendance),
      notes: String(notes),
    },
  });

  return Response.json(party, { status: 201 });
}
