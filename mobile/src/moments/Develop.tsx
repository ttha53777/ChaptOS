/**
 * Your photo (motion plan U6): the print develops. The new photo goes into the frame at
 * once under a sepia wash (a paper-white veil + a warm tint, as an instant print looks in
 * its first seconds) that breathes gently while it uploads. When the server has it, the
 * wash clears to full colour over 600ms (standard ease) and the success haptic lands. If
 * the upload fails, the new print fades away (300ms) over the old photo, which was under
 * it the whole time, and the caller says why.
 *
 *   state "idle"        just the current photo
 *   state "developing"  new print under the wash (breathing: veil .62 ↔ .48, 900ms each way)
 *   state "developed"   wash clears → onDone (the caller then makes the new photo current)
 *   state "failed"      new print fades → onDone
 *
 * Reduced motion: no breathing; the wash clears / the print goes in one 180ms fade.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { DUR } from "~/motion/motion";
import { useMotion, useTheme } from "~/theme/PaperProvider";

export type DevelopState = "idle" | "developing" | "developed" | "failed";
export const DEVELOP_MS = 600;

export function DevelopingPrint({ size, state, next, children, onDone }: {
  size: number; state: DevelopState;
  /** The new photo (local file) while developing / developed / failed. */
  next: string | null;
  /** The current photo (or initials), always underneath. */
  children: ReactNode;
  onDone?: () => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const veil = useSharedValue(0.62);
  const tint = useSharedValue(0.38);
  const print = useSharedValue(0);
  const done = useRef(onDone);
  done.current = onDone;
  const finish = () => done.current?.();

  useEffect(() => {
    [veil, tint, print].forEach(cancelAnimation);
    if (state === "idle") { print.value = 0; return; }
    if (state === "developing") {
      print.value = withTiming(1, m.timing(DUR.fade, "out"));
      tint.value = 0.38;
      veil.value = m.reduced ? 0.55 : withRepeat(withSequence(withTiming(0.48, m.timing(900, "standard")), withTiming(0.62, m.timing(900, "standard"))), -1, false);
      return;
    }
    if (state === "developed") {
      const t = m.timing(m.reduced ? DUR.fade : DEVELOP_MS, "standard");
      tint.value = withTiming(0, t);
      veil.value = withTiming(0, t, fin => { if (fin) scheduleOnRN(finish); });
      return;
    }
    print.value = withTiming(0, m.timing(m.reduced ? DUR.fade : 300, "in"), fin => { if (fin) scheduleOnRN(finish); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const printSt = useAnimatedStyle(() => ({ opacity: print.value }));
  const veilSt = useAnimatedStyle(() => ({ opacity: veil.value }));
  const tintSt = useAnimatedStyle(() => ({ opacity: tint.value }));

  return (
    <View style={{ width: size, height: size }}>
      {children}
      {next && state !== "idle" ? (
        <Animated.View style={[StyleSheet.absoluteFill, printSt]} pointerEvents="none">
          <Image source={{ uri: next }} style={{ width: size, height: size }} />
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper }, veilSt]} />
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.pastel.butter.ink }, tintSt]} />
        </Animated.View>
      ) : null}
    </View>
  );
}
