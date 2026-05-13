import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const deadlines = await prisma.deadline.findMany({ orderBy: { id: "asc" } });
  return Response.json(deadlines);
}

export async function POST(req: NextRequest) {
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
}
