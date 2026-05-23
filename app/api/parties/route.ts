import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { logActivity } from "@/lib/activity";
import { isValidDateString } from "@/lib/coerce";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parties = await prisma.partyEvent.findMany({ orderBy: { id: "asc" } });
    return Response.json(parties);
  } catch {
    return Response.json({ error: "Failed to fetch party events" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = checkMutationRate(user.id);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { name, date, partyType, theme, collabOrg, doorRevenue, attendance, expenses, notes } = body;

  if (!name || !date) {
    return Response.json({ error: "name and date are required" }, { status: 400 });
  }
  if (!isValidDateString(date)) {
    return Response.json({ error: "date must use YYYY-MM-DD format" }, { status: 400 });
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

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} scheduled ${party.name} on ${party.date}`,
    });

    return Response.json(party, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "Duplicate entry" }, { status: 409 });
    }
    logError(e, { route: "/api/parties", method: "POST", userId: user?.id });
    return Response.json({ error: "Failed to create party event" }, { status: 500 });
  }
}
