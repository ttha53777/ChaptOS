import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { createPartyInput } from "@/lib/validation/party";
import { createParty, listParties } from "@/lib/services/party-service";
import { logError } from "@/lib/observability";

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try { return Response.json(await listParties(ctx)); }
  catch (e) {
    logError(e, { route: "/api/parties", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = createPartyInput.parse(body);
    const p = await createParty(ctx, input);
    return Response.json(p, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/parties", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
