/**
 * Home's data: GET /api/dashboard, the web dashboard's inputs in one round trip, and
 * the week's narration (POST /api/ai/digest, the same call the web page makes).
 *
 * The key sits under ["home", slug] on purpose: every write that already invalidates
 * Today's home query (a task ticked, a vote cast, a check-in) refreshes this too.
 */
import type { DashboardResponse } from "@/lib/api-types";
import { digestRequest, type WeekDigest } from "@/lib/dashboard/week";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { useActiveOrg } from "~/state/org";
import { localDay } from "./home";

export const dashKeys = {
  dashboard: (slug: string | null) => ["home", slug, "dashboard"] as const,
  digest: (slug: string | null, key: string) => ["home", slug, "digest", key] as const,
};

export function useDashboard() {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: dashKeys.dashboard(slug),
    queryFn: () => api<DashboardResponse>("/api/dashboard", { org: slug, query: { today: localDay() } }),
  });
}

/** The briefing line. Only asked for when the week has something to say; one call per week state. */
export function useDigest(week: WeekDigest | null, igEnabled: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: dashKeys.digest(slug, week?.key ?? ""),
    enabled: !!week?.hasSignal,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    retry: false,
    queryFn: async () => (await api<{ narration?: string | null }>("/api/ai/digest", { method: "POST", org: slug, body: digestRequest(week!, igEnabled) })).narration ?? null,
  });
}
