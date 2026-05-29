import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { logError } from "@/lib/observability";

// PATCH — set a semester as active (deactivates all others)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_SEMESTERS");
  if (error) return error;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    await db(user.orgId).semester.updateMany({ data: { isActive: false } });
    const semester = await db(user.orgId).semester.update({
      where: { id: numId },
      data: { isActive: true },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} set the active semester to ${semester.label}`,
      orgId: user.orgId,
    });

    return Response.json(semester);
  } catch (e: unknown) {
    const isPrismaError = e && typeof e === "object" && "code" in e;
    if (isPrismaError && (e as { code: string }).code === "P2025") {
      return Response.json({ error: "Semester not found" }, { status: 404 });
    }
    logError(e, { route: "/api/semesters/[id]", method: "PATCH", userId: user?.id });
    return Response.json({ error: "Failed to update semester" }, { status: 500 });
  }
}
