/**
 * The service punch card's holes (motion plan U7 signature: "new hours punch in"). One
 * slot per hour up to the goal (more if you're past it), each printed with its number in
 * the card's brick ink. A punched slot shows the page through it (paper fill + an inset
 * shadow, so it reads as a hole, not a dot).
 *
 * Punching (holes that are newly punched since the last render, `fresh`): each hole
 * presses in (scale 1 → .72 → 1, 500ms, spring) and its chad drops out of the card
 * (translate 8, 46 · rotate 140° · scale .7 · fade, 800ms, ease-out), staggered 90ms,
 * with a soft haptic on each of the first four. Unpunching (an undo or a refused log)
 * plays it back: the hole fills with card stock again (220ms fade), no chad.
 *
 * Reduced motion: holes cross-fade (180ms), no press, no chad. The haptics still land.
 */
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { DUR } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export const HOLE = 20;
const STAGGER = 90;

export function PunchHoles({ punched, total, stock, print }: {
  /** Whole hours punched. */
  punched: number;
  /** Slots printed on the card. */
  total: number;
  /** The card's stock colour (what an unpunched hole is filled with). */
  stock: string;
  /** The card's print ink. */
  print: string;
}) {
  const prev = useRef(punched);
  const from = prev.current;
  useEffect(() => { prev.current = punched; }, [punched]);
  return (
    <View style={styles.holes} accessible accessibilityLabel={`${punched} of ${total} holes punched`}>
      {Array.from({ length: total }, (_, i) => (
        <Hole key={i} n={i + 1} on={i < punched} fresh={i >= from && i < punched ? i - from : null} stock={stock} print={print} />
      ))}
    </View>
  );
}

function Hole({ n, on, fresh, stock, print }: { n: number; on: boolean; fresh: number | null; stock: string; print: string }) {
  const { c } = useTheme();
  const m = useMotion();
  const first = useRef(true);
  const open = useSharedValue(on ? 1 : 0);
  const press = useSharedValue(1);
  const chad = useSharedValue(0);
  const chadOn = useSharedValue(0);
  const buzz = () => haptics.soft();

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!on) { open.value = withTiming(0, m.timing(220, "out")); return; }
    const delay = m.t((fresh ?? 0) * STAGGER);
    const fire = fresh != null && fresh < 4;
    if (m.reduced) {
      open.value = withDelay(delay, withTiming(1, m.timing(DUR.fade, "out"), fin => { if (fin && fire) scheduleOnRN(buzz); }));
      return;
    }
    press.value = withDelay(delay, withSequence(withTiming(0.72, m.timing(175, "press"), fin => { if (fin && fire) scheduleOnRN(buzz); }), withTiming(1, m.timing(325, "spring"))));
    open.value = withDelay(delay + m.t(120), withTiming(1, m.timing(80, "out")));
    chadOn.value = 1;
    chad.value = 0;
    chad.value = withDelay(delay + m.t(120), withTiming(1, m.timing(800, "out"), fin => { if (fin) chadOn.value = 0; }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const ring = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const hole = useAnimatedStyle(() => ({ opacity: open.value }));
  const label = useAnimatedStyle(() => ({ opacity: 1 - open.value }));
  const chadSt = useAnimatedStyle(() => ({
    opacity: chadOn.value * (1 - chad.value),
    transform: [{ translateX: chad.value * 8 }, { translateY: chad.value * 46 }, { rotate: `${chad.value * 140}deg` }, { scale: 1 - chad.value * 0.3 }],
  }));

  return (
    <View style={{ width: HOLE, height: HOLE }}>
      <Animated.View style={[styles.slot, { borderColor: alpha(print, 0.5) }, ring]}>
        <Animated.View style={label}><T v="mono" color={alpha(print, 0.75)} style={{ fontSize: 8, lineHeight: 10 }}>{n}</T></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.hole, { backgroundColor: c.paper, boxShadow: `inset 1.5px 2.5px 3px ${alpha(c.ink, 0.32)}` }, hole]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.slot, styles.chad, { backgroundColor: stock, borderColor: alpha(print, 0.5) }, chadSt]} />
    </View>
  );
}

const styles = StyleSheet.create({
  holes: { flexDirection: "row", flexWrap: "wrap", rowGap: 9, columnGap: 7 },
  slot: { width: HOLE, height: HOLE, borderRadius: HOLE / 2, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  hole: { borderRadius: HOLE / 2, margin: -1.2 },
  chad: { position: "absolute", top: 0, left: 0 },
});
