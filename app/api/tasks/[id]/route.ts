import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updateTaskInput } from "@/lib/validation/task";
import { deleteTask, updateTask } from "@/lib/services/task-service";
import { logError } from "@/lib/observability";

// PATCH gates on VIEW only (no requirePerm): an assignee without MANAGE_TASKS
// must be able to flip their own task's status to done. The service splits the
// authority — field edits + reassignment require MANAGE_TASKS, a status flip is
// allowed for an assignee — so the route stays thin.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = updateTaskInput.parse(body);
    return Response.json(await updateTask(ctx, numId, input));
  } catch (e) {
    logError(e, { route: "/api/tasks/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TASKS" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    await deleteTask(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: "/api/tasks/[id]", method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
