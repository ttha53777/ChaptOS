import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { emit } from "@/lib/events";
import { logError } from "@/lib/observability";

// PATCH — promote or demote a brother's admin status. Platform-admin-only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  if (!ctx.isPlatformAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");

    const body = await req.json().catch(() => ({})) as { isAdmin?: unknown };
    if (typeof body.isAdmin !== "boolean") throw new ValidationError("isAdmin must be a boolean");

    if (numId === ctx.actorId && body.isAdmin === false) {
      throw new ConflictError("You cannot remove your own admin status. Ask another admin to demote you.");
    }

    const updated = await ctx.db.brother.update({
      where: { id: numId },
      data: { isAdmin: body.isAdmin },
      select: { id: true, isAdmin: true, name: true },
    });

    await emit(ctx, "brother.admin_changed", { type: "Brother", id: updated.id }, {
      name: updated.name, isAdmin: updated.isAdmin,
    });

    return Response.json({ id: updated.id, isAdmin: updated.isAdmin });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025") {
      return toResponse(new NotFoundError("Brother"));
    }
    logError(e, { route: "/api/auth/accounts/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// DELETE — unlink auth account from a brother row. Platform-admin-only.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  if (!ctx.isPlatformAdmin) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");

    const target = await ctx.db.brother.findUnique({
      where: { id: numId },
      select: { authUserId: true, name: true },
    });
    if (!target) throw new NotFoundError("Brother");
    if (target.authUserId === ctx.authUserId) {
      throw new ConflictError("You cannot unlink your own account");
    }

    await ctx.db.brother.update({ where: { id: numId }, data: { authUserId: null } });
    await emit(ctx, "brother.account_unlinked", { type: "Brother", id: numId }, {
      name: target.name, bySelf: false,
    });

    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/auth/accounts/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
