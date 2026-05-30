import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createServiceEventInput } from "@/lib/validation/service-event";
import { createServiceEvent, listServiceEvents } from "@/lib/services/service-event-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listServiceEvents(ctx)); }
  catch (e) {
    logError(e, { route: "/api/service-events", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SERVICE" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createServiceEventInput.parse(body);
    const result = await createServiceEvent(ctx, input);
    return Response.json(result, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/service-events", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
