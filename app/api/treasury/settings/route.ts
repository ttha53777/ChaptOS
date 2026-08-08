import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { toResponse } from "@/lib/errors";
import { updateTreasurySettingsInput } from "@/lib/validation/treasury-settings";
import { setOpeningBalance } from "@/lib/services/treasury-settings-service";
import { logError } from "@/lib/observability";

// There is deliberately no GET: the opening balance rides along on GET /api/treasury,
// which every client already fetches, rather than costing a second round trip.
export async function PATCH(req: NextRequest) {
  const { ctx, error } = await buildContext({ requirePerm: "MANAGE_TREASURY" });
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    const input = updateTreasurySettingsInput.parse(body);
    return Response.json(await setOpeningBalance(ctx, input));
  } catch (e) {
    logError(e, { route: "/api/treasury/settings", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
