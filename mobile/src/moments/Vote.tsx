/**
 * Voting (signature moment, motion plan "Voting" row): the X is drawn into the box as two
 * pen strokes, then the result bars grow. Light haptic with the pen, success when the
 * bars land (the Ballot fires both; the bars report landing through onGrown).
 *
 *   PenX     the mock's `.tq-bl .bx` strokes: 170ms each, ease-out, the second 150ms
 *            after the first. Drawn = each stroke scales out from its starting end
 *            (transform only, no stroke-dashoffset). Un-drawing (a changed or refused
 *            vote) runs the strokes backwards, last first, 140ms each. `instant` shows
 *            an X already cast when the ballot opened, with no motion.
 *   VoteBar  the option's fill behind its row: scaleX from the left edge to its share,
 *            900ms on the spring curve (the mock's `width .9s var(--ease-spring)`).
 *
 * Reduced motion: the X fades in whole (180ms); bars cross-fade in at their final
 * length and later changes cross-fade too.
 */
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { DUR } from "~/motion/motion";
import { useMotion, useTheme } from "~/theme/PaperProvider";

const STROKE_MS = 170;
const STROKE_GAP = 150;
const ERASE_MS = 140;
export const PEN_MS = STROKE_GAP + STROKE_MS;
const BAR_MS = 900;

export function PenX({ drawn, size = 24, instant }: { drawn: boolean; size?: number; instant?: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const a = useSharedValue(drawn && instant ? 1 : 0);
  const b = useSharedValue(drawn && instant ? 1 : 0);
  const op = useSharedValue(drawn && instant ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; if (instant || !drawn) return; }
    [a, b, op].forEach(cancelAnimation);
    if (m.reduced) {
      a.value = 1; b.value = 1;
      op.value = withTiming(drawn ? 1 : 0, m.timing(DUR.fade, "out"));
      return;
    }
    op.value = 1;
    if (drawn) {
      a.value = withTiming(1, m.timing(STROKE_MS, "out"));
      b.value = withDelay(m.t(STROKE_GAP), withTiming(1, m.timing(STROKE_MS, "out")));
    } else {
      b.value = withTiming(0, m.timing(ERASE_MS, "in"));
      a.value = withDelay(m.t(ERASE_MS * 0.7), withTiming(0, m.timing(ERASE_MS, "in")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn]);

  const len = size * 0.82;
  const thick = Math.max(2.4, size * 0.115);
  const sA = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scaleX: a.value }] }));
  const sB = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scaleX: b.value }] }));
  const ink = c.pastel.lilac.ink;
  const stroke = { width: len, height: thick, borderRadius: thick / 2, backgroundColor: ink, transformOrigin: "left" as const };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      {/* top-left → bottom-right, then top-right → bottom-left */}
      <View style={[styles.arm, { width: len, transform: [{ rotate: "45deg" }] }]}>
        <Animated.View style={[stroke, sA]} />
      </View>
      <View style={[styles.arm, { width: len, transform: [{ rotate: "135deg" }] }]}>
        <Animated.View style={[stroke, sB]} />
      </View>
    </View>
  );
}

/** share 0..1. `show` false keeps it at nothing (a sealed or pre-vote ballot). */
export function VoteBar({ share, show, delay = 0, color, onGrown }: {
  share: number; show: boolean; delay?: number; color: string; onGrown?: () => void;
}) {
  const m = useMotion();
  const s = useSharedValue(show ? share : 0);
  const op = useSharedValue(show ? 1 : 0);
  const first = useRef(true);
  const grown = useRef(onGrown);
  grown.current = onGrown;
  const fire = () => grown.current?.();

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    cancelAnimation(s); cancelAnimation(op);
    const target = show ? share : 0;
    if (m.reduced) {
      s.value = target;
      op.value = 0;
      op.value = withDelay(m.t(delay), withTiming(show ? 1 : 0, m.timing(DUR.fade, "out"), fin => { if (fin && show) scheduleOnRN(fire); }));
      return;
    }
    op.value = 1;
    s.value = withDelay(m.t(delay), withTiming(target, m.timing(BAR_MS, "spring"), fin => { if (fin && show) scheduleOnRN(fire); }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, show]);

  const st = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scaleX: Math.max(0.0001, s.value) }] }));
  return <Animated.View pointerEvents="none" style={[styles.bar, { backgroundColor: color }, st]} />;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  arm: { position: "absolute" },
  bar: { position: "absolute", left: 0, right: 0, top: 4, bottom: 4, borderRadius: 9, transformOrigin: "left" },
});
