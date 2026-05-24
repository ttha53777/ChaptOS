import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { coerceString, isValidDateString } from "@/lib/coerce";
import { logError } from "@/lib/observability";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    const body = await req.json();

    const allowed = ["title", "dueDate", "owner", "status"] as const;
    const LENGTH_LIMITS: Partial<Record<typeof allowed[number], number>> = { title: 200, owner: 200 };
    const data: Record<string, string> = {};
    for (const key of allowed) {
      if (!(key in body)) continue;
      const val = coerceString(body[key]);
      if (val === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
      const limit = LENGTH_LIMITS[key];
      if (limit && val.length > limit) return Response.json({ error: `${key} too long` }, { status: 400 });
      if (key === "dueDate" && !isValidDateString(val)) {
        return Response.json({ error: "dueDate must use YYYY-MM-DD format" }, { status: 400 });
      }
      data[key] = val;
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const deadline = await prisma.deadline.update({
      where: { id: numId },
      data,
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated deadline ${deadline.title}`,
    });

    return Response.json(deadline);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Deadline not found" }, { status: 404 });
    }
    logError(e, { route: "/api/deadlines/[id]", method: "PATCH", userId: user?.id });
    return Response.json({ error: "Failed to update deadline" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_EVENTS");
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }
    const target = await prisma.deadline.findUnique({
      where: { id: numId },
      select: { title: true },
    });
    await prisma.deadline.delete({ where: { id: numId } });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} deleted deadline ${target?.title ?? `#${numId}`}`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Deadline not found" }, { status: 404 });
    }
    logError(e, { route: "/api/deadlines/[id]", method: "DELETE", userId: user?.id });
    return Response.json({ error: "Failed to delete deadline" }, { status: 500 });
  }
}
