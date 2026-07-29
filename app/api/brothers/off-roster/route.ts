import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listOffRosterMembers } from "@/lib/services/brother-service";
import { logError } from "@/lib/observability";

// People with access to this org who can never appear on its roster, because
// their Brother row's home org is elsewhere (Phase 1 limitation — see
// listOffRosterMembers). Kept off GET /api/brothers deliberately: that route
// returns a bare array consumed by ChapterContext and the roster table, and
// these members have no roster columns to fill.
//
// MANAGE_BROTHERS, matching the roster page's own gate — this is an admin
// diagnostic, not member-facing.

export async function GET() {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS", rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listOffRosterMembers(ctx));
  } catch (e) {
    logError(e, { route: "/api/brothers/off-roster", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
