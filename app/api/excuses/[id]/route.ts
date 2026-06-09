import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { decideExcuseInput } from "@/lib/validation/excuse";
import { decideExcuse } from "@/lib/services/excuse-service";
import { logError } from "@/lib/observability";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_ATTENDANCE" });
  if (error) return error;
  try {
    const { id } = await params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError("Invalid ID");
    const body = await req.json().catch(() => ({}));
    const input = decideExcuseInput.parse(body);
    const result = await decideExcuse(ctx, numId, input);
    return Response.json(result);
  } catch (e) {
    logError(e, { route: "/api/excuses/[id]", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
