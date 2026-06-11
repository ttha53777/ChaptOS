import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { updateMetricDefinitionInput } from "@/lib/validation/metrics";
import { softDeleteMetricDefinition, updateMetricDefinition } from "@/lib/services/metric-definition-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateMetricDefinitionInput.parse(body);
    const def = await updateMetricDefinition(ctx, numId, input);
    return Response.json(def);
  } catch (e) {
    logError(e, { route: `/api/metrics/definitions/${id}`, method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  const { id } = await params;
  const numId = parseInt(id, 10);
  try {
    await softDeleteMetricDefinition(ctx, numId);
    return new Response(null, { status: 204 });
  } catch (e) {
    logError(e, { route: `/api/metrics/definitions/${id}`, method: "DELETE", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
