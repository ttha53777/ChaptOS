import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { config } from "~/config";
import { useMobileConfig } from "~/data/hooks";
import { persistOptions, queryClient, resetCache } from "~/data/query";
import { EntryContext } from "~/entry/EntryContext";
import { JoinApproved } from "~/entry/JoinApproved";
import { forgetLetter, takeLetter, type Letter } from "~/entry/letter";
import { UpdateScreen } from "~/entry/UpdateScreen";
import { useEntry } from "~/entry/useEntry";
import { isBelow } from "~/lib/version";
import { useChrome } from "~/shell/chrome";
import { SheetHost } from "~/shell/sheets";
import { ToastHost } from "~/shell/toast";
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
  const { stacked } = useChrome();

  // Hold the splash until there's something real to show: /me answered, or the
  // persisted copy was restored (useEntry resolves from either). Capped so a hung
  // network never strands anyone on it; index.tsx covers the rest of the wait.
  useEffect(() => {
    if (entry.kind !== "loading" || gate) SplashScreen.hideAsync().catch(() => {});
  }, [entry.kind, gate]);
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 4000);
    return () => clearTimeout(t);
  }, []);
  // A letter this phone was holding for a join request opens once the app is ready
  // with a roster row in that chapter (~/entry/letter, ~/entry/JoinApproved).
  const [letter, setLetter] = useState<Letter | null>(null);
  const slugs = entry.kind === "ready" ? entry.me.memberships.map(ms => ms.orgSlug).join(",") : "";
  useEffect(() => {
    if (!slugs) return;
    let live = true;
    void takeLetter(slugs.split(",")).then(l => { if (live && l) setLetter(l); });
    return () => { live = false; };
  }, [slugs]);

  // Leaving the signed-in state (sign-out, or a refresh token that died) drops
  // the previous person's cached data and remembered org.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (entry.kind === "signedOut" && wasSignedIn.current) { setActiveOrg(null); void resetCache(); forgetLetter(); setLetter(null); }
    if (entry.kind !== "loading") wasSignedIn.current = entry.kind !== "signedOut";
  }, [entry.kind]);

  return (
    <>
      {/* light over the black behind a scaled-back canvas; Screen sets it otherwise */}
      <StatusBar style={stacked || dark ? "light" : "dark"} />
      {gate ? <UpdateScreen minVersion={gate.minVersion} /> : (
        <EntryContext.Provider value={entry}>
          <View style={{ flex: 1 }}>
            <SheetHost>
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
                  <Stack.Screen name="checkin" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
                  <Stack.Screen name="ask" options={{ presentation: Platform.OS === "ios" ? "modal" : "fullScreenModal", animation: "slide_from_bottom", gestureEnabled: true }} />
                </Stack.Protected>
                <Stack.Protected guard={__DEV__}>
                  <Stack.Screen name="lab" />
                </Stack.Protected>
                <Stack.Screen name="auth-callback" />
              </Stack>
            </SheetHost>
            {letter && entry.kind === "ready" ? <JoinApproved letter={letter} onDone={() => setLetter(null)} /> : null}
            <ToastHost />
          </View>
        </EntryContext.Provider>
      )}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_FILES);
  // A missing font is cosmetic; never strand someone on the splash over it.
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <PaperProvider>
              <Shell />
            </PaperProvider>
          </PersistQueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
