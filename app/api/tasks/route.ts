import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createTaskInput } from "@/lib/validation/task";
import { createTask, listTasks } from "@/lib/services/task-service";
import { logError } from "@/lib/observability";

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("assignee") === "me";
    const status = url.searchParams.get("status") ?? undefined;
    return Response.json(await listTasks(ctx, { mine, status }));
  } catch (e) {
    logError(e, { route: "/api/tasks", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  // Creating/assigning requires MANAGE_TASKS (also enforced in the service so the
  // permission story stays in one place).
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TASKS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createTaskInput.parse(body);
    const t = await createTask(ctx, input);
    return Response.json(t, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/tasks", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
