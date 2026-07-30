// PRIVILEGED client (DIRECT_URL / BYPASSRLS). SalesLead carries an enforcing
// `org_isolation` policy and this is a cross-tenant read with no active org, so
// the app role would return an empty list rather than an error. Orphaned leads
// (organizationId NULL, org since deleted) are unreachable by ANY org-scoped
// client by construction, which makes this the only place they can be read.
import { prismaPrivileged as prisma } from "@/lib/prisma-privileged"; // lint-modules:ignore (cross-org platform-admin surface, BYPASSRLS by design)
import { requireAdmin } from "@/lib/auth/require-admin";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

// GET /api/admin/leads — every "talk to us" request, newest first.
//
// The reason this endpoint exists: /contact is a client-side mailto builder, so
// before this a quote request only existed if the person actually sent the mail.
// SalesLead rows are written server-side the moment someone asks, which makes
// this the first durable pipeline view in the product.
//
// Cross-tenant by nature (that's the point), and includes ORPHANED leads whose
// org has since been deleted — SalesLead.organizationId is ON DELETE SET NULL
// precisely so those survive. They are invisible to the org-scoped client, so
// this is the only place they can be read at all.

const MAX_ROWS = 200;

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    const rows = await prisma.salesLead.findMany({ // lint-direct-prisma:ignore (cross-tenant audit)
      take: MAX_ROWS,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, kind: true, status: true, memberCount: true,
        contactName: true, contactEmail: true, message: true,
        createdAt: true, brotherId: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    return Response.json({
      leads: rows.map(r => ({
        id:           r.id,
        kind:         r.kind,
        status:       r.status,
        memberCount:  r.memberCount,
        contactName:  r.contactName,
        contactEmail: r.contactEmail,
        message:      r.message,
        createdAt:    r.createdAt.toISOString(),
        brotherId:    r.brotherId,
        // null when the org has been deleted since the lead was raised.
        org: r.organization
          ? { id: r.organization.id, name: r.organization.name, slug: r.organization.slug }
          : null,
      })),
    });
  } catch (e) {
    logError(e, { route: "/api/admin/leads", method: "GET", userId: user.id });
    return toResponse(e);
  }
}
