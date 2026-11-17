/**
 * A figure that ticks: when the value changes, only the digits that changed roll
 * (up when it grows, down when it shrinks), the way a mechanical counter turns. Used for
 * check-in counts, countdowns, balances.
 *
 * Reduced motion: the changed digit cross-fades in place (no travel).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useFontScale, useMotion } from "~/theme/PaperProvider";
import { resolveType, type TypeName } from "~/theme/type";
import { T } from "~/ui/T";

export interface TickingNumberProps {
  value: number | string;
  v?: TypeName;
  color?: string;
  accessibilityLabel?: string;
}

export function TickingNumber({ value, v = "figure", color, accessibilityLabel }: TickingNumberProps) {
  const text = String(value);
  const prevText = useRef(text);
  const dir = useRef<1 | -1>(1);
  if (prevText.current !== text) {
    const a = Number(prevText.current), b = Number(text);
    dir.current = Number.isFinite(a) && Number.isFinite(b) && b < a ? -1 : 1;
    prevText.current = text;
  }
  // right-align positions so "9 → 10" rolls the ones column, not every column
  const chars = text.split("");
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel ?? text}>
      {chars.map((ch, i) => (
        <Digit key={chars.length - i} ch={ch} v={v} color={color} dir={dir.current} />
      ))}
    </View>
  );
}

function Digit({ ch, v, color, dir }: { ch: string; v: TypeName; color?: string; dir: 1 | -1 }) {
  const m = useMotion();
  const scale = useFontScale();
  const lh = (resolveType(v, scale).lineHeight as number) ?? 40;
  const [prev, setPrev] = useState<string | null>(null);
  const last = useRef(ch);
  const p = useSharedValue(1);

  // layout effect: the new digit must start below its slot before the first paint
  useLayoutEffect(() => {
    if (last.current === ch) return;
    setPrev(last.current);
    last.current = ch;
    p.value = 0;
    p.value = withTiming(1, m.timing(m.reduced ? 140 : 320, m.reduced ? "out" : "spring"));
  }, [ch, m, p]);

  const reduced = m.reduced;
  const travel = reduced ? 0 : lh * 0.9;
  const inStyle = useAnimatedStyle(() => ({
    opacity: reduced ? p.value : Math.min(1, p.value * 1.6),
    transform: [{ translateY: dir * travel * (1 - p.value) }],
  }));
  const outStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, p.value * 1.4),
    transform: [{ translateY: -dir * travel * p.value }],
  }));

  return (
    <View style={[styles.cell, { height: lh }]}>
      {prev !== null && (
        <Animated.View style={[StyleSheet.absoluteFill, outStyle]}>
          <T v={v} color={color}>{prev}</T>
        </Animated.View>
      )}
      <Animated.View style={inStyle}>
        <T v={v} color={color}>{ch}</T>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end" },
  cell: { overflow: "hidden" },
});
