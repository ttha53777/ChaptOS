import { prisma } from "@/lib/prisma"; // lint-modules:ignore (cross-org platform-admin surface)
import { requireAdmin } from "@/lib/auth/require-admin";
import { logError } from "@/lib/observability";

// GET /api/admin/orgs — cross-org list for PlatformAdmin audit.
//
// Returns every org ordered by createdAt desc, plus the founder's display
// name (joined via Organization.createdByBrotherId). Read-only; no mutation
// surface. Bypasses the org-scoped db() wrapper deliberately — the whole
// point is to see across tenants.

const MAX_ROWS = 200;

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    // Cross-tenant audit query — db(orgId) does not fit the use case.
    const rows = await prisma.organization.findMany({ // lint-direct-prisma:ignore (cross-tenant audit)
      take: MAX_ROWS,
      orderBy: { createdAt: "desc" },
      select: {
        id:                 true,
        name:               true,
        slug:               true,
        orgType:            true,
        createdAt:          true,
        createdByBrotherId: true,
      },
    });

    // Resolve founder names in one round-trip rather than N joins.
    const founderIds = rows
      .map(r => r.createdByBrotherId)
      .filter((id): id is number => id !== null);
    const founders = founderIds.length
      ? await prisma.brother.findMany({ // lint-direct-prisma:ignore (cross-tenant audit)
          where:  { id: { in: founderIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(founders.map(f => [f.id, f.name]));

    return Response.json({
      orgs: rows.map(r => ({
        id:          r.id,
        name:        r.name,
        slug:        r.slug,
        orgType:     r.orgType,
        createdAt:   r.createdAt.toISOString(),
        founderName: r.createdByBrotherId !== null ? nameById.get(r.createdByBrotherId) ?? null : null,
      })),
    });
  } catch (e) {
    logError(e, { route: "/api/admin/orgs", method: "GET", userId: user.id });
    return Response.json({ error: "Failed to fetch organizations." }, { status: 500 });
  }
}
