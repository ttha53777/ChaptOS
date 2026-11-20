/**
 * The reasoning ledger (U8 "Thinking"; mock `.reason` / `.lstep`). While a turn runs:
 * the intent line (what the question is about, with a breathing dot and done/total), then
 * the steps down a margin rule: pending = a hollow dot, active = an arc spinning on the
 * node, done = a ticked disc with its finding posted underneath. A step enters with a
 * short rise + fade; a finding fades in once when it lands. Guessed rows (provisional)
 * look exactly like pending ones and are never ticked.
 *
 * After the turn: a one-line trace ("Read 2 records · Roster, Attendance") that opens to
 * the same ledger, settled.
 *
 * Reduced motion: no spin (the active node is a solid half ring), no breathing, rows and
 * findings appear with 180ms fades.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { Icon } from "~/icons/Icon";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import type { LedgerStep } from "./types";
import { pressedDim } from "~/motion/press";

const NODE = 18;

export function LiveLedger({ intent, steps, composing }: { intent: string; steps: LedgerStep[]; composing?: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const real = steps.filter(s => !s.provisional);
  const done = real.filter(s => s.status === "done").length;
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(220)).reduceMotion(ReduceMotion.Never);
  return (
    <View style={{ gap: 10 }} accessibilityLiveRegion="polite" accessibilityLabel={`${intent} ${done} of ${steps.length} records read${composing ? ". Writing the answer" : ""}`}>
      <View style={styles.intent}>
        <Breath />
        <T v="body" color={c.ink2} style={{ flex: 1, fontStyle: "italic" }}>{composing ? "Writing it up…" : intent}</T>
        {steps.length ? <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{done}/{steps.length}</T> : null}
      </View>
      {steps.length ? <Steps steps={steps} layout={layout} /> : null}
    </View>
  );
}

function Steps({ steps, layout }: { steps: LedgerStep[]; layout?: LinearTransition }) {
  const { c } = useTheme();
  const m = useMotion();
  const enter = m.reduced ? FadeIn.duration(m.t(180)).reduceMotion(ReduceMotion.Never) : FadeInDown.duration(m.t(240)).reduceMotion(ReduceMotion.Never);
  return (
    <View style={styles.rail}>
      <View style={[styles.rule, { backgroundColor: alpha(c.pastel.rose.ink, 0.35) }]} />
      {steps.map(s => (
        <Animated.View key={s.id} entering={enter} layout={layout} style={styles.step}>
          <Node status={s.status} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="callout" color={s.status === "pending" ? c.ink3 : c.ink}>{s.verb}</T>
            {s.status === "done" && s.finding ? (
              <Animated.View entering={FadeIn.duration(m.t(260)).reduceMotion(ReduceMotion.Never)}>
                <T v="meta" color={c.ink2}>{s.finding.replace(/\*/g, "")}</T>
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

function Node({ status }: { status: LedgerStep["status"] }) {
  const { c } = useTheme();
  const m = useMotion();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (status !== "active" || m.reduced) { cancelAnimation(spin); return; }
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, m.reduced]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const ink = c.pastel.lilac.ink;
  if (status === "done") {
    return (
      <View style={[styles.node, { backgroundColor: c.pastel.mint.fill, borderColor: c.pastel.mint.ink, borderWidth: 1.2 }]}>
        <Icon name="check" size={10} color={c.pastel.mint.ink} />
      </View>
    );
  }
  if (status === "active") {
    return (
      <Animated.View style={[styles.node, st]}>
        <Svg width={NODE} height={NODE} viewBox="0 0 18 18">
          <Circle cx={9} cy={9} r={7} stroke={alpha(ink, 0.2)} strokeWidth={2} fill={c.paper} />
          <Path d="M9 2 A7 7 0 0 1 16 9" stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
    );
  }
  return (
    <View style={styles.node}>
      <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: c.line2, backgroundColor: c.paper }} />
    </View>
  );
}

function Breath() {
  const { c } = useTheme();
  const m = useMotion();
  const p = useSharedValue(1);
  useEffect(() => {
    if (m.reduced) return;
    p.value = withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
    return () => cancelAnimation(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.reduced]);
  const st = useAnimatedStyle(() => ({ opacity: p.value }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.pastel.lilac.ink }, st]} />;
}

/** The settled record of a finished turn, folded to one line. */
export function Trace({ steps }: { steps: LedgerStep[] }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const real = steps.filter(s => !s.provisional);
  if (!real.length) return null;
  const sources = [...new Set(real.map(s => s.source).filter(Boolean))].join(", ");
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} style={({ pressed }) => [styles.trace, pressed && pressedDim]}>
        <Icon name="check" size={12} color={c.pastel.mint.ink} />
        <T v="meta" color={c.ink3} style={{ flex: 1 }} numberOfLines={1}>Read {real.length} record{real.length > 1 ? "s" : ""}{sources ? ` · ${sources}` : ""}</T>
        <Icon name={open ? "chev-u" : "chev-d"} size={13} color={c.ink3} />
      </Pressable>
      {open ? <Steps steps={real} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intent: { flexDirection: "row", alignItems: "center", gap: 10 },
  rail: { gap: 12, paddingLeft: 2 },
  rule: { position: "absolute", left: NODE / 2 + 1, top: 6, bottom: 6, width: 1.5 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  trace: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" },
});
