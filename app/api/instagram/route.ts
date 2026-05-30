import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createInstagramTaskInput } from "@/lib/validation/instagram";
import { createInstagramTask, listInstagramTasks } from "@/lib/services/instagram-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listInstagramTasks(ctx)); }
  catch (e) {
    logError(e, { route: "/api/instagram", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_INSTAGRAM" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createInstagramTaskInput.parse(body);
    const t = await createInstagramTask(ctx, input);
    return Response.json(t, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/instagram", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
