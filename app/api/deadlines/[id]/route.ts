import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const allowed = ["title", "dueDate", "owner", "status"] as const;
  const data: Record<string, string> = {};
  for (const key of allowed) {
    if (key in body) data[key] = String(body[key]);
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const deadline = await prisma.deadline.update({
    where: { id: Number(id) },
    data,
  });

  return Response.json(deadline);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.deadline.delete({ where: { id: Number(id) } });
  return new Response(null, { status: 204 });
}
