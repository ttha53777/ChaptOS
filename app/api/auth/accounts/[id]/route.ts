import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

// PATCH — promote or demote a brother's admin status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  let body: { isAdmin?: unknown };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (typeof body.isAdmin !== "boolean") {
    return Response.json({ error: "isAdmin must be a boolean" }, { status: 400 });
  }

  // Prevent self-demotion to avoid the chapter losing all admins by accident.
  if (numId === user.id && body.isAdmin === false) {
    return Response.json(
      { error: "You cannot remove your own admin status. Ask another admin to demote you." },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.brother.update({
      where: { id: numId },
      data: { isAdmin: body.isAdmin },
      select: { id: true, isAdmin: true, name: true },
    });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} ${body.isAdmin ? "promoted" : "demoted"} ${updated.name}`,
    });

    return Response.json({ id: updated.id, isAdmin: updated.isAdmin });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025") {
      return Response.json({ error: "Brother not found" }, { status: 404 });
    }
    console.error("PATCH /api/auth/accounts/[id] failed:", e);
    return Response.json({ error: "Failed to update admin status" }, { status: 500 });
  }
}

// DELETE — unlink auth account from a brother row
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    // Prevent unlinking yourself — would lock you out
    const target = await prisma.brother.findUnique({
      where: { id: numId },
      select: { authUserId: true, name: true },
    });
    if (!target) return Response.json({ error: "Brother not found" }, { status: 404 });
    if (target.authUserId === user.authUserId) {
      return Response.json({ error: "You cannot unlink your own account" }, { status: 400 });
    }

    await prisma.brother.update({
      where: { id: numId },
      data: { authUserId: null },
    });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} unlinked ${target.name}'s Google account`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("DELETE /api/auth/accounts/[id] failed:", e);
    return Response.json({ error: "Failed to unlink account" }, { status: 500 });
  }
}
