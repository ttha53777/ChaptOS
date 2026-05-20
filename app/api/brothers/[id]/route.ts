import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAdminOrSelf } from "@/lib/auth/require-admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { user, error } = await requireAdminOrSelf(numId);
    if (error) return error;

    const body = await req.json();

    // attendance is system-managed via /api/attendance — not patchable directly.
    // Admins can edit dues; non-admins (self) can only edit profile + service hours.
    const allowed = user.isAdmin
      ? ["name", "role", "duesOwed", "gpa", "serviceHours"] as const
      : ["name", "role", "gpa", "serviceHours"] as const;

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
      where: { id: numId },
      data,
    });

    return Response.json(brother);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Brother not found" }, { status: 404 });
    }
    console.error("PATCH /api/brothers/[id] failed:", e);
    return Response.json({ error: "Failed to update brother" }, { status: 500 });
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
    await prisma.brother.delete({ where: { id: Number(id) } });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Brother not found" }, { status: 404 });
      if (e.code === "P2003") return Response.json({ error: "Cannot delete brother with existing attendance records" }, { status: 409 });
    }
    console.error("DELETE /api/brothers/[id] failed:", e);
    return Response.json({ error: "Failed to delete brother" }, { status: 500 });
  }
}
