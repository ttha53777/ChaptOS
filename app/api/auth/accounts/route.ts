import { requireUser } from "@/lib/auth/require-user";
import { db } from "@/lib/db"; // lint-modules:ignore (read-only listing for admin UI)
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Try the with-roles query first (post-migration). If the role tables
    // don't exist yet, fall through to a query without them — the UI shows
    // empty chip lists until `prisma migrate` runs.
    let brothers: Array<{
      id: number;
      name: string;
      role: string;
      authUserId: string | null;
      isAdmin: boolean;
      email: string | null;
      roles?: { role: { id: number; name: string; color: string | null; rank: number } }[];
    }>;
    try {
      brothers = await db(user.orgId).brother.findMany({
        where: { isGhost: false },
        select: {
          id: true, name: true, role: true, authUserId: true, isAdmin: true, email: true,
          roles: {
            select: {
              role: { select: { id: true, name: true, color: true, rank: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      });
    } catch {
      brothers = await db(user.orgId).brother.findMany({
        where: { isGhost: false },
        select: { id: true, name: true, role: true, authUserId: true, isAdmin: true, email: true },
        orderBy: { name: "asc" },
      });
    }

    return Response.json(
      brothers.map(b => ({
        id: b.id,
        name: b.name,
        role: b.role,
        linked: b.authUserId !== null,
        isSelf: b.authUserId === user.authUserId,
        isAdmin: b.isAdmin,
        email: b.email,
        roles: (b.roles ?? [])
          .map(r => r.role)
          .sort((a, z) => z.rank - a.rank),
      }))
    );
  } catch (e) {
    logError(e, { route: "/api/auth/accounts", method: "GET", userId: user?.id });
    return toResponse(e);
  }
}
