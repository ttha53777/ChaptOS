/**
 * Small Tasks pieces with their own motion:
 *
 *   CheckBox     the board's tick (mock `.tq-ck`): the box fills mint (200ms), then the
 *                check is uncovered left to right (a fill-coloured cover slides out, 320ms
 *                after 60ms), with a thump (scale .86 → 1, 450ms spring curve). Unticking
 *                (undo, refusal) runs it backwards. Reduced: fill and check cross-fade.
 *   StrikeTitle  the row title's strike (mock `.tq-t > span`): one line per text line,
 *                each scaling out from the left (420ms ease-out, staggered 80ms), the words
 *                dimming to .55. Reduced: the strikes and dim cross-fade.
 *   CrowdStrip   an Everyone · each task's crowd: one dot per member, filled by those who've
 *                done their part. A dot that fills while you watch drops in from above
 *                (translateY −14, scale 1.6 → 1, the pop spring); one that empties lifts
 *                out. Reduced: dots cross-fade.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type TextLayoutEvent } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import type { Tone } from "~/theme/palette";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T, type TProps } from "~/ui/T";

/* ── CheckBox ─────────────────────────────────────────────────────────────────── */

const BOX = 28;

export function CheckBox({ done, tone = "sky", disabled, onPress, label }: {
  done: boolean; tone?: Tone; disabled?: boolean; onPress?: () => void; label: string;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const fill = useSharedValue(done ? 1 : 0);
  const cover = useSharedValue(done ? 1 : 0);
  const thump = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    [fill, cover, thump].forEach(cancelAnimation);
    if (m.reduced) {
      fill.value = withTiming(done ? 1 : 0, m.timing(DUR.fade, "out"));
      cover.value = done ? 1 : 0;
      return;
    }
    if (done) {
      fill.value = withTiming(1, m.timing(200, "out"));
      cover.value = withDelay(m.t(60), withTiming(1, m.timing(320, "out")));
      thump.value = withSequence(withTiming(0.86, m.timing(120, "out")), withTiming(1, m.timing(330, "spring")));
    } else {
      cover.value = withTiming(0, m.timing(220, "in"));
      fill.value = withDelay(m.t(140), withTiming(0, m.timing(200, "out")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const ink = c.pastel.mint.ink;
  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: thump.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.6 + 0.4 * fill.value }] }));
  // The cover is fill-coloured: invisible over the fill, it hides the check until it
  // slides away; before the fill arrives it must not show as a mint block.
  const coverStyle = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ translateX: cover.value * BOX }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: m.reduced ? fill.value : 1 }));

  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled }} accessibilityLabel={label}>
      <Animated.View style={[styles.box, {
        borderColor: disabled ? c.line2 : alpha(c.pastel[tone].ink, 0.65),
        borderStyle: disabled ? "dashed" : "solid",
        backgroundColor: c.card,
      }, boxStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: ink }, fillStyle]} />
        <Animated.View style={checkStyle}><Icon name="check" size={17} color={c.card} /></Animated.View>
        {!m.reduced ? <Animated.View style={[styles.cover, { backgroundColor: ink }, coverStyle]} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/* ── StrikeTitle ──────────────────────────────────────────────────────────────── */

interface Line { x: number; y: number; width: number; height: number }

export function StrikeTitle({ struck, children, v = "callout", ...rest }: TProps & { struck: boolean; children: string }) {
  const { c } = useTheme();
  const m = useMotion();
  const [lines, setLines] = useState<Line[]>([]);
  const p = useSharedValue(struck ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    cancelAnimation(p);
    p.value = withTiming(struck ? 1 : 0, m.reduced ? m.timing(DUR.fade, "out") : m.timing(struck ? 420 : 260, struck ? "out" : "in"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [struck]);

  const onTextLayout = (e: TextLayoutEvent) =>
    setLines(e.nativeEvent.lines.map(l => ({ x: l.x, y: l.y, width: l.width, height: l.height })));

  const dim = useAnimatedStyle(() => ({ opacity: 1 - 0.45 * p.value }));
  return (
    <View>
      <Animated.View style={dim}>
        <T v={v} onTextLayout={onTextLayout} {...rest}>{children}</T>
      </Animated.View>
      {lines.map((l, i) => <StrikeLine key={i} line={l} i={i} n={lines.length} p={p} color={c.ink2} />)}
    </View>
  );
}

function StrikeLine({ line, i, n, p, color }: { line: Line; i: number; n: number; p: { value: number }; color: string }) {
  const m = useMotion();
  // each line takes its turn: line i runs over [i/n·0.4, i/n·0.4 + 0.6] of the progress
  const start = n > 1 ? (i / (n - 1)) * 0.3 : 0;
  const st = useAnimatedStyle(() => {
    const k = Math.min(1, Math.max(0, (p.value - start) / (1 - start)));
    return m.reduced ? { opacity: p.value } : { opacity: k > 0 ? 1 : 0, transform: [{ scaleX: Math.max(0.0001, k) }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{
      position: "absolute", left: line.x, top: line.y + line.height * 0.56, width: line.width, height: 1.6,
      borderRadius: 1, backgroundColor: color, transformOrigin: "left",
    }, st]} />
  );
}

/* ── CrowdStrip ───────────────────────────────────────────────────────────────── */

const MAX_DOTS = 40;

export function CrowdStrip({ done, total, size = 9, label }: { done: number; total: number; size?: number; label?: string }) {
  const { c } = useTheme();
  // Big chapters: 40 dots, each standing for a share of the roster.
  const dots = Math.min(total, MAX_DOTS);
  const filled = total <= MAX_DOTS ? done : Math.round((done / Math.max(1, total)) * dots);
  return (
    <View accessible accessibilityLabel={label ?? `${done} of ${total} have done their part`} style={styles.crowd}>
      {Array.from({ length: dots }, (_, i) => (
        <Dot key={i} filled={i < filled} size={size} ink={c.pastel.mint.ink} ring={c.line2} />
      ))}
    </View>
  );
}

function Dot({ filled, size, ink, ring }: { filled: boolean; size: number; ink: string; ring: string }) {
  const m = useMotion();
  const p = useSharedValue(filled ? 1 : 0);
  const y = useSharedValue(0);
  const s = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    [p, y, s].forEach(cancelAnimation);
    if (m.reduced) { p.value = withTiming(filled ? 1 : 0, m.timing(DUR.fade, "out")); return; }
    if (filled) {
      p.value = 0; y.value = -14; s.value = 1.6;
      p.value = withTiming(1, m.timing(140, "out"));
      y.value = withTiming(0, m.spring("pop"));
      s.value = withTiming(1, m.timing(340, "spring"));
    } else {
      y.value = withTiming(-10, m.timing(220, "in"));
      p.value = withTiming(0, m.timing(220, "in"), () => { y.value = 0; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled]);

  const st = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: y.value }, { scale: s.value }] }));
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: ring }}>
      <Animated.View style={[{ position: "absolute", left: -1.5, top: -1.5, width: size, height: size, borderRadius: size / 2, backgroundColor: ink }, st]} />
    </View>
  );
}

/** A mono "5 of 13" beside the strip. */
export function CrowdCount({ done, total }: { done: number; total: number }) {
  const { c } = useTheme();
  return <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{done} of {total}</T>;
}

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX, borderRadius: 9, borderWidth: 1.8, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  cover: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  crowd: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
});
