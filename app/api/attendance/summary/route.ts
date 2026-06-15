import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { summarizeAttendance } from "@/lib/services/attendance-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    return Response.json(await summarizeAttendance(ctx, { category: searchParams.get("category") }));
  } catch (e) {
    logError(e, { route: "/api/attendance/summary", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
