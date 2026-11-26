// Push notification shapes. Type-only: see lib/api-types/index.ts for the rules.

/** POST /api/push/devices and DELETE /api/push/devices. */
export interface PushDeviceResponse {
  ok: true;
}

export type PushCategoryId = "checkin" | "tasks" | "dues" | "attendance" | "requests";

/** One switchable category, in display order. Only categories this member can receive are sent. */
export interface PushPreference {
  id: PushCategoryId;
  label: string;
  description: string;
  enabled: boolean;
}

/** GET /api/push/preferences — the active org's categories for the caller. */
export interface PushPreferencesResponse {
  categories: PushPreference[];
}

/**
 * The `data` every push carries. `url` is chaptos://org/<slug>/<path>, where
 * path is one of: checkin, tasks/<id>, polls/<id>, dues, excuses, today, requests.
 */
export interface PushPayload {
  url: string;
  orgSlug: string;
  category: PushCategoryId | "membership";
}
