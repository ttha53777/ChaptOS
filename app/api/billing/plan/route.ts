import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { changePlan } from "@/lib/services/billing-service";
import { changePlanInput } from "@/lib/validation/billing";
import { logError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requireOrgAdmin: true });
  if (error) return error;
  try {
    const input = changePlanInput.parse(await req.json());
    return Response.json(await changePlan(ctx, input));
  } catch (e) {
    logError(e, { route: "/api/billing/plan", method: "POST", userId: ctx.actorId });
    return toResponse(e);
  }
}
