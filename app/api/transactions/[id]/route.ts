import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const stringFields  = ["type", "category", "date", "description", "paymentMethod", "paidTo", "semester"] as const;
  const numericFields = ["amount"] as const;
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

  const tx = await prisma.transaction.update({
    where: { id: Number(id) },
    data,
  });

  return Response.json(tx);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.transaction.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  });
  return new Response(null, { status: 204 });
}
