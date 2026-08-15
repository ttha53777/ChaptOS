import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createEventFieldInput } from "@/lib/validation/event-fields";
import { createEventField, listEventFields } from "@/lib/services/event-field-service";
import { logError } from "@/lib/observability";

// No permission gate on the read: every member's event panel needs the full set
// to resolve the label of an answer already filed on an event.
export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listEventFields(ctx));
  } catch (e) {
    logError(e, { route: "/api/events/fields", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createEventFieldInput.parse(body);
    const field = await createEventField(ctx, input);
    return Response.json(field, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/events/fields", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
