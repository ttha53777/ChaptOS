import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { updateBrotherMetricsInput } from "@/lib/validation/metrics";
import { getBrotherMetrics, upsertBrotherMetrics } from "@/lib/services/metric-value-service";
import { logError } from "@/lib/observability";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (!Number.isInteger(numId) || numId <= 0) {
    return toResponse(new ValidationError("Invalid ID"));
  }
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const rows = await getBrotherMetrics(ctx, numId);
    return Response.json(rows);
  } catch (e) {
    logError(e, { route: `/api/brothers/${id}/metrics`, method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (!Number.isInteger(numId) || numId <= 0) {
    return toResponse(new ValidationError("Invalid ID"));
  }
  // Allow MANAGE_BROTHERS or self
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS", selfId: numId });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateBrotherMetricsInput.parse(body);
    const rows = await upsertBrotherMetrics(ctx, numId, input);
    return Response.json(rows);
  } catch (e) {
    logError(e, { route: `/api/brothers/${id}/metrics`, method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
