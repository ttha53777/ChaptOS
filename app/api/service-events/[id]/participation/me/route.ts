import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { logMyParticipationInput } from "@/lib/validation/service-participation";
import { logMyParticipation } from "@/lib/services/service-participation-service";
import { logError } from "@/lib/observability";

// POST: the acting member logs their own hours for this event. Self-service, so
// it needs no MANAGE_SERVICE — the brotherId is taken from ctx.actorId, never the
// body, so a member can only ever record their own hours. Officers logging hours
// for others still use POST /api/service-events/[id]/participation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = logMyParticipationInput.parse(body);
    return Response.json(await logMyParticipation(ctx, numId, input), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/service-events/[id]/participation/me", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
