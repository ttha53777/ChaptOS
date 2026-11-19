import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { homeQuery } from "@/lib/validation/home";
import { getDashboard } from "@/lib/services/dashboard-service";
import { logError } from "@/lib/observability";

// GET /api/dashboard?today=YYYY-MM-DD — the dashboard's inputs in one call, for the
// app's Home tab (it derives the page with lib/dashboard, as the web page does). Any member.
export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { today } = homeQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
    return Response.json(await getDashboard(ctx, today), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logError(e, { route: "/api/dashboard", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
