/**
 * TanStack Query, persisted to AsyncStorage so the last-known data renders
 * offline and on a cold start (build plan Phase 6 builds on this).
 *
 * The cache holds the signed-in person's data, so signing out clears both the
 * in-memory cache and the persisted copy (resetCache). The buster is the app
 * version: an update starts from a clean cache rather than reading shapes an
 * older build wrote.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { isApiError, NetworkError } from "~/api/errors";
import { config } from "~/config";

const DAY = 24 * 60 * 60 * 1000;

// TanStack assumes "always online" in React Native. NetInfo tells it the truth, so
// queries pause offline (and the screens say they're showing last-known data) and
// refetch when the phone reconnects.
onlineManager.setEventListener(setOnline =>
  NetInfo.addEventListener(state => setOnline(state.isConnected !== false && state.isInternetReachable !== false)));

// Coming back to the foreground counts as "focus": stale queries on screen refetch.
focusManager.setEventListener(handleFocus => {
  const sub = AppState.addEventListener("change", s => handleFocus(s === "active"));
  return () => sub.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY, // must be ≥ the persister's maxAge, or restored data is dropped
      retry: (count, e) => count < 2 && (e instanceof NetworkError || (isApiError(e) && e.status >= 500)),
      networkMode: "offlineFirst",
    },
    mutations: { retry: false, networkMode: "online" },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "chaptos.query-cache", throttleTime: 1000 });

/**
 * Kept out of the persisted copy: queries that never succeeded, and the live check-in.
 * The persister re-serializes the WHOLE cache to AsyncStorage on every change (throttled
 * to 1s), on the JS thread; the live window polls every 12s while one is showing, so
 * persisting it meant a full-cache JSON.stringify + write every 12s at a meeting, and a
 * restored window is stale by definition (it's refetched as the app comes forward).
 */
const NOT_PERSISTED = new Set<unknown>(["liveCheckIn"]);

export const persistOptions = {
  persister, maxAge: DAY, buster: config.appVersion,
  dehydrateOptions: { shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) => q.state.status === "success" && !NOT_PERSISTED.has(q.queryKey[0]) },
};

/** Forget everything the previous session loaded. */
export async function resetCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
