import type { MeResponse, MobileConfig, OwnJoinRequest } from "@/lib/api-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "~/api/client";
import { isApiError } from "~/api/errors";
import { activeOrg, setActiveOrg } from "~/state/org";
import { queryClient } from "./query";

export const keys = {
  me: (slug: string | null) => ["me", slug] as const,
  joinRequests: ["joinRequests"] as const,
  mobileConfig: ["mobileConfig"] as const,
};

/**
 * GET /api/auth/me for the active org. Resolves to null on 401: with a live
 * session that means "signed in, but on no roster anywhere" (useEntry then asks
 * /api/auth/join-requests). A 403 means the remembered org isn't one of theirs
 * any more (they left, or were removed): forget it and let the server pick.
 */
async function fetchMe(slug: string | null): Promise<MeResponse | null> {
  try {
    return await api<MeResponse>("/api/auth/me", { org: slug, allow401: true });
  } catch (e) {
    if (isApiError(e, 401)) return null;
    if (isApiError(e, 403) && slug) {
      setActiveOrg(null);
      return fetchMe(null);
    }
    throw e;
  }
}

export function useMe(enabled: boolean) {
  const { ready, slug } = activeOrg.use();
  // While a chapter switch loads, keep showing the previous chapter's `me`: without it
  // the entry state drops to "loading" and the whole tab tree unmounts mid-switch.
  const query = useQuery({ queryKey: keys.me(slug), queryFn: () => fetchMe(slug), enabled: enabled && ready, placeholderData: keepPreviousData });
  // Adopt the org the server resolved, so later calls name it explicitly. Never from
  // placeholder data: that's the chapter being switched away from.
  const data = query.data;
  const placeholder = query.isPlaceholderData;
  useEffect(() => {
    const resolved = data?.org?.slug ?? null;
    if (placeholder || !data || !resolved || resolved === slug) return;
    queryClient.setQueryData(keys.me(resolved), data);
    setActiveOrg(resolved);
  }, [data, slug, placeholder]);
  return query;
}

/** The caller's own join requests. Works with no roster row; 401 here means the session is gone. */
export function useJoinRequests(enabled: boolean) {
  return useQuery({
    queryKey: keys.joinRequests,
    queryFn: () => api<OwnJoinRequest[]>("/api/auth/join-requests", { org: null }),
    enabled,
  });
}

/** Public: version floor, store links, current terms version. */
export function useMobileConfig() {
  return useQuery({
    queryKey: keys.mobileConfig,
    queryFn: () => api<MobileConfig>("/api/mobile/config", { anonymous: true, org: null }),
    staleTime: 5 * 60_000,
  });
}
