import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { updatePushPreferenceInput } from "@/lib/validation/push";
import { getPushPreferences, setPushPreference } from "@/lib/services/push-service";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import type { PushPreferencesResponse } from "@/lib/api-types";

// The caller's push categories in the active org (x-org-slug).

export async function GET() {
  const { ctx, error } = await buildContext({ rateLimit: false });
  if (error) return error;
  try {
    return Response.json(await getPushPreferences(ctx) satisfies PushPreferencesResponse);
  } catch (e) {
    logError(e, { route: "/api/push/preferences", method: "GET", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const { ctx, error } = await buildContext();
  if (error) return error;
  try {
    const input = updatePushPreferenceInput.parse(await req.json().catch(() => ({})));
    return Response.json(await setPushPreference(ctx, input) satisfies PushPreferencesResponse);
  } catch (e) {
    logError(e, { route: "/api/push/preferences", method: "PATCH", userId: ctx.actorId, extra: { requestId: ctx.requestId } });
    return toResponse(e);
  }
}
