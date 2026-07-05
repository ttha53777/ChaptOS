import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { reorderFoldersInput } from "@/lib/validation/doc";
import { reorderFolders } from "@/lib/services/doc-folder-service";
import { logError } from "@/lib/observability";

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_DOCS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const { orderedIds } = reorderFoldersInput.parse(body);
    return Response.json(await reorderFolders(ctx, orderedIds));
  } catch (e) {
    logError(e, { route: "/api/docs/folders/reorder", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
