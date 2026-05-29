import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { db } from "@/lib/db";
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
    const body = await req.json();

    const allowed = ["title", "dueDate", "owner", "status", "type"] as const;
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

    const task = await db(user.orgId).instagramTask.update({
      where: { id: Number(id) },
      data,
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated IG task ${task.title}`,
      orgId: user.orgId,
    });

    return Response.json(task);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Instagram task not found" }, { status: 404 });
    }
    logError(e, { route: "/api/instagram/[id]", method: "PATCH", userId: user?.id });
    return Response.json({ error: "Failed to update instagram task" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_INSTAGRAM");
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    const target = await db(user.orgId).instagramTask.findUnique({
      where: { id: numId },
      select: { title: true },
    });
    await db(user.orgId).instagramTask.delete({ where: { id: numId } });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} deleted IG task ${target?.title ?? `#${numId}`}`,
      orgId: user.orgId,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Instagram task not found" }, { status: 404 });
    }
    logError(e, { route: "/api/instagram/[id]", method: "DELETE", userId: user?.id });
    return Response.json({ error: "Failed to delete instagram task" }, { status: 500 });
  }
}
