import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { homeQuery } from "@/lib/validation/home";
import { getHome } from "@/lib/services/home-service";
import { logError } from "@/lib/observability";

// GET /api/home?today=YYYY-MM-DD — the app's Today tab in one call: up next,
// the member's own plate, and the live check-in. Any member.
export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { today } = homeQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
    return Response.json(await getHome(ctx, today), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logError(e, { route: "/api/home", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
