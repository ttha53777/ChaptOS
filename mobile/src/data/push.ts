/**
 * Push preferences for the active org.
 *
 *   GET   /api/push/preferences   PushPreferencesResponse
 *   PATCH /api/push/preferences   PushPreferencesResponse (body updatePushPreferenceInput)
 *
 * Devices (POST/DELETE /api/push/devices) live in ~/push, not here: they're about
 * this phone, not the chapter.
 */
import type { PushPreferencesResponse } from "@/lib/api-types";
import type { updatePushPreferenceInput } from "@/lib/validation/push";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { queryClient } from "./query";

export const pushKeys = { prefs: (slug: string | null) => ["pushPreferences", slug] as const };

export function usePushPreferences() {
  const slug = useActiveOrg().slug;
  return useQuery({ queryKey: pushKeys.prefs(slug), queryFn: () => api<PushPreferencesResponse>("/api/push/preferences", { org: slug }) });
}

/** Flip one category. Optimistic; the server's answer replaces the cache, a failure restores it. */
export async function setPushPreference(input: z.input<typeof updatePushPreferenceInput>): Promise<void> {
  const slug = activeOrg.get().slug;
  const key = pushKeys.prefs(slug);
  const before = queryClient.getQueryData<PushPreferencesResponse>(key);
  if (before) queryClient.setQueryData<PushPreferencesResponse>(key, {
    categories: before.categories.map(c => (c.id === input.category ? { ...c, enabled: input.enabled } : c)),
  });
  try {
    const after = await api<PushPreferencesResponse>("/api/push/preferences", { method: "PATCH", org: slug, body: input });
    queryClient.setQueryData(key, after);
  } catch (e) {
    if (before) queryClient.setQueryData(key, before);
    throw e;
  }
}
