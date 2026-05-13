import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const brothers = await prisma.brother.findMany({ orderBy: { id: "asc" } });
  return Response.json(brothers);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, role, attendance, duesOwed, gpa, serviceHours } = body;

  if (
    !name ||
    !role ||
    attendance == null ||
    duesOwed == null ||
    gpa == null ||
    serviceHours == null
  ) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const brother = await prisma.brother.create({
    data: {
      name: String(name),
      role: String(role),
      attendance: Number(attendance),
      duesOwed: Number(duesOwed),
      gpa: Number(gpa),
      serviceHours: Number(serviceHours),
    },
  });

  return Response.json(brother, { status: 201 });
}
