import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_ORG_COOKIE, requireUser } from "@/lib/auth/require-user";

/**
 * POST /api/auth/active-org  body: { organizationId: number }
 *
 * Set the active organization cookie. Caller must have a Membership in the
 * target org (or be a platform admin).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { organizationId?: number };
  const orgId = Number(body.organizationId);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return Response.json({ error: "Invalid organizationId" }, { status: 400 });
  }

  const allowed = user.isPlatformAdmin || user.memberships.some(m => m.organizationId === orgId);
  if (!allowed) return Response.json({ error: "Not a member of that organization" }, { status: 403 });

  const res = NextResponse.json({ ok: true, organizationId: orgId });
  res.cookies.set(ACTIVE_ORG_COOKIE, String(orgId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
