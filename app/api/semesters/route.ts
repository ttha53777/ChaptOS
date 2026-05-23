import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logActivity } from "@/lib/activity";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const semesters = await prisma.semester.findMany({ orderBy: { id: "desc" } });
    return Response.json(semesters);
  } catch (e) {
    logError(e, { route: "/api/semesters", method: "GET", userId: user?.id });
    return Response.json({ error: "Failed to fetch semesters" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error) return error;

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

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} created semester ${semester.label} and made it active`,
    });

    return Response.json(semester, { status: 201 });
  } catch (e: unknown) {
    const isPrismaError = e && typeof e === "object" && "code" in e;
    if (isPrismaError && (e as { code: string }).code === "P2002") {
      return Response.json({ error: "A semester with that label already exists" }, { status: 409 });
    }
    logError(e, { route: "/api/semesters", method: "POST", userId: user?.id });
    return Response.json({ error: "Failed to create semester" }, { status: 500 });
  }
}
