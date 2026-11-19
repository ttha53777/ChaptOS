/**
 * Each tab's own stack (mock `pushPage` / `popPage`): pages slide in from the right over
 * the tab root, which slides back underneath (iOS native parallax); the tab bar stays.
 * iOS: edge-swipe back, interruptible mid-gesture (UINavigationController). Android: slide
 * from the right; system back pops. Our Screen draws the header, so the native one is off.
 */
import { Stack } from "expo-router";
import { useTheme } from "~/theme/PaperProvider";

export function TabStack() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.paper },
        animation: "slide_from_right",
        gestureEnabled: true,
      }}
    />
  );
}
