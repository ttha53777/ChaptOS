import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createCalendarInput } from "@/lib/validation/calendar";
import { createCalendar, listCalendar } from "@/lib/services/calendar-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    return Response.json(await listCalendar(ctx, { category: searchParams.get("category") }));
  } catch (e) {
    logError(e, { route: "/api/calendar", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createCalendarInput.parse(body);
    const event = await createCalendar(ctx, input);
    return Response.json(event, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/calendar", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
