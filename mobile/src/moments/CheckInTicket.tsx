/**
 * Signature moment: checking in.
 *
 *   tap I'm here   (optimistic: starts before the server answers)
 *     0ms          the stub pulls at the perforation: tips 3° from its left corner, drops 3px
 *     160ms        it lets go and settles torn: 1.6°, 9px down, 2px over (spring)
 *     200ms        HERE stamp drops onto the stub (Stamp "in", 340ms)
 *     ~404ms       contact: ink kicks out, the stub gives under it, success haptic
 *     same time    the count ticks (only the changed digit rolls)
 *   Undo           the ink lifts and the stub springs back onto the ticket
 *   server says no the ink smears off, the stub blushes and shakes its head, reattaches;
 *                  error haptic and a line saying why
 *
 * Reduced motion: no tear. The stamp fades in at rest, the count cross-fades,
 * haptics are unchanged.
 *
 * Takes async callbacks so a real screen (U3 Today) can wire it to
 * POST /attendance/[eventId]/check-in and its undo without changing the motion.
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { DUR } from "~/motion/motion";
import { Button } from "~/paper/Button";
import { Stamp, type StampState } from "~/paper/Stamp";
import { Ticket } from "~/paper/Ticket";
import { TickingNumber } from "~/paper/TickingNumber";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export type CheckInWindow = "open" | "closing" | "void";

export interface CheckInTicketProps {
  title: string;
  /** Date block: weekday caps + day number. */
  dow: string;
  day: string;
  meta: string[];
  window: CheckInWindow;
  /** Checked in already, as far as the server knows. */
  checkedIn: boolean;
  /** How many others are in (the ticket adds you on top while you're in). */
  others: number;
  of: number;
  /** e.g. "CLOSES IN 4:12" while the window is closing. */
  closingLabel?: string;
  onCheckIn: () => Promise<void>;
  onUndo: () => Promise<void>;
  /** What shows through the notches. */
  ground?: string;
}

const TONE: Record<CheckInWindow, Tone> = { open: "mint", closing: "butter", void: "rose" };

function nowLabel(): string {
  return new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function CheckInTicket(props: CheckInTicketProps) {
  const { title, dow, day, meta, window: win, checkedIn, others, of, closingLabel, onCheckIn, onUndo, ground } = props;
  const { c } = useTheme();
  const m = useMotion();

  // out → here (torn + stamped); here → undoing (ink lifts) → out; here → failing (smear) → out
  type Phase = "out" | "here" | "undoing" | "failing";
  const [phase, setPhase] = useState<Phase>(checkedIn ? "here" : "out");
  const [at, setAt] = useState<string | null>(checkedIn ? "" : null);
  const [stamp, setStamp] = useState<StampState>(checkedIn ? "shown" : "hidden");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // stub pose: torn = (rot 1.6°, y 9, x 2); attached = 0
  const torn = !m.reduced && checkedIn;
  const rot = useSharedValue(torn ? 1.6 : 0);
  const y = useSharedValue(torn ? 9 : 0);
  const x = useSharedValue(torn ? 2 : 0);
  const give = useSharedValue(0);
  const shake = useSharedValue(0);
  const blush = useSharedValue(0);

  // the server's word wins whenever it changes underneath us
  useEffect(() => {
    if (busy.current) return;
    setPhase(checkedIn ? "here" : "out");
    setStamp(checkedIn ? "shown" : "hidden");
    const t = !m.reduced && checkedIn;
    rot.value = t ? 1.6 : 0; y.value = t ? 9 : 0; x.value = t ? 2 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedIn]);

  const stubStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value + shake.value },
      { translateY: y.value + give.value * 1.5 },
      { rotate: `${rot.value}deg` },
      { scale: 1 - give.value * 0.012 },
    ],
  }));
  const blushStyle = useAnimatedStyle(() => ({ opacity: blush.value }));

  function tear() {
    if (m.reduced) return;
    const pull = m.timing(160, "flight");
    rot.value = withSequence(withTiming(3.2, pull), withSpring(1.6, m.spring("settle")));
    y.value = withSequence(withTiming(3, pull), withSpring(9, m.spring("settle")));
    x.value = withDelay(m.t(160), withSpring(2, m.spring("settle")));
  }

  function reattach(delay = 0) {
    rot.value = withDelay(m.t(delay), withSpring(0, m.spring("settle")));
    y.value = withDelay(m.t(delay), withSpring(0, m.spring("settle")));
    x.value = withDelay(m.t(delay), withSpring(0, m.spring("settle")));
  }

  function landed() {
    haptics.success();
    if (m.reduced) return;
    give.value = withSequence(withTiming(1, m.timing(114, "out")), withTiming(0, m.timing(266, "out")));
  }

  async function checkIn() {
    if (busy.current || phase !== "out") return;
    busy.current = true;
    setError(null);
    setPhase("here");
    setAt(nowLabel());
    tear();
    let landedYet = false;
    const stampAt = setTimeout(() => { landedYet = true; setStamp("in"); }, m.reduced ? 0 : m.t(200));
    try {
      await onCheckIn();
      busy.current = false;
    } catch (e) {
      clearTimeout(stampAt);
      fail(e instanceof Error ? e.message : "Couldn't check you in.", landedYet);
    }
  }

  function fail(why: string, stamped: boolean) {
    haptics.error();
    setPhase("failing");
    setStamp(stamped ? "smear" : "hidden");
    blush.value = withSequence(withTiming(1, m.timing(DUR.fade, "out")), withDelay(m.t(1400), withTiming(0, m.timing(400, "out"))));
    if (!m.reduced) {
      const k = m.timing(460 / 5, "out");
      shake.value = withDelay(m.t(140), withSequence(withTiming(-7, k), withTiming(6, k), withTiming(-4, k), withTiming(2, k), withTiming(0, k)));
    }
    reattach(m.reduced ? 0 : 520);
    later(m.t(m.reduced ? DUR.fade : 700), () => {
      setPhase("out");
      setStamp("hidden");
      setError(why);
      busy.current = false;
    });
  }

  async function undo() {
    if (busy.current || phase !== "here") return;
    busy.current = true;
    haptics.tap();
    setStamp("out");
    setPhase("undoing");
    reattach(m.reduced ? 0 : 120);
    later(m.t(m.reduced ? DUR.fade : 300), () => { setPhase(p => (p === "undoing" ? "out" : p)); setStamp("hidden"); });
    try {
      await onUndo();
      busy.current = false;
    } catch (e) {
      // undo refused: put it all back
      timers.current.forEach(clearTimeout);
      setPhase("here");
      setStamp("in");
      tear();
      setError(e instanceof Error ? e.message : "Couldn't undo that.");
      busy.current = false;
    }
  }

  const tone = TONE[win];
  const ink = c.pastel[tone].ink;
  const here = phase === "here";
  const showRow = phase !== "out";
  const count = others + (here ? 1 : 0);
  const fade = (ms: number) => FadeIn.duration(m.t(ms)).reduceMotion(ReduceMotion.Never);
  const fadeOut = FadeOut.duration(m.t(120)).reduceMotion(ReduceMotion.Never);

  const body = (
    <View style={styles.top}>
      <View style={styles.row}>
        <View style={[styles.date, { backgroundColor: c.ink }]}>
          <T v="kicker" color={c.paper} style={{ opacity: 0.75, letterSpacing: 1 }}>{dow}</T>
          <T v="title" color={c.paper} style={{ fontSize: 26, lineHeight: 28 }}>{day}</T>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.kick}>
            <View style={[styles.dot, { backgroundColor: ink }]} />
            <T v="kicker" color={ink}>
              {win === "void" ? "Check-in cancelled" : win === "closing" ? (closingLabel ?? "Closing soon") : "Check-in open"}
            </T>
          </View>
          <T v="title" numberOfLines={2}>{title}</T>
          <T v="meta" color={c.ink3} numberOfLines={1}>{meta.join("  ·  ")}</T>
        </View>
        {win === "void" && <Stamp label="VOID" sub="not counted" tone="rose" state="shown" rotate={-9} splat={false} />}
      </View>
      <View style={styles.countRow}>
        <TickingNumber value={count} v="figure" accessibilityLabel={`${count} of ${of} checked in`} />
        <T v="meta" color={c.ink3} style={{ marginBottom: 6 }}>of {of} checked in</T>
      </View>
    </View>
  );

  const stub = (
    <View style={styles.stub}>
      {win === "void" ? (
        <T v="meta" color={c.ink2}>This check-in was cancelled. Nobody's attendance counts for it.</T>
      ) : showRow ? (
        <Animated.View key="in" entering={fade(DUR.fade)} exiting={fadeOut} style={styles.rcptRow}>
          <View style={[styles.rcpt, phase === "failing"
            ? { backgroundColor: c.pastel.rose.soft, borderColor: c.pastel.rose.border }
            : { backgroundColor: c.pastel.mint.soft, borderColor: c.pastel.mint.border }]}>
            <View style={[styles.tick, { backgroundColor: phase === "failing" ? c.pastel.rose.ink : c.pastel.mint.ink }]}>
              <Icon name={phase === "failing" ? "x" : "check"} size={13} color={c.card} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="callout" numberOfLines={1}>{phase === "failing" ? "Not checked in" : phase === "undoing" ? "Taking it back" : "You're checked in"}</T>
              {at ? <T v="mono" color={c.ink3}>{at}</T> : null}
            </View>
            {here && <Button label="Undo" variant="soft" size="sm" onPress={undo} accessibilityHint="Removes your check-in" />}
          </View>
          <Stamp label="HERE" sub={at || undefined} tone="mint" state={stamp} rotate={-9} onImpact={landed} />
        </Animated.View>
      ) : (
        <Animated.View key="out" entering={fade(DUR.fade)} exiting={fadeOut} style={{ gap: 10 }}>
          <Button label="I'm here" icon="hand" tone="mint" block onPress={checkIn} accessibilityHint="Checks you in to this meeting" />
          {error && <T v="meta" color={c.pastel.rose.ink} accessibilityLiveRegion="polite">{error}</T>}
        </Animated.View>
      )}
    </View>
  );

  return (
    <Ticket
      tone={tone}
      ground={ground}
      body={body}
      stub={stub}
      stubStyle={stubStyle}
      stubUnderlay={<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.pastel.rose.soft }, blushStyle]} />}
    />
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  date: { width: 56, alignItems: "center", borderRadius: 14, paddingTop: 6, paddingBottom: 7, transform: [{ rotate: "-3deg" }] },
  kick: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  countRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  stub: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, minHeight: 78, justifyContent: "center" },
  rcptRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rcpt: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 6, borderRadius: 14, borderWidth: 1.5 },
  tick: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
