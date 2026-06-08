import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { leaveOrgInput } from "@/lib/validation/org";
import { leaveOrg } from "@/lib/services/membership-service";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

// POST /api/orgs/leave — the caller leaves the active org (drops their own
// membership + role grants). Any member may do this; the last org admin is
// refused by the service. The active org is resolved by buildContext() from the
// x-org-slug header / active_org cookie, so there's no org id in the path to
// drift. Same-origin CSRF guard on this destructive verb (cookies are SameSite=Lax).
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const { ctx, error } = await buildContext();
  if (error) return error;

  // Remember which org we're leaving so we can clear the cookie if it points here.
  const leftOrgId = ctx.orgId;

  try {
    const body = await req.json().catch(() => ({}));
    const input = leaveOrgInput.parse(body);
    const result = await leaveOrg(ctx, input.confirmSlug);

    // Clear the active_org cookie when it referenced the org we just left, so the
    // next slug-less request doesn't resolve a dangling org id. The client
    // hard-navigates afterward; org resolution then falls back to a remaining
    // membership (or /welcome when none remain).
    const res = NextResponse.json({ ok: true, organizationId: result.organizationId, slug: result.slug });
    res.cookies.set(ACTIVE_ORG_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
    return res;
  } catch (e) {
    logError(e, { route: "/api/orgs/leave", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId, orgId: leftOrgId } });
    return toResponse(e);
  }
}
