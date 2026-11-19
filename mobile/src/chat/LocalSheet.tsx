/**
 * A sheet inside the Ask Chapt modal. The app's SheetHost lives under the native modal,
 * so the peek and citation sheets are drawn here instead, in the same paper: a scrim, a
 * card rising from the bottom with a grabber, the title row and a close ×. Drag the
 * grabber/header down (or flick) to close; tap the scrim; Android back closes it first.
 *
 * Reduced motion: scrim and card fade, no travel.
 */
import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { CloseX } from "~/shell/sheets";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function LocalSheet({ open, onClose, title, kicker, children }: { open: boolean; onClose: () => void; title?: string; kicker?: string; children: ReactNode }) {
  const { c } = useTheme();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState(open);
  const p = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setShown(true);
      drag.value = 0;
      p.value = withTiming(1, { duration: m.t(m.reduced ? 180 : 300) });
    } else if (shown) {
      p.value = withTiming(0, { duration: m.t(m.reduced ? 160 : 220) }, fin => { if (fin) scheduleOnRN(setShown, false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [open, onClose]);

  const pan = usePanGesture({
    activeOffsetY: [-6, 6],
    onUpdate: e => { "worklet"; drag.value = Math.max(0, e.translationY); },
    onDeactivate: e => {
      "worklet";
      if (drag.value > 120 || e.velocityY > 700) scheduleOnRN(onClose);
      else drag.value = withTiming(0, { duration: 200 });
    },
  });

  const reduced = m.reduced;
  const scrim = useAnimatedStyle(() => ({ opacity: p.value }));
  const card = useAnimatedStyle(() => (reduced
    ? { opacity: p.value, transform: [{ translateY: drag.value }] }
    : { transform: [{ translateY: (1 - p.value) * 520 + drag.value }] }));

  if (!shown) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrim]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View accessibilityViewIsModal style={[styles.card, { backgroundColor: c.paper, borderColor: c.ink, maxHeight: height * 0.82, paddingBottom: insets.bottom + 12 }, card]}>
        <GestureDetector gesture={pan}>
          <View style={styles.head}>
            <View style={[styles.grab, { backgroundColor: c.line2 }]} />
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                {kicker ? <T v="kicker" color={c.ink3} style={{ fontSize: 10 }}>{kicker}</T> : null}
                {title ? <T v="heading" numberOfLines={2}>{title}</T> : null}
              </View>
              <CloseX onPress={onClose} />
            </View>
          </View>
        </GestureDetector>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>{children}</ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1.5, borderBottomWidth: 0 },
  head: { paddingTop: 8, paddingBottom: 10, paddingHorizontal: 18, gap: 10 },
  grab: { alignSelf: "center", width: 38, height: 4.5, borderRadius: 3 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
});
