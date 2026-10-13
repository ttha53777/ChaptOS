import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { detailActionInput } from "@/lib/event-details";
import { changeEventDetail } from "@/lib/services/calendar-service";
import { logError } from "@/lib/observability";

// No requirePerm: any member may claim a "Who's bringing what" item for
// themselves; the service decides who may clear a claim or tick the checklist.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const numId = Number((await params).id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const action = detailActionInput.parse(await req.json().catch(() => ({})));
    return Response.json({ details: await changeEventDetail(ctx, numId, action) });
  } catch (e) {
    logError(e, { route: "/api/calendar/[id]/details", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
