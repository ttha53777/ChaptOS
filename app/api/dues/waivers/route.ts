import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import { waiveDues } from "@/lib/services/dues-charge-service";
import { waiveDuesInput } from "@/lib/validation/dues";

// Forgive part of a member's tab, with a reason. No money moves, so no ledger row.
export async function POST(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    return Response.json(await waiveDues(ctx, waiveDuesInput.parse(body)), { status: 201 });
  } catch (e) {
    logError(e, { route: "/api/dues/waivers", method: "POST", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
