import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listGhostAccounts } from "@/lib/services/brother-service";
import { logError } from "@/lib/observability";

// Legacy ghost accounts: people with read access to this org who never appear on
// its roster (see listGhostAccounts). Kept off GET /api/brothers deliberately:
// that route returns a bare array consumed by ChapterContext and the roster
// table, and these accounts have no roster columns to fill.
//
// This route used to also report members whose home org was elsewhere — people
// with access here but no roster row. That group no longer exists.
//
// MANAGE_BROTHERS, matching the roster page's own gate — this is an admin
// diagnostic, not member-facing.

export async function GET() {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS", rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listGhostAccounts(ctx));
  } catch (e) {
    logError(e, { route: "/api/brothers/ghost-accounts", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
