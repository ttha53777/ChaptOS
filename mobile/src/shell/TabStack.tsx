/**
 * Each tab's own stack (mock `pushPage` / `popPage`): pages slide in from the right over
 * the tab root, which slides back underneath (iOS native parallax); the tab bar stays.
 * iOS: edge-swipe back, interruptible mid-gesture (UINavigationController). Android: slide
 * from the right; system back pops. Our Screen draws the header, so the native one is off.
 *
 * Performance: the tab navigator (expo-router js-tabs) renders every tab at launch and
 * keeps them all live. So a tab's stack mounts on its first visit, not at launch (Home
 * no longer shares the cold start with three other screens' renders and ~15 requests), and
 * is frozen while another tab is showing (react-freeze: its tree keeps its state and last
 * frame but skips re-renders from cache updates and clocks until you come back).
 */
import { Stack, useIsFocused } from "expo-router";
import { useRef } from "react";
import { View } from "react-native";
import { Freeze } from "react-freeze";
import { useTheme } from "~/theme/PaperProvider";

export function TabStack() {
  const { c } = useTheme();
  const focused = useIsFocused();
  const visited = useRef(false);
  if (focused) visited.current = true;
  if (!visited.current) return <View style={{ flex: 1, backgroundColor: c.paper }} />;
  return (
    <Freeze freeze={!focused}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.paper },
          animation: "slide_from_right",
          gestureEnabled: true,
        }}
      />
    </Freeze>
  );
}
