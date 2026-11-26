import { z } from "zod";

// Push notification inputs. Zod only: the native app imports these directly.

/** An Expo push token: ExponentPushToken[…] (or the older ExpoPushToken[…]). */
const expoToken = z.string().trim().regex(/^Expo(nent)?PushToken\[[^\]]{1,200}\]$/, "Not an Expo push token");

// POST /api/push/devices — register or refresh this phone. Idempotent on token.
export const registerPushDeviceInput = z.object({
  token:      expoToken,
  platform:   z.enum(["ios", "android"]),
  appVersion: z.string().trim().max(32).nullish(),
});

// DELETE /api/push/devices — sign-out forgets this phone.
export const unregisterPushDeviceInput = z.object({
  token: expoToken,
});

// PATCH /api/push/preferences — switch one category on or off in the active org.
export const updatePushPreferenceInput = z.object({
  category: z.enum(["checkin", "tasks", "dues", "attendance", "requests"]),
  enabled:  z.boolean(),
});
