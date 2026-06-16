import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { logParticipationInput } from "@/lib/validation/service-participation";
import { listParticipationForEvent, logParticipation } from "@/lib/services/service-participation-service";
import { logError } from "@/lib/observability";

// GET: per-event participation roster. Read-only — any member of the org may view.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    return Response.json(await listParticipationForEvent(ctx, numId));
  } catch (e) {
    logError(e, { route: "/api/service-events/[id]/participation", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

// POST: log/upsert the hours for one or more members at this event. This is the
// officer "Log hours" flow (recording who attended an event), so it requires
// MANAGE_SERVICE. A member adjusting only their own running total still goes
// through the existing self-edit path on the roster (PATCH /api/brothers/[id]),
// matching the pre-redesign behaviour.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SERVICE" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = logParticipationInput.parse(body);
    return Response.json(await logParticipation(ctx, numId, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/service-events/[id]/participation", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
