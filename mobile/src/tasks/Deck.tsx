/**
 * On you: my open tasks as a deck of ruled index cards, soonest due first (undated last).
 * Mock `.tq-deck` / deckDone() / deckNext().
 *
 *   Done        the Task-done moment (~/moments/TaskDone): stamp + confetti + fly-off, the
 *               next card shuffles up. The write is ~/tasks/tick (optimistic, Undo in the
 *               toast); the card is snapshotted, so it can fly while the list moves on.
 *   swipe       drag the top card sideways: past 90pt (or a flick) it slides off that way
 *               and the next card enters; short of it, it springs back. Selection haptic.
 *               The pan only claims horizontal moves, so the page still scrolls.
 *   Next        the same as a swipe, for people who don't swipe.
 *   tap         opens the task sheet.
 *   refused     the card flies back in, still stamped, and the stamp smears off.
 *
 * The top card is tracked by id, not position, so a refetch that reorders the list
 * doesn't swap the card under someone's thumb. Reduced motion: see TaskDone; the swipe
 * still follows the finger, but the hand-off is a fade.
 */
import type { Task } from "@/lib/api-types";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon } from "~/icons/Icon";
import { DeckFlight, ENTER_AT, type DeckPhase } from "~/moments/TaskDone";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Avatar } from "~/paper/bits";
import { IndexCard } from "~/paper/stationery";
import { EmptyState } from "~/shell/states";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { soft } from "~/theme/shadow";
import { T } from "~/ui/T";
import { CrowdCount, CrowdStrip } from "./bits";
import { bandOf, capNote, deckLabel, type Band, type Viewer } from "./model";
import { onTickRefused, tickTask } from "./tick";

export const BAND_TONE: Record<Band, Tone> = { overdue: "rose", today: "peach", soon: "peach", upcoming: "sky", none: "butter", done: "mint" };

const SWIPE_AT = 90;

interface Flying { task: Task; key: string; impacted: boolean }

export function Deck({ mine, viewer, today, nameOf, onOpen }: {
  /** Open tasks on me, already sorted by due. */
  mine: Task[];
  viewer: Viewer;
  today: string;
  nameOf: (id: number | null) => string | null;
  onOpen: (t: Task) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const [topId, setTopId] = useState<number | null>(null);
  const [entering, setEntering] = useState<{ id: number; phase: DeckPhase; n: number } | null>(null);
  const [flying, setFlying] = useState<Flying | null>(null);

  const idx = Math.max(0, mine.findIndex(t => t.id === topId));
  const top = mine[idx] ?? null;
  const nextOf = (id: number) => {
    const i = mine.findIndex(t => t.id === id);
    return mine.length > 1 ? mine[(i + 1) % mine.length]! : null;
  };

  // A refused tick puts the task back in the list: bring its card back to the top.
  useEffect(() => onTickRefused(id => {
    setFlying(f => (f?.task.id === id ? null : f));
    setTopId(id);
    setEntering(e => ({ id, phase: "return", n: (e?.n ?? 0) + 1 }));
  }), []);

  const done = (t: Task) => {
    if (flying) return;
    const next = nextOf(t.id);
    setFlying({ task: t, key: `fly-${t.id}-${Date.now()}`, impacted: false });
    setTopId(next?.id ?? null);
    if (next) setEntering(e => ({ id: next.id, phase: "enter", n: (e?.n ?? 0) + 1 }));
    tickTask(t, true);
  };

  const skip = (t: Task) => {
    const next = nextOf(t.id);
    if (!next) return;
    haptics.select();
    setTopId(next.id);
    setEntering(e => ({ id: next.id, phase: "enter", n: (e?.n ?? 0) + 1 }));
  };

  if (!mine.length && !flying) {
    return (
      <Section count={null}>
        <EmptyState compact title="Nothing's on you." line="Anything handed to you, your role or everyone lands here first." />
      </Section>
    );
  }

  const phase: DeckPhase = top && entering?.id === top.id ? entering.phase : "rest";
  const cardKey = top ? `${top.id}-${entering?.id === top.id ? entering.n : 0}` : "none";

  return (
    <Section count={top ? `${idx + 1} of ${mine.length}` : null}>
      <View style={styles.stack}>
        {mine.length > 2 ? <View style={[styles.ghost, styles.g2, { backgroundColor: c.card, borderColor: c.line2 }, soft(c.sh1)]} /> : null}
        {mine.length > 1 ? <View style={[styles.ghost, styles.g1, { backgroundColor: c.card, borderColor: c.line2 }, soft(c.sh1)]} /> : null}
        {top ? (
          <SwipeCard key={cardKey} enabled={mine.length > 1 && !flying} onSwiped={() => skip(top)}>
            <DeckFlight phase={phase} enterDelay={phase === "enter" && flying ? ENTER_AT : 0}>
              <DeckCard task={top} viewer={viewer} today={today} from={nameOf(top.createdById)}
                many={mine.length > 1} onDone={() => done(top)} onNext={() => skip(top)} onOpen={() => onOpen(top)} />
            </DeckFlight>
          </SwipeCard>
        ) : <View style={{ height: 120 }} />}
        {flying ? (
          <View pointerEvents="none" style={styles.flying}>
            <DeckFlight key={flying.key} phase="done" stamp={flying.task.everyone === "each" ? "My part" : "Done"}
              onImpact={() => setFlying(f => f && { ...f, impacted: true })} onFlown={() => setFlying(null)}>
              <DeckCard task={flying.task} viewer={viewer} today={today} from={nameOf(flying.task.createdById)} many={false} ticked={flying.impacted} />
            </DeckFlight>
          </View>
        ) : null}
      </View>
    </Section>
  );
}

function Section({ count, children }: { count: string | null; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.head}>
        <View style={[styles.dash, { backgroundColor: c.pastel.lilac.ink }]} />
        <T v="label" color={c.ink3} accessibilityRole="header">On you</T>
        {count ? <T v="mono" color={c.ink3} style={{ marginLeft: "auto", fontSize: 11.5 }}>{count}</T> : null}
      </View>
      {children}
    </View>
  );
}

/* ── the swipe ────────────────────────────────────────────────────────────────── */

export function SwipeCard({ enabled, onSwiped, children }: { enabled: boolean; onSwiped: () => void; children: ReactNode }) {
  const m = useMotion();
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const off = m.timing(240, "out");
  const back = m.spring("settle");
  const away = width * 1.1;
  const reduced = m.reduced;

  const pan = usePanGesture({
    enabled,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onUpdate: e => { "worklet"; x.value = e.translationX; },
    onDeactivate: e => {
      "worklet";
      const far = Math.abs(x.value) > SWIPE_AT || (Math.abs(e.velocityX) > 700 && Math.abs(x.value) > 30);
      if (!far) { x.value = withTiming(0, back); return; }
      const dir = x.value + e.velocityX * 0.05 > 0 ? 1 : -1;
      x.value = withTiming(reduced ? x.value : dir * away, off, fin => { if (fin) scheduleOnRN(onSwiped); });
    },
  });

  const st = useAnimatedStyle(() => ({
    opacity: reduced ? 1 - Math.min(1, Math.abs(x.value) / (away * 0.6)) : 1,
    transform: [{ translateX: x.value }, { rotate: `${x.value / 22}deg` }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ zIndex: 2 }, st]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/* ── the card ─────────────────────────────────────────────────────────────────── */

export function DeckCard({ task, viewer, today, from, many, ticked, onDone, onNext, onOpen }: {
  task: Task; viewer: Viewer; today: string; from: string | null; many: boolean; ticked?: boolean;
  onDone?: () => void; onNext?: () => void; onOpen?: () => void;
}) {
  const { c } = useTheme();
  const band = bandOf(task, today);
  const tone = BAND_TONE[band];
  const ink = c.pastel[tone].ink;
  const note = capNote(task, viewer);
  const each = task.everyone === "each";
  // The flying copy drops my dot into the crowd as the stamp lands.
  const doneN = (task.doneCount ?? 0) + (ticked && each ? 1 : 0);

  return (
    <IndexCard tone={tone} cap={
      <View style={styles.cap}>
        <View style={[styles.capDot, { backgroundColor: ink }]} />
        <T v="kicker" color={ink} style={{ fontSize: 10 }}>{deckLabel(task, today)}</T>
        {note ? <T v="meta" color={c.ink3} style={{ marginLeft: "auto", fontSize: 12 }} numberOfLines={1}>{note}</T> : null}
      </View>
    }>
      <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole="button" accessibilityHint="Opens the task"
        accessibilityLabel={`${deckLabel(task, today)}. ${task.title}`}>
        <View style={styles.lines}>
          <T v="title" style={{ lineHeight: 30 }}>{task.title}</T>
          {task.notes ? <T v="body" color={c.ink2} style={{ lineHeight: 30 }} numberOfLines={2}>{task.notes}</T> : null}
        </View>
        {each && task.memberCount != null ? (
          <View style={styles.crowd}>
            <View style={{ flex: 1 }}><CrowdStrip done={doneN} total={task.memberCount} size={8} /></View>
            <CrowdCount done={doneN} total={task.memberCount} />
          </View>
        ) : null}
        <View style={styles.meta}>
          {from ? <><Avatar name={from} size="sm" style={{ width: 22, height: 22 }} /><T v="meta" color={c.ink3}>From {from.split(" ")[0]}</T></> : null}
          {task.dueDate ? (
            <View style={styles.tl}>
              <Icon name="timeline" size={12} color={c.pastel.sky.ink} />
              <T v="mono" color={c.ink3} style={{ fontSize: 10.5 }}>On the Timeline</T>
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.buttons}>
        <Button label={each ? "Done my part" : "Done"} icon="check" tone="mint" onPress={onDone} disabled={!onDone} style={{ flex: 1 }} />
        {many ? <Button label="Next" icon="arrow-r" variant="ghost" tone="lilac" onPress={onNext} /> : null}
      </View>
    </IndexCard>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  dash: { width: 14, height: 2, borderRadius: 2 },
  stack: { position: "relative", paddingBottom: 12 },
  ghost: { position: "absolute", bottom: 0, height: 90, borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 16, borderBottomRightRadius: 8, borderBottomLeftRadius: 14 },
  g1: { left: 5, right: 5, bottom: 6, transform: [{ rotate: "1.1deg" }] },
  g2: { left: 13, right: 13, transform: [{ rotate: "-1.4deg" }] },
  flying: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 5 },
  cap: { flexDirection: "row", alignItems: "center", gap: 7 },
  capDot: { width: 8, height: 8, borderRadius: 4 },
  lines: { paddingTop: 3 },
  crowd: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10 },
  meta: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 12, minHeight: 34 },
  tl: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 },
  buttons: { flexDirection: "row", gap: 10, paddingTop: 14, paddingBottom: 2 },
});
