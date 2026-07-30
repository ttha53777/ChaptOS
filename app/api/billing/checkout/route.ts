import { NextRequest } from "next/server";
import { appOrigin } from "@/lib/billing/urls";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { startCheckout } from "@/lib/services/billing-service";
import { logError } from "@/lib/observability";
import { startCheckoutInput } from "@/lib/validation/billing";

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = startCheckoutInput.parse(body);
    const result = await startCheckout(ctx, input, appOrigin(req));
    return Response.json(result, { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/billing/checkout", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
