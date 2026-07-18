import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createEventTypeInput } from "@/lib/validation/event-types";
import { createEventType, listEventTypes } from "@/lib/services/calendar-event-type-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listEventTypes(ctx));
  } catch (e) {
    logError(e, { route: "/api/calendar/event-types", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createEventTypeInput.parse(body);
    const type = await createEventType(ctx, input);
    return Response.json(type, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/calendar/event-types", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
