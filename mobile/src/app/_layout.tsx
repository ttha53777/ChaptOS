import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { config } from "~/config";
import { useMobileConfig } from "~/data/hooks";
import { persistOptions, queryClient, resetCache } from "~/data/query";
import { EntryContext } from "~/entry/EntryContext";
import { UpdateScreen } from "~/entry/UpdateScreen";
import { useEntry } from "~/entry/useEntry";
import { isBelow } from "~/lib/version";
import { setActiveOrg } from "~/state/org";
import { updateGate, useUpdateGate } from "~/state/update-gate";
import { PaperProvider, useTheme } from "~/theme/PaperProvider";
import { FONT_FILES } from "~/theme/type";

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Routing by state. Each group of screens is guarded by the entry state
 * (src/entry/useEntry.ts); when a guard turns false the router falls back to
 * the index route, which forwards to wherever the person now belongs. The
 * update gate sits above all of it: once tripped, nothing else renders.
 */
function Shell() {
  const { c, dark } = useTheme();
  useEffect(() => { SystemUI.setBackgroundColorAsync(c.paper).catch(() => {}); }, [c.paper]);

  const gate = useUpdateGate();
  const mobileConfig = useMobileConfig();
  useEffect(() => {
    const floor = mobileConfig.data?.minVersion ?? null;
    if (floor && isBelow(config.appVersion, floor)) updateGate.set({ minVersion: floor });
  }, [mobileConfig.data?.minVersion]);

  const entry = useEntry();
  // Leaving the signed-in state (sign-out, or a refresh token that died) drops
  // the previous person's cached data and remembered org.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (entry.kind === "signedOut" && wasSignedIn.current) { setActiveOrg(null); void resetCache(); }
    if (entry.kind !== "loading") wasSignedIn.current = entry.kind !== "signedOut";
  }, [entry.kind]);

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      {gate ? <UpdateScreen minVersion={gate.minVersion} /> : (
        <EntryContext.Provider value={entry}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.paper } }}>
            <Stack.Screen name="index" />
            <Stack.Protected guard={entry.kind === "signedOut"}>
              <Stack.Screen name="sign-in" />
            </Stack.Protected>
            <Stack.Protected guard={entry.kind === "terms"}>
              <Stack.Screen name="terms" options={{ gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={entry.kind === "join"}>
              <Stack.Screen name="join" />
            </Stack.Protected>
            <Stack.Protected guard={entry.kind === "awaiting"}>
              <Stack.Screen name="awaiting" />
            </Stack.Protected>
            <Stack.Protected guard={entry.kind === "ready"}>
              <Stack.Screen name="(tabs)" />
            </Stack.Protected>
            <Stack.Protected guard={__DEV__}>
              <Stack.Screen name="lab" />
            </Stack.Protected>
            <Stack.Screen name="auth-callback" />
          </Stack>
        </EntryContext.Provider>
      )}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_FILES);
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error]);
  // A missing font is cosmetic; never strand someone on the splash over it.
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <PaperProvider>
            <Shell />
          </PaperProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
