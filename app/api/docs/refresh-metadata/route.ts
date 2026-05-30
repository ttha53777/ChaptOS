import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse, ValidationError } from "@/lib/errors";
import { refreshDocMetadata } from "@/lib/services/doc-service";
import { logError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_DOCS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid ID");
    return Response.json(await refreshDocMetadata(ctx, id));
  } catch (e) {
    logError(e, { route: "/api/docs/refresh-metadata", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
