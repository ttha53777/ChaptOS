import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createProgrammingTaskInput } from "@/lib/validation/programming";
import { createProgrammingTask, listProgrammingTasks } from "@/lib/services/programming-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listProgrammingTasks(ctx)); }
  catch (e) {
    logError(e, { route: "/api/programming", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_EVENTS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createProgrammingTaskInput.parse(body);
    const task = await createProgrammingTask(ctx, input);
    return Response.json(task, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/programming", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
