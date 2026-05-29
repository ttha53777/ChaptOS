import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { db } from "@/lib/db";
import { requirePermission, requirePermissionOrSelf } from "@/lib/auth/require-permission";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { coerceString, coerceNumber } from "@/lib/coerce";
import { logError } from "@/lib/observability";

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

    const { user, error } = await requirePermissionOrSelf("MANAGE_BROTHERS", numId);
    if (error) return error;

    const body = await req.json();

    // attendance is system-managed via /api/attendance — not patchable directly.
    // MANAGE_BROTHERS holders (incl. super-admins, via the ~0 bitfield) can edit
    // dues; everyone else editing their own row can only touch profile + service hours.
    const canManageBrothers = hasPermission(user.permissions, "MANAGE_BROTHERS");
    const allowed = canManageBrothers
      ? ["name", "role", "duesOwed", "gpa", "serviceHours"] as const
      : ["name", "role", "gpa", "serviceHours"] as const;

    const data: Record<string, string | number> = {};
    for (const key of allowed) {
      if (!(key in body)) continue;
      if (key === "name" || key === "role") {
        const s = coerceString(body[key]);
        if (s === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
        if (!s.trim()) return Response.json({ error: `${key} cannot be empty` }, { status: 400 });
        data[key] = s;
      } else {
        const n = coerceNumber(body[key]);
        if (n === undefined) return Response.json({ error: `${key} cannot be null` }, { status: 400 });
        if (n === null || n < 0) return Response.json({ error: `${key} must be a non-negative number` }, { status: 400 });
        data[key] = n;
      }
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const brother = await db(user.orgId).brother.update({
      where: { id: numId },
      data,
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated ${brother.name}'s ${Object.keys(data).join(", ")}`,
      orgId: user.orgId,
    });

    return Response.json(brother);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Brother not found" }, { status: 404 });
    }
    logError(e, { route: "/api/brothers/[id]", method: "PATCH" });
    return Response.json({ error: "Failed to update brother" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission("MANAGE_BROTHERS");
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    const target = await db(user.orgId).brother.findUnique({
      where: { id: numId },
      select: { name: true, isAdmin: true },
    });
    if (target?.isAdmin) {
      const adminCount = await db(user.orgId).brother.count({ where: { isAdmin: true } });
      if (adminCount <= 1) {
        return Response.json(
          { error: "Cannot delete the last admin. Promote another brother first." },
          { status: 409 },
        );
      }
    }
    await db(user.orgId).brother.delete({ where: { id: numId } });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} removed ${target?.name ?? `brother #${numId}`}`,
      orgId: user.orgId,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return Response.json({ error: "Brother not found" }, { status: 404 });
      if (e.code === "P2003") return Response.json({ error: "Cannot delete brother with existing attendance records" }, { status: 409 });
    }
    logError(e, { route: "/api/brothers/[id]", method: "DELETE" });
    return Response.json({ error: "Failed to delete brother" }, { status: 500 });
  }
}
