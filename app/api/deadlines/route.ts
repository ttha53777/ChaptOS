import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createDeadlineInput } from "@/lib/validation/deadline";
import { createDeadline, listDeadlines } from "@/lib/services/deadline-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listDeadlines(ctx)); }
  catch (e) {
    logError(e, { route: "/api/deadlines", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createDeadlineInput.parse(body);
    const d = await createDeadline(ctx, input);
    return Response.json(d, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/deadlines", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
