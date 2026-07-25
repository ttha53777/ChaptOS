import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { peekQuery } from "@/lib/validation/ai";
import { getPeek, type PeekType } from "@/lib/services/peek-service";
import { logError } from "@/lib/observability";

// The detail behind a tapped Ask Chapt answer row. Any active member — the card
// is bounded to what the chat's read tools already answer for them (see
// lib/services/peek-service). Read-only, so no write rate limit.

export async function GET(req: NextRequest) {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const { type, id } = peekQuery.parse({
      type: searchParams.get("type"),
      id:   searchParams.get("id"),
    });
    const card = await getPeek(ctx, type as PeekType, id);
    return Response.json(card);
  } catch (e) {
    logError(e, { route: "/api/ai/peek", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
