import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { updateOrgConfigInput } from "@/lib/validation/org";
import { setWorkflows } from "@/lib/services/org-config-service";
import { logError } from "@/lib/observability";

// PATCH /api/orgs/config — replace the active org's enabled-workflow set.
//
// The org is resolved by buildContext() from the x-org-slug header (set by the
// client from the URL) or the active_org cookie — same as every other write —
// so there is no slug in the path to drift out of sync with ctx.orgId. The
// service authorizes org-admin-only and force-enables the always-on workflows,
// so a member can't hide pages and core surfaces can't be dropped.
export async function PATCH(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateOrgConfigInput.parse(body);
    const config = await setWorkflows(ctx, input);
    return Response.json(config);
  } catch (e) {
    logError(e, { route: "/api/orgs/config", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
