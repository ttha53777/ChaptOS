import { NextRequest } from "next/server";
import { getVerifiedAuthUser } from "@/lib/auth/session-user";
import { registerPushDeviceInput, unregisterPushDeviceInput } from "@/lib/validation/push";
import { registerPushDevice, unregisterPushDevice } from "@/lib/services/push-service";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { toResponse } from "@/lib/errors";
import { logError } from "@/lib/observability";
import type { PushDeviceResponse } from "@/lib/api-types";

// The caller's phone, for push. Keyed by the verified session alone, like
// /api/auth/account: a device belongs to the Google account, serves every org
// the person is in, and must register before they have a roster row (someone
// waiting on a join request still needs "You're in"). So no buildContext — no
// org is involved, and the service only ever touches the caller's own devices.

// POST — register or refresh. Idempotent on the token.
export async function POST(req: NextRequest) {
  const user = await getVerifiedAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limit = rateLimit(`push-device:${user.id}`, 10, 60_000);
  if (!limit.ok) return tooManyRequests(limit);
  try {
    const input = registerPushDeviceInput.parse(await req.json().catch(() => ({})));
    return Response.json(await registerPushDevice(user.id, input) satisfies PushDeviceResponse);
  } catch (e) {
    logError(e, { route: "/api/push/devices", method: "POST", userId: user.id });
    return toResponse(e);
  }
}

// DELETE — forget this phone (sign-out). Only the caller's own token is removed.
export async function DELETE(req: NextRequest) {
  const user = await getVerifiedAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = unregisterPushDeviceInput.parse(await req.json().catch(() => ({})));
    return Response.json(await unregisterPushDevice(user.id, input) satisfies PushDeviceResponse);
  } catch (e) {
    logError(e, { route: "/api/push/devices", method: "DELETE", userId: user.id });
    return toResponse(e);
  }
}
