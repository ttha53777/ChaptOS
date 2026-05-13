import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const stringFields = ["title", "date", "time", "category", "description", "location"] as const;
  const data: Record<string, string | boolean | null> = {};

  for (const key of stringFields) {
    if (key in body) data[key] = body[key] != null ? String(body[key]) : null;
  }
  if ("mandatory" in body) data["mandatory"] = Boolean(body.mandatory);

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.update({
    where: { id: Number(id) },
    data,
  });

  return Response.json(event);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.calendarEvent.delete({ where: { id: Number(id) } });
  return new Response(null, { status: 204 });
}
