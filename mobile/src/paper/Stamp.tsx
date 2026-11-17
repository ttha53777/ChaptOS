/**
 * A rubber stamp, the app's way of saying "that happened": HERE, DONE, SENT, PAID, VOID.
 * The choreography is the web's (app/components/timeline/event-landing.ts):
 *
 *   in      drops from 2.3× and −16° to .94× and −7°, settles at 1× and its resting angle
 *           (340ms, press ease); at the moment of contact ink kicks out and `onImpact`
 *           fires, which is where the card underneath "gives" and the haptic lands
 *   out     undo: the ink lifts (fades, 1.04×)
 *   smear   the server said no: dragged sideways before it dried (skew + stretch + fade)
 *   shown   already stamped when the screen opened: no motion
 *   hidden  nothing there
 *
 * Reduced motion: in/out/smear all become a 180ms fade at the resting pose. The impact
 * callback (and so the haptic) still fires.
 */
import { useEffect, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { DUR } from "~/motion/motion";
import { alpha, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export type StampState = "hidden" | "shown" | "in" | "out" | "smear";

export interface StampProps {
  label: string;
  sub?: string;
  tone?: Tone;
  state: StampState;
  /** Resting angle in degrees. */
  rotate?: number;
  size?: "md" | "sm" | "lg";
  /** Ink kicked out on impact (off for small, frequent stamps). */
  splat?: boolean;
  onImpact?: () => void;
  style?: StyleProp<ViewStyle>;
}

const SPLATS = 7;
// fixed scatter so a replay looks the same (the web uses Math.random per stamp)
const SCATTER = [0.31, 0.12, 0.44, 0.05, 0.38, 0.21, 0.47];

export function Stamp({ label, sub, tone = "mint", state, rotate = -8, size = "md", splat = true, onImpact, style }: StampProps) {
  const { c } = useTheme();
  const m = useMotion();
  const ink = c.pastel[tone].ink;

  const op = useSharedValue(state === "shown" ? 1 : 0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0);
  const tx = useSharedValue(0);
  const skew = useSharedValue(0);
  const sx = useSharedValue(1);
  const burst = useSharedValue(0);

  const impactRef = useRef(onImpact);
  impactRef.current = onImpact;
  const fireImpact = () => impactRef.current?.();

  const first = useRef(true);
  useEffect(() => {
    const all = [op, sc, rot, tx, skew, sx, burst];
    all.forEach(v => cancelAnimation(v));
    const reset = () => { sc.value = 1; rot.value = 0; tx.value = 0; skew.value = 0; sx.value = 1; };

    if (state === "hidden") { reset(); op.value = 0; burst.value = 0; first.current = false; return; }
    if (state === "shown") { reset(); op.value = 1; burst.value = 0; first.current = false; return; }
    // a stamp that mounts already "out"/"smear" has nothing to animate away
    if (first.current && state !== "in") { op.value = 0; first.current = false; return; }
    first.current = false;

    if (state === "in") {
      reset();
      if (m.reduced) {
        op.value = 0;
        op.value = withTiming(1, m.timing(DUR.fade, "out"), done => { if (done) scheduleOnRN(fireImpact); });
        return;
      }
      const drop = DUR.stamp * 0.6, settle = DUR.stamp * 0.4;
      op.value = 0; sc.value = 2.3; rot.value = -8; burst.value = 0;
      op.value = withTiming(1, m.timing(drop, "press"));
      rot.value = withSequence(withTiming(1, m.timing(drop, "press")), withTiming(0, m.timing(settle, "out")));
      sc.value = withSequence(
        withTiming(0.94, m.timing(drop, "press"), done => { if (done) scheduleOnRN(fireImpact); }),
        withTiming(1, m.timing(settle, "out")),
      );
      if (splat) burst.value = withDelay(m.t(drop), withTiming(1, m.timing(620, "standard")));
      return;
    }

    if (state === "out") {
      if (m.reduced) { op.value = withTiming(0, m.timing(DUR.fade, "out")); return; }
      sc.value = withTiming(1.04, m.timing(260, "in"));
      op.value = withTiming(0, m.timing(260, "in"));
      return;
    }

    // smear
    if (m.reduced) { op.value = withTiming(0, m.timing(DUR.fade, "out")); return; }
    tx.value = withTiming(30, m.timing(420, "smear"));
    skew.value = withTiming(-24, m.timing(420, "smear"));
    sx.value = withTiming(1.3, m.timing(420, "smear"));
    op.value = withTiming(0, m.timing(420, "smear"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, m.reduced, m.speed]);

  const body = useAnimatedStyle(() => ({
    opacity: op.value * 0.9,
    transform: [
      { translateX: tx.value },
      { rotate: `${rotate + rot.value}deg` },
      { skewX: `${skew.value}deg` },
      { scaleX: sc.value * sx.value },
      { scaleY: sc.value },
    ],
  }));

  const dims = SIZE[size];
  return (
    <View pointerEvents="none" style={[styles.wrap, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {splat && !m.reduced && Array.from({ length: SPLATS }, (_, i) => (
        <Splat key={i} i={i} burst={burst} color={ink} reach={dims.reach} />
      ))}
      <Animated.View style={[
        styles.stamp,
        {
          borderColor: ink, outlineColor: ink, backgroundColor: alpha(c.card, 0.7),
          borderWidth: dims.border, outlineWidth: size === "sm" ? 0 : 1.5, outlineOffset: 2.5, outlineStyle: "solid",
          paddingVertical: dims.py, paddingHorizontal: dims.px,
        },
        body,
      ]}>
        <T v="stamp" color={ink} style={{ fontSize: dims.font, lineHeight: dims.font * 1.1, letterSpacing: dims.font * 0.16 }}>{label}</T>
        {sub ? <T v="stamp" color={ink} style={{ fontSize: dims.font * 0.66, lineHeight: dims.font * 0.9, letterSpacing: dims.font * 0.08, opacity: 0.85 }}>{sub}</T> : null}
      </Animated.View>
    </View>
  );
}

const SIZE = {
  sm: { font: 10, px: 8, py: 3, border: 2, reach: 26 },
  md: { font: 12.5, px: 11, py: 4, border: 2.5, reach: 34 },
  lg: { font: 18, px: 15, py: 5, border: 2.5, reach: 46 },
} as const;

function Splat({ i, burst, color, reach }: { i: number; burst: SharedValue<number>; color: string; reach: number }) {
  const a = (i / SPLATS) * Math.PI * 2 + (SCATTER[i] ?? 0);
  const dist = reach + (SCATTER[(i + 3) % SPLATS] ?? 0) * 20;
  const sz = 2 + (SCATTER[(i + 1) % SPLATS] ?? 0) * 6;
  const st = useAnimatedStyle(() => {
    const p = burst.value;
    const k = p < 0.35 ? p / 0.35 : 1;
    const o = p <= 0 || p >= 1 ? 0 : p < 0.35 ? (p / 0.35) * 0.9 : 0.9 * (1 - (p - 0.35) / 0.65);
    const d = dist * (p < 0.35 ? 0.7 * k : 0.7 + 0.3 * ((p - 0.35) / 0.65));
    return {
      opacity: o,
      transform: [{ translateX: Math.cos(a) * d }, { translateY: Math.sin(a) * d * 0.55 }, { scale: p < 0.35 ? 0.4 + 0.6 * k : 1 - 0.4 * ((p - 0.35) / 0.65) }],
    };
  });
  return <Animated.View style={[styles.splat, { width: sz, height: sz, marginLeft: -sz / 2, marginTop: -sz / 2, backgroundColor: color }, st]} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  stamp: { borderRadius: 7, alignItems: "center", gap: 1 },
  splat: { position: "absolute", left: "50%", top: "50%", borderRadius: 999 },
});
