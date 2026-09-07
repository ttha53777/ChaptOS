import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { getLiveCheckIn } from "@/lib/services/attendance-service";
import { logError } from "@/lib/observability";

// GET: the live check-in band's entire read. Returns null when no window is
// open, which is the common case.
//
// rateLimit: false is load-bearing — every open dashboard polls this on an
// interval, and a room full of members would otherwise trip the default write
// limiter (30 / 10s) and blank the widget mid-meeting.
export async function GET(_req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await getLiveCheckIn(ctx));
  } catch (e) {
    logError(e, { route: "/api/attendance/live", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
