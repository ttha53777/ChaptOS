import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { logActivity } from "@/lib/activity";
import { isValidDateString } from "@/lib/coerce";
import { checkMutationRate } from "@/lib/rate-limit";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const deadlines = await prisma.deadline.findMany({ orderBy: { id: "asc" } });
    return Response.json(deadlines);
  } catch (e) {
    console.error("GET /api/deadlines failed:", e);
    return Response.json({ error: "Failed to fetch deadlines" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = checkMutationRate(user.id);
  if (limited) return limited;
  try {
    const body = await req.json();
    const { title, dueDate, owner, status } = body;

    if (!title || !dueDate || !owner || !status) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (String(title).length > 200) return Response.json({ error: "Title too long" }, { status: 400 });
    if (String(owner).length > 200) return Response.json({ error: "Owner too long" }, { status: 400 });
    if (!isValidDateString(dueDate)) {
      return Response.json({ error: "dueDate must use YYYY-MM-DD format" }, { status: 400 });
    }

    const deadline = await prisma.deadline.create({
      data: {
        title: String(title),
        dueDate: String(dueDate),
        owner: String(owner),
        status: String(status),
      },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} added deadline ${deadline.title} (due ${deadline.dueDate})`,
    });

    return Response.json(deadline, { status: 201 });
  } catch (e) {
    console.error("POST /api/deadlines failed:", e);
    return Response.json({ error: "Failed to create deadline" }, { status: 500 });
  }
}
