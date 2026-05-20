import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requireAdmin } from "@/lib/auth/require-admin";

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
      const val = String(body[key]);
      const limit = LENGTH_LIMITS[key];
      if (limit && val.length > limit) return Response.json({ error: `${key} too long` }, { status: 400 });
      data[key] = val;
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const task = await prisma.instagramTask.update({
      where: { id: Number(id) },
      data,
    });

    return Response.json(task);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Instagram task not found" }, { status: 404 });
    }
    console.error("PATCH /api/instagram/[id] failed:", e);
    return Response.json({ error: "Failed to update instagram task" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    await prisma.instagramTask.delete({ where: { id: Number(id) } });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Instagram task not found" }, { status: 404 });
    }
    console.error("DELETE /api/instagram/[id] failed:", e);
    return Response.json({ error: "Failed to delete instagram task" }, { status: 500 });
  }
}
