import { requireUser } from "@/lib/auth/require-user";
import { db } from "@/lib/db"; // lint-modules:ignore (read-only listing for admin UI)
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Membership gate (mirrors buildContext's at request-context.ts and the check in
  // /api/auth/active-org). This route reads with db(user.orgId) directly instead of
  // buildContext, so without this a removed member whose stale Brother.organizationId
  // still points here would read the org's full roster. Platform admins are exempt.
  const isMember = user.isPlatformAdmin || user.memberships.some(m => m.organizationId === user.orgId);
  if (!isMember) return Response.json({ error: "Forbidden" }, { status: 403 });

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
      const [roster, roleRows] = await Promise.all([
        // The one caller that genuinely needs email — this is the account-admin
        // surface — so it opts in explicitly.
        db(user.orgId).member.listRoster({ fields: "contact" }),
        db(user.orgId).brotherRole.listWithRole([]),
      ]);
      const rolesByBrotherId = new Map<number, { role: { id: number; name: string; color: string | null; rank: number } }[]>();
      for (const br of roleRows) {
        const list = rolesByBrotherId.get(br.brotherId) ?? [];
        list.push({ role: br.role });
        rolesByBrotherId.set(br.brotherId, list);
      }
      brothers = roster.map(b => ({
        id: b.id, name: b.name, role: b.role, authUserId: b.authUserId,
        isAdmin: b.isOrgAdmin, email: b.email ?? null,
        roles: rolesByBrotherId.get(b.id) ?? [],
      }));
    } catch {
      const roster = await db(user.orgId).member.listRoster({ fields: "contact" });
      brothers = roster.map(b => ({
        id: b.id, name: b.name, role: b.role, authUserId: b.authUserId,
        isAdmin: b.isOrgAdmin, email: b.email ?? null,
      }));
    }
    // Membership.name is nullable with a fallback, so the ordering that used to
    // be a SQL `orderBy: { name: "asc" }` happens here, on the resolved name.
    brothers.sort((a, b) => a.name.localeCompare(b.name));

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
