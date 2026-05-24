import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const brothers = await prisma.brother.findMany({
      where: { isGhost: false },
      select: {
        id: true, name: true, role: true, authUserId: true, isAdmin: true, email: true,
        // Include each brother's assigned roles so the accounts UI can show
        // chips without a fan-out N+1. Ordered by rank desc inside each row.
        roles: {
          select: {
            role: { select: { id: true, name: true, color: true, rank: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return Response.json(
      brothers.map(b => ({
        id: b.id,
        name: b.name,
        role: b.role,
        linked: b.authUserId !== null,
        isSelf: b.authUserId === user.authUserId,
        isAdmin: b.isAdmin,
        email: b.email,
        roles: b.roles
          .map(r => r.role)
          .sort((a, z) => z.rank - a.rank),
      }))
    );
  } catch (e) {
    logError(e, { route: "/api/auth/accounts", method: "GET", userId: user?.id });
    return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
