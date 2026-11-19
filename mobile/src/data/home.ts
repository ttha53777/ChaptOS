/**
 * Today's data: GET /api/home (up next, the plate, the live check-in), the chapter
 * announcement, and the live check-in on its own key.
 *
 * Why the live check-in has its own query: it's the moment the app has to be fastest.
 * /api/home seeds it on every fetch, the band polls it while Today is on screen, and
 * coming back to the foreground prefetches it (useLivePreload), so by the time anyone
 * looks at the band or opens the ticket the answer is already in the cache. The
 * check-in POST/DELETE answer with the new LiveCheckIn, which goes straight in.
 */
import type { Announcement, HomePlateItem, HomeResponse, LiveCheckIn } from "@/lib/api-types";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { queryClient } from "./query";

export const homeKeys = {
  home: (slug: string | null) => ["home", slug] as const,
  live: (slug: string | null) => ["liveCheckIn", slug] as const,
  announcement: (slug: string | null) => ["announcement", slug] as const,
};

/** The phone's own date, YYYY-MM-DD: what "today" and "late" are judged against. */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function fetchHome(slug: string | null): Promise<HomeResponse> {
  const home = await api<HomeResponse>("/api/home", { org: slug, query: { today: localDay() } });
  queryClient.setQueryData(homeKeys.live(slug), home.liveCheckIn);
  return home;
}

const fetchLive = (slug: string | null) => api<LiveCheckIn | null>("/api/attendance/live", { org: slug });

export function useHome() {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: homeKeys.home(slug), queryFn: () => fetchHome(slug) });
}

export function useAnnouncement() {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: homeKeys.announcement(slug),
    queryFn: () => api<Announcement>("/api/announcement", { org: slug }),
    staleTime: 5 * 60_000,
  });
}

/** True while the screen calling it is the focused one (tab roots stay mounted when hidden). */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return focused;
}

/**
 * The live window. Polls every 12s while one is showing (the web band's cadence) and
 * every 45s while none is, so a window an officer opens mid-scroll still turns up;
 * only while `poll` (the screen is focused).
 */
export function useLiveCheckIn(poll: boolean) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: homeKeys.live(slug),
    queryFn: () => fetchLive(slug),
    staleTime: 5_000,
    refetchInterval: q => (!poll ? false : q.state.data ? 12_000 : 45_000),
  });
}

/** Mount once in the signed-in shell: fetch the live check-in as the app comes forward. */
export function useLivePreload() {
  useEffect(() => {
    const sub = AppState.addEventListener("change", s => {
      if (s !== "active") return;
      const { slug } = activeOrg.get();
      if (!slug) return;
      void queryClient.prefetchQuery({ queryKey: homeKeys.live(slug), queryFn: () => fetchLive(slug), staleTime: 0 });
    });
    return () => sub.remove();
  }, []);
}

/* ── writes ───────────────────────────────────────────────────────────────────── */

/** POST (check in) or DELETE (undo) — the answer is the window as it now stands. */
export async function setCheckedIn(eventId: number, here: boolean): Promise<LiveCheckIn | null> {
  const { slug } = activeOrg.get();
  const live = await api<LiveCheckIn | null>(`/api/attendance/${eventId}/check-in`, { method: here ? "POST" : "DELETE", org: slug });
  queryClient.setQueryData(homeKeys.live(slug), live);
  return live;
}

/** Re-read the window after a refusal, so the band shows what's really true. */
export function refreshLive(): Promise<void> {
  const { slug } = activeOrg.get();
  return queryClient.invalidateQueries({ queryKey: homeKeys.live(slug) });
}

export const plateKey = (item: HomePlateItem): string =>
  item.kind === "task" ? `task-${item.task.id}` : item.kind === "poll" ? `poll-${item.poll.id}` : "dues";

/** Take a row off the plate in the cache (optimistic); returns a function that puts it back where it was. */
export function dropFromPlate(key: string): () => void {
  const { slug } = activeOrg.get();
  const k = homeKeys.home(slug);
  const before = queryClient.getQueryData<HomeResponse>(k);
  const at = before?.plate.findIndex(p => plateKey(p) === key) ?? -1;
  const item = before?.plate[at];
  if (!before || !item) return () => {};
  queryClient.setQueryData<HomeResponse>(k, h => h && { ...h, plate: h.plate.filter(p => plateKey(p) !== key) });
  return () => queryClient.setQueryData<HomeResponse>(k, h => {
    if (!h || h.plate.some(p => plateKey(p) === key)) return h;
    const plate = [...h.plate];
    plate.splice(Math.min(at, plate.length), 0, item);
    return { ...h, plate };
  });
}

/** After a write, quietly re-read Today in the background. */
export function refreshHome(): Promise<void> {
  const { slug } = activeOrg.get();
  return queryClient.invalidateQueries({ queryKey: homeKeys.home(slug) });
}
