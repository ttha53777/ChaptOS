import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { listMyAttendance } from "@/lib/services/attendance-service";
import { logError } from "@/lib/observability";

// The signed-in member's own present marks — no permission beyond membership,
// because the service pins the read to ctx.actorId.
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listMyAttendance(ctx));
  } catch (e) {
    logError(e, { route: "/api/attendance/mine", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
