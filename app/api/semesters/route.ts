import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const semesters = await prisma.semester.findMany({ orderBy: { id: "desc" } });
  return Response.json(semesters);
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const label = String(body.label ?? "").trim();
  const startDate = String(body.startDate ?? "").trim();
  const endDate = String(body.endDate ?? "").trim();

  if (!label || !startDate || !endDate) {
    return Response.json({ error: "label, startDate, and endDate are required" }, { status: 400 });
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return Response.json({ error: "Dates must be YYYY-MM-DD format" }, { status: 400 });
  }

  try {
    // Deactivate all existing semesters, then create the new active one
    await prisma.semester.updateMany({ data: { isActive: false } });
    const semester = await prisma.semester.create({
      data: { label, startDate, endDate, isActive: true },
    });
    return Response.json(semester, { status: 201 });
  } catch (e: unknown) {
    const isPrismaError = e && typeof e === "object" && "code" in e;
    if (isPrismaError && (e as { code: string }).code === "P2002") {
      return Response.json({ error: "A semester with that label already exists" }, { status: 409 });
    }
    console.error("POST /api/semesters failed:", e);
    return Response.json({ error: "Failed to create semester" }, { status: 500 });
  }
}
