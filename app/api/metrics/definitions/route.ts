import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createMetricDefinitionInput } from "@/lib/validation/metrics";
import { createMetricDefinition, listMetricDefinitions } from "@/lib/services/metric-definition-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await listMetricDefinitions(ctx));
  } catch (e) {
    logError(e, { route: "/api/metrics/definitions", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_SETTINGS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createMetricDefinitionInput.parse(body);
    const def = await createMetricDefinition(ctx, input);
    return Response.json(def, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/metrics/definitions", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
