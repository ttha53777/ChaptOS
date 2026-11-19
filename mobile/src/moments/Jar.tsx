/**
 * A fundraiser jar (motion plan U7: "jar per campaign that fills to the raised amount on
 * open"). The glass is an SVG outline; the money inside is a coloured block that rises
 * from empty to `fill` (0..1 of the goal line) over 900ms on the spring curve, starting
 * `delay` ms after mount so a shelf of jars fills one after another. Past the goal the
 * block reaches the lid and a small "over" tick shows how far. A fundraiser that hasn't
 * happened yet shows the empty jar with the goal line.
 *
 * Only transform: the block is full height and translated down (translateY), clipped by
 * the jar body. Reduced motion: it appears at its level with a 180ms fade.
 */
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { DUR } from "~/motion/motion";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";

export const JAR_FILL_MS = 900;
const W = 64, H = 84, BODY_TOP = 14, GOAL_Y = 24;

export function Jar({ fill, tint, delay = 0 }: { fill: number; tint: string; delay?: number }) {
  const { c } = useTheme();
  const m = useMotion();
  const bodyH = H - BODY_TOP - 2;
  const level = Math.max(0, Math.min(1, fill));
  // The goal line sits GOAL_Y from the top; full (1.0) reaches it, more overflows to the lid.
  const room = H - 2 - GOAL_Y;
  const target = fill > 1 ? 0 : bodyH - room * level;
  const y = useSharedValue(m.reduced ? target : bodyH);
  const op = useSharedValue(m.reduced ? 0 : 1);

  useEffect(() => {
    if (m.reduced) { y.value = target; op.value = withDelay(m.t(delay), withTiming(1, m.timing(DUR.fade, "out"))); return; }
    y.value = withDelay(m.t(delay), withTiming(target, m.timing(JAR_FILL_MS, "spring")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const money = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: y.value }] }));

  return (
    <View style={{ width: W, height: H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.body, { top: BODY_TOP, height: bodyH, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }]}>
        <Animated.View style={[styles.money, { height: bodyH, backgroundColor: alpha(tint, 0.55) }, money]}>
          <View style={[styles.surface, { backgroundColor: tint }]} />
        </Animated.View>
      </View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
        <Rect x={14} y={2} width={W - 28} height={9} rx={2.5} fill={c.ink3} />
        <Path d={`M12 ${BODY_TOP} L${W - 12} ${BODY_TOP} Q${W - 4} ${BODY_TOP + 4} ${W - 4} ${BODY_TOP + 14} L${W - 4} ${H - 16} Q${W - 4} ${H - 2} ${W - 18} ${H - 2} L18 ${H - 2} Q4 ${H - 2} 4 ${H - 16} L4 ${BODY_TOP + 14} Q4 ${BODY_TOP + 4} 12 ${BODY_TOP} Z`}
          fill="none" stroke={c.ink} strokeWidth={1.8} strokeLinejoin="round" />
        <Line x1={W - 14} y1={GOAL_Y} x2={W - 4} y2={GOAL_Y} stroke={c.ink2} strokeWidth={1.4} strokeDasharray="2 2" />
        <Path d={`M12 ${BODY_TOP + 10} Q10 ${BODY_TOP + 30} 12 ${H - 22}`} stroke={c.card} strokeWidth={3} strokeLinecap="round" opacity={0.6} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { position: "absolute", left: 5, right: 5, overflow: "hidden" },
  money: { position: "absolute", left: 0, right: 0, top: 0 },
  surface: { height: 3, opacity: 0.9 },
});
