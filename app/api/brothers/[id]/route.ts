import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // Only accept known Brother fields; coerce numerics to prevent type drift
  const allowed = ["name", "role", "attendance", "duesOwed", "gpa", "serviceHours"] as const;
  const data: Record<string, string | number> = {};
  for (const key of allowed) {
    if (key in body) {
      data[key] = key === "name" || key === "role" ? String(body[key]) : Number(body[key]);
    }
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const brother = await prisma.brother.update({
    where: { id: Number(id) },
    data,
  });

  return Response.json(brother);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.brother.delete({ where: { id: Number(id) } });
  return new Response(null, { status: 204 });
}
