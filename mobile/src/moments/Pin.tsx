/**
 * Claiming an item on a "who's bringing what" list (motion plan U4: "pin/unpin"): a push
 * pin drops onto the item's tag and your name tag swings in under it.
 *
 *   pin     the pin falls from 26pt above at 1.5× (200ms, press ease), presses into the paper
 *           (scale .88, the moment the soft haptic and `onPinned` fire), springs back to 1×;
 *           the tag below swings in from 9° about the pin (rotate 9 → −2, 320ms, spring)
 *   unpin   played backwards and faster: the tag swings away, the pin lifts and fades (220ms)
 *
 * The same pair plays when the server refuses a claim: `on` goes back to false and the
 * pin lifts out. Reduced motion: both are a 180ms fade.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, Path } from "react-native-svg";
import { DUR } from "~/motion/motion";
import { useMotion, useTheme } from "~/theme/PaperProvider";

export const PIN_MS = 520;

export function PinnedTag({ on, children, onPinned, ink }: { on: boolean; children: ReactNode; onPinned?: () => void; ink?: string }) {
  const { c } = useTheme();
  const m = useMotion();
  const first = useRef(true);
  const pinY = useSharedValue(on ? 0 : -26);
  const pinS = useSharedValue(on ? 1 : 1.5);
  const pinO = useSharedValue(on ? 1 : 0);
  const swing = useSharedValue(on ? -2 : 9);
  const tagO = useSharedValue(on ? 1 : 0);
  const cb = useRef(onPinned);
  cb.current = onPinned;
  const fire = () => cb.current?.();

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    [pinY, pinS, pinO, swing, tagO].forEach(cancelAnimation);
    if (m.reduced) {
      pinY.value = on ? 0 : -26; pinS.value = 1; swing.value = -2;
      pinO.value = withTiming(on ? 1 : 0, m.timing(DUR.fade, "out"), fin => { if (fin && on) scheduleOnRN(fire); });
      tagO.value = withTiming(on ? 1 : 0, m.timing(DUR.fade, "out"));
      return;
    }
    if (on) {
      pinO.value = withTiming(1, m.timing(80, "out"));
      pinY.value = withTiming(0, m.timing(200, "press"), fin => { if (fin) scheduleOnRN(fire); });
      pinS.value = withSequence(withTiming(0.88, m.timing(200, "press")), withTiming(1, m.timing(160, "spring")));
      tagO.value = withDelay(m.t(150), withTiming(1, m.timing(120, "out")));
      swing.value = withDelay(m.t(150), withTiming(-2, m.timing(320, "spring")));
    } else {
      swing.value = withTiming(12, m.timing(160, "in"));
      tagO.value = withTiming(0, m.timing(160, "in"));
      pinY.value = withDelay(m.t(60), withTiming(-22, m.timing(160, "in")));
      pinO.value = withDelay(m.t(60), withTiming(0, m.timing(160, "in")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const pin = useAnimatedStyle(() => ({ opacity: pinO.value, transform: [{ translateY: pinY.value }, { scale: pinS.value }] }));
  const tag = useAnimatedStyle(() => ({ opacity: tagO.value, transform: [{ rotate: `${swing.value}deg` }] }));
  const color = ink ?? c.pastel.rose.ink;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.tag, { transformOrigin: "top" }, tag]}>{children}</Animated.View>
      <Animated.View style={[styles.pin, pin]}>
        <Svg width={16} height={18} viewBox="0 0 16 18">
          <Path d="M8 9 L8 17" stroke={c.ink3} strokeWidth={1.4} strokeLinecap="round" />
          <Circle cx={8} cy={6} r={5.2} fill={color} />
          <Circle cx={6.4} cy={4.6} r={1.6} fill={c.card} opacity={0.55} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 6 },
  pin: { position: "absolute", top: -4, zIndex: 2 },
  tag: { marginTop: 4 },
});
