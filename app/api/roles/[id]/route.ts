import { NextRequest } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

const NAME_MAX = 60;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_PERM_BITS = 0xffffffff;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requirePermission("MANAGE_ROLES");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await prisma.role.findUnique({ where: { id: numId } });
  if (!existing) return Response.json({ error: "Role not found" }, { status: 404 });

  // Hierarchy: can't edit a role at or above your own rank.
  if (existing.rank >= user.maxRank) {
    return Response.json({ error: "Cannot edit a role at or above your own rank" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const data: { name?: string; color?: string | null; rank?: number; permissions?: number } = {};

  if ("name" in body) {
    if (existing.isSystem) return Response.json({ error: "System roles cannot be renamed" }, { status: 400 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > NAME_MAX) return Response.json({ error: "name must be 1–60 chars" }, { status: 400 });
    data.name = name;
  }
  if ("color" in body) {
    const c = body.color;
    if (c === null || c === "") data.color = null;
    else if (typeof c === "string" && COLOR_RE.test(c.trim())) data.color = c.trim();
    else return Response.json({ error: "color must be #RRGGBB or null" }, { status: 400 });
  }
  if ("rank" in body) {
    const r = Number(body.rank);
    if (!Number.isInteger(r) || r < 0) return Response.json({ error: "rank must be a non-negative integer" }, { status: 400 });
    // Promoting a role to rank ≥ caller's own max would let them lose control of it.
    if (r >= user.maxRank) return Response.json({ error: "Cannot raise rank to or above your own" }, { status: 403 });
    data.rank = r;
  }
  if ("permissions" in body) {
    const p = Number(body.permissions);
    if (!Number.isInteger(p) || p < 0 || p > MAX_PERM_BITS) {
      return Response.json({ error: "permissions must be a valid 32-bit bitfield" }, { status: 400 });
    }
    data.permissions = p;
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  try {
    const role = await prisma.role.update({ where: { id: numId }, data });
    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} updated role "${role.name}"`,
    });
    return Response.json(role);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return Response.json({ error: "Name already in use" }, { status: 409 });
      if (e.code === "P2025") return Response.json({ error: "Role not found" }, { status: 404 });
    }
    logError(e, { route: "/api/roles/[id]", method: "PATCH", userId: user.id });
    return Response.json({ error: "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requirePermission("MANAGE_ROLES");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existing = await prisma.role.findUnique({ where: { id: numId } });
  if (!existing) return Response.json({ error: "Role not found" }, { status: 404 });
  if (existing.isSystem) return Response.json({ error: "System roles cannot be deleted" }, { status: 400 });
  if (existing.rank >= user.maxRank) {
    return Response.json({ error: "Cannot delete a role at or above your own rank" }, { status: 403 });
  }

  try {
    // BrotherRole cascades on Role deletion (schema-defined), so we don't need
    // to clear assignments manually — but log the count for the audit trail.
    const memberCount = await prisma.brotherRole.count({ where: { roleId: numId } });
    await prisma.role.delete({ where: { id: numId } });

    await logActivity({
      actorId: user.id,
      type: "warning",
      message: `${user.name} deleted role "${existing.name}" (was held by ${memberCount} brother${memberCount === 1 ? "" : "s"})`,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/roles/[id]", method: "DELETE", userId: user.id });
    return Response.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
