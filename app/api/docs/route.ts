import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createDocInput } from "@/lib/validation/doc";
import { createDoc, listDocs } from "@/lib/services/doc-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listDocs(ctx)); }
  catch (e) {
    logError(e, { route: "/api/docs", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return Response.json([]);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_DOCS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createDocInput.parse(body);
    const doc = await createDoc(ctx, input);
    return Response.json(doc, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/docs", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
