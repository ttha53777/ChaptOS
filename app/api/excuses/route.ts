import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { NotFoundError, toResponse } from "@/lib/errors";
import { submitExcuseInput } from "@/lib/validation/excuse";
import { listExcuses, submitExcuse } from "@/lib/services/excuse-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE", rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const pendingOnly = searchParams.get("status") === "pending" || searchParams.get("pending") === "true";
    const excuses = await listExcuses(ctx, { pendingOnly });
    return Response.json(excuses);
  } catch (e) {
    logError(e, { route: "/api/excuses", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  // Submit is allowed for any signed-in user (self-submit); admins can submit
  // on behalf of others. The service enforces the brotherId rule.
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = submitExcuseInput.parse(body);
    const result = await submitExcuse(ctx, input);

    // Preserve legacy response shape: the member's roster row + excuseStatus.
    const member = await ctx.db.member.findRosterRow(result.brotherId);
    if (!member) return toResponse(new NotFoundError("Brother"));
    return Response.json({
      ...member,
      attendance: result.attendance ?? member.attendance,
      excuseStatus: result.status,
    });
  } catch (e) {
    logError(e, { route: "/api/excuses", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
