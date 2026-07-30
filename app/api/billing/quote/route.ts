import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { requestQuote } from "@/lib/services/billing-service";
import { logError } from "@/lib/observability";
import { requestQuoteInput } from "@/lib/validation/billing";

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = requestQuoteInput.parse(body);
    const result = await requestQuote(ctx, input);
    return Response.json(result, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/billing/quote", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
