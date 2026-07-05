import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { reorderDocsInput } from "@/lib/validation/doc";
import { reorderDocs } from "@/lib/services/doc-folder-service";
import { logError } from "@/lib/observability";

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_DOCS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const { folderId, orderedIds } = reorderDocsInput.parse(body);
    return Response.json(await reorderDocs(ctx, folderId, orderedIds));
  } catch (e) {
    logError(e, { route: "/api/docs/reorder", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
