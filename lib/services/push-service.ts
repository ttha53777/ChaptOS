/**
 * Push devices and preferences.
 *
 * Devices are identity-level (lib/push/devices.ts, privileged, keyed by the
 * caller's own verified authUserId). Preferences are per member per org and go
 * through ctx.db like any other org-scoped row.
 */
import type { RequestContext } from "@/lib/context";
import type { z } from "zod";
import { hasPermission } from "@/lib/permissions";
import { PUSH_CATEGORY_INFO } from "@/lib/push/categories";
import { registerDevice, unregisterDevice } from "@/lib/push/devices";
import type { registerPushDeviceInput, unregisterPushDeviceInput, updatePushPreferenceInput } from "@/lib/validation/push";
import { ForbiddenError } from "@/lib/errors";
import type { PushPreferencesResponse } from "@/lib/api-types";

export async function registerPushDevice(authUserId: string, input: z.output<typeof registerPushDeviceInput>) {
  await registerDevice(authUserId, { token: input.token, platform: input.platform, appVersion: input.appVersion ?? null });
  return { ok: true as const };
}

export async function unregisterPushDevice(authUserId: string, input: z.output<typeof unregisterPushDeviceInput>) {
  await unregisterDevice(authUserId, input.token);
  return { ok: true as const };
}

/** Categories this member can receive in the active org (officer ones need the permission). */
function visibleCategories(ctx: RequestContext) {
  return PUSH_CATEGORY_INFO.filter(c => !c.officerPerm || hasPermission(ctx.permissions, c.officerPerm));
}

export async function getPushPreferences(ctx: RequestContext): Promise<PushPreferencesResponse> {
  const rows = await ctx.db.notificationPreference.forBrothers([ctx.actorId]);
  const choice = new Map(rows.map(r => [r.category, r.enabled]));
  return {
    categories: visibleCategories(ctx).map(c => ({
      id: c.id, label: c.label, description: c.description, enabled: choice.get(c.id) ?? c.defaultOn,
    })),
  };
}

export async function setPushPreference(ctx: RequestContext, input: z.output<typeof updatePushPreferenceInput>): Promise<PushPreferencesResponse> {
  if (!visibleCategories(ctx).some(c => c.id === input.category)) {
    throw new ForbiddenError("That notification isn't available to you");
  }
  await ctx.db.notificationPreference.set(ctx.actorId, input.category, input.enabled);
  return getPushPreferences(ctx);
}
