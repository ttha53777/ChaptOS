import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createFolderInput } from "@/lib/validation/doc";
import { createFolder, listFolders } from "@/lib/services/doc-folder-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listFolders(ctx)); }
  catch (e) {
    logError(e, { route: "/api/docs/folders", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return Response.json([]);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_DOCS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createFolderInput.parse(body);
    const folder = await createFolder(ctx, input);
    return Response.json(folder, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/docs/folders", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
