import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const stringFields = ["name", "date", "notes"] as const;
  const numericFields = ["doorRevenue", "attendance"] as const;
  const data: Record<string, string | number> = {};

  for (const key of stringFields) {
    if (key in body) data[key] = String(body[key]);
  }
  for (const key of numericFields) {
    if (key in body) data[key] = Number(body[key]);
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const party = await prisma.partyEvent.update({
    where: { id: Number(id) },
    data,
  });

  return Response.json(party);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.partyEvent.delete({ where: { id: Number(id) } });
  return new Response(null, { status: 204 });
}
