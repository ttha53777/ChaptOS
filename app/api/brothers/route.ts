import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createBrotherInput } from "@/lib/validation/brother";
import { createBrother, listVisibleBrothers } from "@/lib/services/brother-service";
import { hydrateBrotherAvatars, publicBrother } from "@/lib/brother-avatar";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const brothers = await listVisibleBrothers(ctx);
    const hydrated = await hydrateBrotherAvatars(brothers);
    return Response.json(hydrated.map(publicBrother));
  } catch (e) {
    logError(e, { route: "/api/brothers", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_BROTHERS" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createBrotherInput.parse(body);
    const brother = await createBrother(ctx, input);
    return Response.json(brother, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/brothers", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
