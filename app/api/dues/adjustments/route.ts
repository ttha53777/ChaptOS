import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { adjustDues } from "@/lib/services/dues-service";
import { logError } from "@/lib/observability";
import { adjustDuesInput } from "@/lib/validation/dues";

// Changes what a member OWES. No money moves, so no ledger row is written — see
// adjustDues. This is the endpoint that replaced writing duesOwed as a raw field.
export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const body   = await req.json().catch(() => ({}));
    const input  = adjustDuesInput.parse(body);
    const result = await adjustDues(ctx, input);
    return Response.json(result, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/dues/adjustments", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
