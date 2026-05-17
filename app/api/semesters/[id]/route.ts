import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";

// PATCH — set a semester as active (deactivates all others)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    await prisma.semester.updateMany({ data: { isActive: false } });
    const semester = await prisma.semester.update({
      where: { id: numId },
      data: { isActive: true },
    });
    return Response.json(semester);
  } catch (e: unknown) {
    const isPrismaError = e && typeof e === "object" && "code" in e;
    if (isPrismaError && (e as { code: string }).code === "P2025") {
      return Response.json({ error: "Semester not found" }, { status: 404 });
    }
    console.error("PATCH /api/semesters/[id] failed:", e);
    return Response.json({ error: "Failed to update semester" }, { status: 500 });
  }
}
