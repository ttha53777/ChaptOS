/**
 * Party closed out (signature moment, Parties): the night's till receipt feeds out of the
 * till's slot the way a thermal printer does it, in three short jerks with a breath
 * between, then a CLOSED OUT stamp lands across the total (success haptic on impact) and
 * `onDone` fires once the ink has settled. ~1.2s in all.
 *
 *   state "ready"   the slot, and a sliver of paper in its mouth (while the figures save)
 *   state "print"   play it
 *
 * The receipt is thermal paper in both themes (c.thermal), the same slip the party sheet
 * shows. The stage clips everything above the slot's lip, so the feed is one translateY.
 *
 * Reduced motion: the receipt fades in where it rests (200ms), the stamp fades in, done.
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { haptics } from "~/motion/haptics";
import { Stamp, type StampState } from "~/paper/Stamp";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export type TillState = "ready" | "print";

const W = 250;
const SLOT_H = 22;
const PAPER_W = 196;
const PAPER_H = 178;
const TOOTH = 12;
const SLIVER = 10;
export const TILL_MS = 1250;

export interface TillSlip { org: string; name: string; when: string; door: string; spent: string; net: string; neg: boolean }

export function Till({ state, slip, onDone }: { state: TillState; slip: TillSlip; onDone?: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  // paper top sits at -PAPER_H + SLIVER (only a sliver below the lip) → 0 once printed
  const y = useSharedValue(-PAPER_H + SLIVER);
  const op = useSharedValue(1);
  const [stamp, setStamp] = useState<StampState>("hidden");
  const done = useRef(onDone);
  done.current = onDone;
  const printed = () => setStamp("in");

  useEffect(() => {
    if (state !== "print") return;
    if (m.reduced) {
      op.value = 0;
      y.value = 0;
      op.value = withTiming(1, m.timing(200, "out"), fin => { if (fin) scheduleOnRN(printed); });
      return;
    }
    const step = (to: number, ms: number) => withTiming(to, m.timing(ms, "out"));
    const third = PAPER_H / 3;
    y.value = withSequence(
      step(-PAPER_H + SLIVER + third, 170),
      withDelay(m.t(90), step(-PAPER_H + SLIVER + third * 2, 170)),
      withDelay(m.t(90), withTiming(0, m.timing(240, "spring"), fin => { if (fin) scheduleOnRN(printed); })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const paperSt = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: y.value }] }));
  const ink = c.thermal.ink, faint = c.thermal.faint;
  const teeth = Math.floor(PAPER_W / TOOTH);
  const tw = PAPER_W / teeth;
  const zig = [`0,0`, ...Array.from({ length: teeth }, (_, i) => `${i * tw + tw / 2},${TOOTH / 2} ${(i + 1) * tw},0`)].join(" ");

  return (
    <View style={styles.stage} accessible accessibilityLiveRegion="polite"
      accessibilityLabel={stamp === "hidden" ? `${slip.name}, printing` : `${slip.name} closed out, net ${slip.net}`}>
      <View style={styles.window}>
        <Animated.View style={[styles.paper, paperSt]}>
          <View style={[styles.slip, { backgroundColor: c.thermal.paper }]}>
            <T v="kicker" color={faint} align="center" style={{ fontSize: 9 }} numberOfLines={1}>{`${slip.org} · the house`}</T>
            <T v="subhead" color={ink} align="center" numberOfLines={1} style={{ fontSize: 15 }}>{slip.name}</T>
            <T v="mono" color={faint} align="center" style={{ fontSize: 10.5 }}>{slip.when}</T>
            <Dash color={faint} />
            <Line k="Door" v={slip.door} ink={ink} />
            <Line k="Spent" v={`−${slip.spent}`} ink={ink} />
            <Dash color={faint} />
            <Line k="Net" v={slip.net} ink={slip.neg ? c.thermal.neg : ink} big />
          </View>
          <Svg width={PAPER_W} height={TOOTH / 2} style={{ marginTop: -0.5 }}>
            <Polygon points={zig} fill={c.thermal.paper} />
          </Svg>
          {stamp !== "hidden" ? (
            <Stamp label="Closed out" tone="mint" state={stamp} size="md" rotate={-10} style={styles.stamp}
              onImpact={() => { haptics.success(); setTimeout(() => done.current?.(), m.t(420)); }} />
          ) : null}
        </Animated.View>
      </View>
      {/* the till: its body and the dark slot the paper comes out of */}
      <View style={[styles.till, { backgroundColor: c.card, borderColor: c.ink, boxShadow: `3px 3px 0 ${c.note.fill.rose}` }]}>
        <View style={[styles.mouth, { backgroundColor: c.ink }]} />
      </View>
    </View>
  );
}

function Line({ k, v, ink, big }: { k: string; v: string; ink: string; big?: boolean }) {
  return (
    <View style={styles.line}>
      <T v="mono" color={ink} style={{ fontSize: big ? 14 : 11.5, fontWeight: big ? "700" : "500", letterSpacing: 0.6 }}>{k.toUpperCase()}</T>
      <T v="mono" color={ink} style={{ fontSize: big ? 14 : 11.5, fontWeight: big ? "700" : "500" }}>{v}</T>
    </View>
  );
}

function Dash({ color }: { color: string }) {
  return <View style={[styles.dash, { borderColor: color }]} />;
}

const styles = StyleSheet.create({
  stage: { width: W, height: SLOT_H + PAPER_H + 26, alignSelf: "center" },
  window: { position: "absolute", top: SLOT_H - 4, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  paper: { position: "absolute", top: 0, left: (W - PAPER_W) / 2, width: PAPER_W },
  slip: { height: PAPER_H - TOOTH / 2, paddingHorizontal: 14, paddingTop: 14, gap: 3 },
  line: { flexDirection: "row", justifyContent: "space-between" },
  dash: { borderTopWidth: 1.5, borderStyle: "dashed", marginVertical: 6 },
  stamp: { position: "absolute", alignSelf: "center", top: PAPER_H - 70 },
  till: { position: "absolute", top: 0, left: 8, right: 8, height: SLOT_H, borderWidth: 1.5, borderRadius: 10, justifyContent: "flex-end", paddingHorizontal: 18, paddingBottom: 4 },
  mouth: { height: 4, borderRadius: 2 },
});
