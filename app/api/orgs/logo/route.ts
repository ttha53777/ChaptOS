import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { setOrgLogo, clearOrgLogo } from "@/lib/services/org-service";
import { logError } from "@/lib/observability";

// POST/DELETE /api/orgs/logo — set or remove the active org's profile picture.
//
// The org is resolved by buildContext() from the x-org-slug header (set by the
// client from the URL) or the active_org cookie — same as /api/orgs/config — so
// there is no slug in the path to drift out of sync with ctx.orgId. This single
// endpoint serves both the create-flow logo step and the Settings uploader.
//
// MANAGE_SETTINGS is the coarse route gate; setOrgLogo/clearOrgLogo re-check
// org-admin authority as the authoritative guard (org admins/platform admins
// hold every bit within the org, so they pass the route gate too).

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return Response.json({ error: "Invalid form data" }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No image file provided" }, { status: 400 });
    }
    const { logoUrl } = await setOrgLogo(ctx, file);
    return Response.json({ logoUrl });
  } catch (e) {
    logError(e, { route: "/api/orgs/logo", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE() {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  try {
    await clearOrgLogo(ctx);
    return Response.json({ logoUrl: null });
  } catch (e) {
    logError(e, { route: "/api/orgs/logo", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
