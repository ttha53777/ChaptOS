/**
 * Task done (signature moment, motion plan "Task done" row): the index card gets a DONE
 * stamp, a small burst of confetti leaves the Done button, the card flies off the deck,
 * and the next card shuffles up. Success haptic on the stamp's impact (the caller's
 * onImpact). Choreography from the mock's deckDone(): stamp at 0, fly at 480ms
 * (translate(70,−90) rotate(10°), 500ms ease-out, fading over 450ms), next card enters
 * at ~420ms with `tq-in` (from translateY 16, rotate .8°, scale .95, 500ms spring curve).
 *
 *   <DeckFlight phase="done" onImpact={…} onFlown={…}>{card}</DeckFlight>
 *
 * Phases: rest · enter (the next card shuffling up, or a swiped-to card) · done · return
 * (the server refused: the card flies back in from where it left, still stamped, and the
 * stamp smears off once it lands).
 *
 * Reduced motion: no travel and no confetti. Done = the stamp fades in, then the card
 * fades out (240ms); enter = a 180ms fade; return = fade in, stamp fades off.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { DUR } from "~/motion/motion";
import { Stamp, type StampState } from "~/paper/Stamp";
import { TONES } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";

export type DeckPhase = "rest" | "enter" | "done" | "return";

export const FLY_AT = 480;
const FLY_MS = 500;
export const ENTER_AT = 420;
const ENTER_MS = 500;
const RETURN_MS = 420;

export interface DeckFlightProps {
  phase: DeckPhase;
  children: ReactNode;
  /** "DONE", or "MY PART" for an Everyone · each task. */
  stamp?: string;
  /** Delay before an "enter" starts (the next card waits for the flying one to lift). */
  enterDelay?: number;
  /** The stamp's moment of contact: haptic, crowd dot. */
  onImpact?: () => void;
  /** The card has left (done) — drop it. */
  onFlown?: () => void;
  /** Where the confetti leaves from, as fractions of the card (the Done button). */
  burstAt?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
  /** Where the stamp lands and how big (a list row is shorter than a deck card). */
  stampStyle?: StyleProp<ViewStyle>;
  stampSize?: "sm" | "md" | "lg";
}

export function DeckFlight({ phase, children, stamp = "Done", enterDelay = 0, onImpact, onFlown, burstAt = { x: 0.28, y: 0.86 }, style, stampStyle, stampSize = "lg" }: DeckFlightProps) {
  const m = useMotion();
  const tx = useSharedValue(phase === "return" ? 70 : 0);
  const ty = useSharedValue(phase === "return" ? -90 : phase === "enter" ? 16 : 0);
  const rot = useSharedValue(phase === "return" ? 10 : phase === "enter" ? 0.8 : 0);
  const sc = useSharedValue(phase === "enter" ? 0.95 : 1);
  const op = useSharedValue(phase === "return" || (phase === "enter" && m.reduced) ? 0 : phase === "enter" ? 0.3 : 1);
  const burst = useSharedValue(0);
  const [stampState, setStampState] = useState<StampState>(phase === "return" ? "shown" : "hidden");

  const flown = useRef(onFlown);
  flown.current = onFlown;
  const impact = useRef(onImpact);
  impact.current = onImpact;
  const fireFlown = () => flown.current?.();

  useEffect(() => {
    const all = [tx, ty, rot, sc, op, burst];
    if (phase === "rest") return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (phase === "enter") {
      if (m.reduced) { op.value = withDelay(m.t(enterDelay), withTiming(1, m.timing(DUR.fade, "out"))); return () => all.forEach(cancelAnimation); }
      const cfg = m.timing(ENTER_MS, "spring");
      ty.value = withDelay(m.t(enterDelay), withTiming(0, cfg));
      rot.value = withDelay(m.t(enterDelay), withTiming(0, cfg));
      sc.value = withDelay(m.t(enterDelay), withTiming(1, cfg));
      op.value = withDelay(m.t(enterDelay), withTiming(1, m.timing(ENTER_MS * 0.5, "out")));
      return () => all.forEach(cancelAnimation);
    }

    if (phase === "done") {
      setStampState("in");
      timers.push(setTimeout(() => {
        if (m.reduced) {
          op.value = withTiming(0, m.timing(240, "out"), fin => { if (fin) scheduleOnRN(fireFlown); });
          return;
        }
        const cfg = m.timing(FLY_MS, "out");
        tx.value = withTiming(70, cfg);
        ty.value = withTiming(-90, cfg);
        rot.value = withTiming(10, cfg);
        op.value = withTiming(0, m.timing(FLY_MS - 50, "out"), fin => { if (fin) scheduleOnRN(fireFlown); });
      }, m.t(FLY_AT)));
      return () => { timers.forEach(clearTimeout); all.forEach(cancelAnimation); };
    }

    // return: back from the fly-off pose, then the ink smears off
    if (m.reduced) {
      op.value = withTiming(1, m.timing(DUR.fade, "out"));
    } else {
      const cfg = m.timing(RETURN_MS, "standard");
      tx.value = withTiming(0, cfg);
      ty.value = withTiming(0, cfg);
      rot.value = withTiming(0, cfg);
      op.value = withTiming(1, m.timing(RETURN_MS * 0.6, "out"));
    }
    timers.push(setTimeout(() => setStampState("smear"), m.t(m.reduced ? DUR.fade : RETURN_MS)));
    return () => { timers.forEach(clearTimeout); all.forEach(cancelAnimation); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const onStampImpact = () => {
    impact.current?.();
    if (!m.reduced) { burst.value = 0; burst.value = withTiming(1, m.timing(900, "out")); }
  };

  const card = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${rot.value}deg` }, { scale: sc.value }],
  }));

  return (
    <Animated.View style={[card, style]}>
      {children}
      <Stamp label={stamp} state={stampState} size={stampSize} rotate={-9} tone="mint" onImpact={onStampImpact} style={[styles.stamp, stampStyle]} />
      {!m.reduced && phase === "done" ? <Confetti burst={burst} at={burstAt} /> : null}
    </Animated.View>
  );
}

/* ── confetti ─────────────────────────────────────────────────────────────────── */

const BITS = 12;
// fixed scatter, so a replay looks the same: [angle 0..1, reach 0..1, spin −1..1]
const SCATTER: readonly (readonly [number, number, number])[] = [
  [0.05, 0.8, 0.6], [0.14, 0.5, -0.9], [0.22, 1.0, 0.3], [0.31, 0.65, -0.4], [0.4, 0.9, 1.0], [0.48, 0.55, -0.7],
  [0.56, 0.95, 0.5], [0.64, 0.6, -1.0], [0.72, 0.85, 0.8], [0.8, 0.5, -0.3], [0.88, 1.0, 0.9], [0.96, 0.7, -0.6],
];

export function Confetti({ burst, at }: { burst: SharedValue<number>; at: { x: number; y: number } }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "visible" }]}>
      <View style={{ position: "absolute", left: `${at.x * 100}%`, top: `${at.y * 100}%` }}>
        {SCATTER.map((s, i) => <Bit key={i} i={i} s={s} burst={burst} />)}
      </View>
    </View>
  );
}

function Bit({ i, s, burst }: { i: number; s: readonly [number, number, number]; burst: SharedValue<number> }) {
  const { c } = useTheme();
  const tone = TONES[i % TONES.length]!;
  // an upward fan, −160° … −20°
  const a = (-160 + s[0] * 140) * (Math.PI / 180);
  const reach = 46 + s[1] * 70;
  const spin = s[2] * 300;
  const st = useAnimatedStyle(() => {
    const p = burst.value;
    const fall = p * p * 26; // a little gravity at the end
    return {
      opacity: p <= 0 || p >= 1 ? 0 : p < 0.4 ? 1 : 1 - (p - 0.4) / 0.6,
      transform: [
        { translateX: Math.cos(a) * reach * p },
        { translateY: Math.sin(a) * reach * p + fall },
        { rotate: `${spin * p}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.bit, { backgroundColor: i % 3 === 0 ? c.pastel[tone].ink : c.pastel[tone].fill }, st]} />;
}

const styles = StyleSheet.create({
  stamp: { position: "absolute", right: 18, top: 46 },
  bit: { position: "absolute", width: 7, height: 10, marginLeft: -3.5, marginTop: -5, borderRadius: 2 },
});

/** How many bits a burst throws (for the Lab note). */
export const CONFETTI_BITS = BITS;
