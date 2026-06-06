import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/require-user";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { deleteOrgInput } from "@/lib/validation/org";
import { summarizeOrgForDeletion, deleteOrg } from "@/lib/services/org-service";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";

// GET    /api/orgs/manage — summary of what deleting the active org would remove.
// DELETE /api/orgs/manage — permanently delete the active org (admin only).
//
// The active org is resolved by buildContext() from the x-org-slug header / the
// active_org cookie, so there's no org id in the path to drift. Both handlers
// are org-admin gated inside the service; the route adds a same-origin CSRF
// guard on the destructive verb (cookies are SameSite=Lax — see same-origin.ts).

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const summary = await summarizeOrgForDeletion(ctx);
    return Response.json(summary);
  } catch (e) {
    logError(e, { route: "/api/orgs/manage", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  // CSRF: this is a cookie-gated, irreversible state change. Reject cross-origin
  // browser callers before touching anything.
  if (!isSameOrigin(req)) {
    return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const { ctx, error } = await buildContext();
  if (error) return error;

  // Remember which org we're deleting so we can clear the cookie if it points here.
  const deletedOrgId = ctx.orgId;

  try {
    const body = await req.json().catch(() => ({}));
    const input = deleteOrgInput.parse(body);
    const result = await deleteOrg(ctx, input.confirmSlug);

    // Clear the active_org cookie when it referenced the org we just deleted, so
    // the next slug-less request doesn't resolve a dangling org id. The client
    // hard-navigates afterward; org resolution then falls back to a remaining
    // membership (or /welcome when none remain).
    const res = NextResponse.json({ ok: true, organizationId: result.organizationId, slug: result.slug });
    res.cookies.set(ACTIVE_ORG_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
    return res;
  } catch (e) {
    logError(e, { route: "/api/orgs/manage", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId, orgId: deletedOrgId } });
    return toResponse(e);
  }
}
