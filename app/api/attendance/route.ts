import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { recordAttendanceInput } from "@/lib/validation/attendance";
import { recordAttendance } from "@/lib/services/attendance-service";
import { logError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = recordAttendanceInput.parse(body);
    const updated = await recordAttendance(ctx, input);
    return Response.json(updated);
  } catch (e) {
    logError(e, { route: "/api/attendance", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
