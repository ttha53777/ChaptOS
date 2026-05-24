import { NextRequest } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { requirePermission } from "@/lib/auth/require-permission";
import { logActivity } from "@/lib/activity";
import { checkMutationRate } from "@/lib/rate-limit";
import { logError } from "@/lib/observability";

const NAME_MAX = 60;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// 32-bit unsigned cap — keeps `permissions` inside the JSON-safe range and
// rejects bit ≥ 32 (we don't define any yet, so anything above that is junk).
const MAX_PERM_BITS = 0xffffffff;

export async function GET() {
  // Anyone signed in can read the role list — the UI needs it for chips and
  // for the "Assign role" picker (which is also visible to non-admins so they
  // can see what their teammates are).
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const roles = await prisma.role.findMany({
      orderBy: [{ rank: "desc" }, { name: "asc" }],
      include: { _count: { select: { brothers: true } } },
    });
    return Response.json(
      roles.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        rank: r.rank,
        permissions: r.permissions,
        isSystem: r.isSystem,
        memberCount: r._count.brothers,
      })),
    );
  } catch (e) {
    logError(e, { route: "/api/roles", method: "GET", userId: user.id });
    return Response.json({ error: "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requirePermission("MANAGE_ROLES");
  if (error) return error;
  const limited = checkMutationRate(user.id);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = typeof body.color === "string" ? body.color.trim() : null;
  const rank = Number(body.rank ?? 0);
  const permissions = Number(body.permissions ?? 0);

  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (name.length > NAME_MAX) return Response.json({ error: `name must be ≤ ${NAME_MAX} chars` }, { status: 400 });
  if (color && !COLOR_RE.test(color)) return Response.json({ error: "color must be #RRGGBB" }, { status: 400 });
  if (!Number.isInteger(rank) || rank < 0) return Response.json({ error: "rank must be a non-negative integer" }, { status: 400 });
  if (!Number.isInteger(permissions) || permissions < 0 || permissions > MAX_PERM_BITS) {
    return Response.json({ error: "permissions must be a valid 32-bit bitfield" }, { status: 400 });
  }
  // Hierarchy: callers can only create roles strictly below their own max rank.
  // Super-admins (Infinity maxRank) bypass this.
  if (rank >= user.maxRank) {
    return Response.json({ error: "Cannot create a role at or above your own rank" }, { status: 403 });
  }

  try {
    const role = await prisma.role.create({
      data: { name, color: color || null, rank, permissions, isSystem: false },
    });

    await logActivity({
      actorId: user.id,
      type: "info",
      message: `${user.name} created role "${role.name}" (rank ${role.rank})`,
    });

    return Response.json(role, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ error: "A role with that name already exists" }, { status: 409 });
    }
    logError(e, { route: "/api/roles", method: "POST", userId: user.id });
    return Response.json({ error: "Failed to create role" }, { status: 500 });
  }
}
