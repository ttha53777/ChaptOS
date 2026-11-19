/**
 * Excuse filing (signature, small; motion plan U4): the note you wrote folds in half and
 * files itself under the event. It drops in from above the slot (translateY −56) folding
 * as it travels (rotateX 0 → 62° about its top edge, with perspective, so the lower half
 * tips away), lands (soft haptic, the caller's onLanded), then opens back to a slim filed
 * slip (rotateX → 0) at a slight angle. 640ms in all.
 *
 *   state "filing"   play it, then rest as filed
 *   state "shown"    already filed when the sheet opened: no motion
 *   state "unfiling" the server refused: the slip lifts back out and fades (300ms), then
 *                    onGone, so the excuse form can come back with the words kept
 *
 * Reduced motion: a 180ms fade in, a 180ms fade out.
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { DUR } from "~/motion/motion";
import { useMotion } from "~/theme/PaperProvider";

export type FileState = "filing" | "shown" | "unfiling";

export const FILE_MS = 640;

export function FiledNote({ state, children, onLanded, onGone, style }: {
  state: FileState; children: ReactNode; onLanded?: () => void; onGone?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const m = useMotion();
  const y = useSharedValue(state === "filing" ? -56 : 0);
  const fold = useSharedValue(0);
  const rot = useSharedValue(state === "filing" ? 3 : -1);
  const op = useSharedValue(state === "filing" ? 0 : 1);
  const landed = useRef(onLanded);
  landed.current = onLanded;
  const gone = useRef(onGone);
  gone.current = onGone;
  const fireLanded = () => landed.current?.();
  const fireGone = () => gone.current?.();

  useEffect(() => {
    const all = [y, fold, rot, op];
    if (state === "shown") return;
    all.forEach(cancelAnimation);
    if (m.reduced) {
      if (state === "filing") { y.value = 0; rot.value = -1; op.value = withTiming(1, m.timing(DUR.fade, "out"), fin => { if (fin) scheduleOnRN(fireLanded); }); }
      else op.value = withTiming(0, m.timing(DUR.fade, "out"), fin => { if (fin) scheduleOnRN(fireGone); });
      return;
    }
    if (state === "filing") {
      const down = FILE_MS * 0.6, open = FILE_MS * 0.4;
      op.value = withTiming(1, m.timing(120, "out"));
      fold.value = withSequence(withTiming(62, m.timing(down, "flight")), withTiming(0, m.timing(open, "spring")));
      y.value = withTiming(0, m.timing(down, "flight"), fin => { if (fin) scheduleOnRN(fireLanded); });
      rot.value = withSequence(withTiming(0, m.timing(down, "flight")), withTiming(-1, m.timing(open, "spring")));
      return;
    }
    // unfiling
    y.value = withTiming(-40, m.timing(300, "in"));
    rot.value = withTiming(4, m.timing(300, "in"));
    op.value = withTiming(0, m.timing(300, "in"), fin => { if (fin) scheduleOnRN(fireGone); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const st = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ perspective: 700 }, { translateY: y.value }, { rotateX: `${fold.value}deg` }, { rotate: `${rot.value}deg` }],
  }));
  return <Animated.View style={[{ transformOrigin: "top" }, st, style]}>{children}</Animated.View>;
}
