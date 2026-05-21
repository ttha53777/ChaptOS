import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { logActivity } from "@/lib/activity";
import { isValidDateString } from "@/lib/coerce";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const tasks = await prisma.instagramTask.findMany({ orderBy: { id: "asc" } });
    return Response.json(tasks);
  } catch (e) {
    console.error("GET /api/instagram failed:", e);
    return Response.json({ error: "Failed to fetch instagram tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { title, dueDate, owner, status, type } = body;

    if (!title || !dueDate || !owner || !status || !type) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (String(title).length > 200) return Response.json({ error: "Title too long" }, { status: 400 });
    if (String(owner).length > 200) return Response.json({ error: "Owner too long" }, { status: 400 });
    if (!isValidDateString(dueDate)) {
      return Response.json({ error: "dueDate must use YYYY-MM-DD format" }, { status: 400 });
    }

    const task = await prisma.instagramTask.create({
      data: {
        title: String(title),
        dueDate: String(dueDate),
        owner: String(owner),
        status: String(status),
        type: String(type),
      },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} added IG task ${task.title}`,
    });

    return Response.json(task, { status: 201 });
  } catch (e) {
    console.error("POST /api/instagram failed:", e);
    return Response.json({ error: "Failed to create instagram task" }, { status: 500 });
  }
}
