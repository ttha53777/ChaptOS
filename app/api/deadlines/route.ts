import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const deadlines = await prisma.deadline.findMany({ orderBy: { id: "asc" } });
    return Response.json(deadlines);
  } catch (e) {
    console.error("GET /api/deadlines failed:", e);
    return Response.json({ error: "Failed to fetch deadlines" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, dueDate, owner, status } = body;

    if (!title || !dueDate || !owner || !status) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const deadline = await prisma.deadline.create({
      data: {
        title: String(title),
        dueDate: String(dueDate),
        owner: String(owner),
        status: String(status),
      },
    });

    return Response.json(deadline, { status: 201 });
  } catch (e) {
    console.error("POST /api/deadlines failed:", e);
    return Response.json({ error: "Failed to create deadline" }, { status: 500 });
  }
}
