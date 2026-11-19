/**
 * Motion Lab: U5 Tasks & polls. Every new motion, on local data (nothing here calls the
 * API): the Task-done moment (stamp, confetti, fly-off, next card up, and the refusal
 * return), the deck shuffle, the board's check-tick → strike → collapse, the crowd strip's
 * dot, the pen-stroke X with the bars, and the envelope opening.
 */
import type { Task } from "@/lib/api-types";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { DeckFlight, ENTER_AT, type DeckPhase } from "~/moments/TaskDone";
import { PEN_MS, PenX, VoteBar } from "~/moments/Vote";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { CheckBox, CrowdCount, CrowdStrip, StrikeTitle } from "~/tasks/bits";
import { DeckCard, SwipeCard } from "~/tasks/Deck";
import { Envelope } from "~/tasks/Ballot";
import type { Viewer } from "~/tasks/model";
import { localDay } from "~/data/home";
import { Section } from "./sections";

const VIEWER: Viewer = { id: 1, roleIds: new Set(), canManage: false };
const day = (n: number) => localDay(new Date(Date.now() + n * 86_400_000));

function fake(id: number, title: string, dueIn: number | null, extra: Partial<Task> = {}): Task {
  return {
    id, title, dueDate: dueIn == null ? null : day(dueIn), dueTime: null, status: "open", notes: null,
    createdById: null, completedById: null, completedAt: null, createdAt: new Date().toISOString(),
    assignments: [{ id, brotherId: 1, roleId: null, brother: { id: 1, name: "You", avatarUrl: null }, role: null }],
    everyone: null, doneCount: null, memberCount: null, ...extra,
  };
}

const CARDS: Task[] = [
  fake(1, "Send formal headcount", -2, { notes: "Final numbers to the venue by noon." }),
  fake(2, "Sign the risk waiver", 0, { everyone: "each", doneCount: 4, memberCount: 13, assignments: [] }),
  fake(3, "Book the bus for Saturday", 3),
  fake(4, "Fix the chapter room printer", null),
];

/* ── Task done ────────────────────────────────────────────────────────────────── */

export function TaskDoneLab() {
  const today = localDay();
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [phase, setPhase] = useState<DeckPhase>("rest");
  const [flying, setFlying] = useState<{ t: Task; key: number; hit: boolean } | null>(null);
  const top = CARDS[i % CARDS.length]!;

  const done = () => {
    if (flying) return;
    haptics.success();
    setFlying({ t: top, key: Date.now(), hit: false });
    setI(x => x + 1); setN(x => x + 1); setPhase("enter");
    toast.show(top.everyone === "each" ? "Your part's done" : "Done", { detail: top.title, undo: () => { setI(x => x - 1); setN(x => x + 1); setPhase("enter"); } });
  };
  const refuse = () => {
    setFlying(null);
    setI(x => x - 1); setN(x => x + 1); setPhase("return");
    haptics.error();
    toast.error("Couldn't tick that off", { detail: "You can only change the status of tasks assigned to you" });
  };

  return (
    <Section title="Task done" note="DONE stamp (340ms, success haptic), 12 bits of confetti from the button, the card flies off at 480ms (translate 70,−90, rotate 10°, 500ms), the next card shuffles up at 420ms. Refused = the card flies back in, stamped, and the stamp smears off. Reduced: no travel, no confetti; fades.">
      <View style={styles.stack}>
        <DeckFlight key={`${top.id}-${n}`} phase={phase} enterDelay={phase === "enter" && flying ? ENTER_AT : 0}>
          <DeckCard task={top} viewer={VIEWER} today={today} from="Maya Rivera" many onDone={done} onNext={() => { setI(x => x + 1); setN(x => x + 1); setPhase("enter"); }} />
        </DeckFlight>
        {flying ? (
          <View pointerEvents="none" style={styles.flying}>
            <DeckFlight key={flying.key} phase="done" stamp={flying.t.everyone === "each" ? "My part" : "Done"}
              onImpact={() => setFlying(f => f && { ...f, hit: true })} onFlown={() => setFlying(null)}>
              <DeckCard task={flying.t} viewer={VIEWER} today={today} from="Maya Rivera" many={false} ticked={flying.hit} />
            </DeckFlight>
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        <Button label="Server refuses the last tick" variant="ghost" tone="rose" size="sm" onPress={refuse} />
      </View>
    </Section>
  );
}

/* ── deck shuffle ─────────────────────────────────────────────────────────────── */

export function ShuffleLab() {
  const today = localDay();
  const [i, setI] = useState(0);
  const top = CARDS[i % CARDS.length]!;
  const next = () => { haptics.select(); setI(x => x + 1); };
  return (
    <Section title="Deck shuffle" note="Drag the card sideways: past 90pt (or a flick past 30pt) it slides off that way (240ms) and the next enters (tq-in, 500ms); short of it, it springs back. Vertical drags still scroll the page. Reduced: the card fades as it's dragged; the next fades in.">
      <View style={styles.stack}>
        <SwipeCard key={i} enabled onSwiped={next}>
          <DeckFlight phase={i === 0 ? "rest" : "enter"}>
            <DeckCard task={top} viewer={VIEWER} today={today} from={null} many onNext={next} />
          </DeckFlight>
        </SwipeCard>
      </View>
    </Section>
  );
}

/* ── check-tick → strike → collapse ───────────────────────────────────────────── */

const ROWS = ["Return the projector to AV", "Confirm the DJ for formal (call the agency, not the DJ directly)", "Draft the November newsletter"];

export function CheckTickLab() {
  const { c } = useTheme();
  const m = useMotion();
  const [rows, setRows] = useState(ROWS.map((t, i) => ({ id: i, t, done: false })));
  const [last, setLast] = useState<number | null>(null);

  const tick = (id: number) => {
    haptics.success();
    setLast(id);
    setRows(rs => rs.map(r => (r.id === id ? { ...r, done: true } : r)));
    setTimeout(() => setRows(rs => rs.filter(r => r.id !== id)), m.t(760));
  };
  const refuse = () => {
    if (last == null) return;
    haptics.error();
    setRows(rs => {
      const has = rs.find(r => r.id === last);
      if (has) return rs.map(r => (r.id === last ? { ...r, done: false } : r));
      return [...rs, { id: last, t: ROWS[last]!, done: false }].sort((a, b) => a.id - b.id);
    });
    toast.error("Couldn't tick that off", { detail: "You can only change the status of tasks assigned to you" });
  };

  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(320)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const exit = FadeOut.duration(m.t(m.reduced ? 180 : 240)).reduceMotion(ReduceMotion.Never);
  return (
    <Section title="Check-tick → strike → collapse" note="Box fills (200ms) and the check is uncovered left to right (320ms) with a thump; the strike runs line by line (420ms); the row leaves at 760ms and the rest glide up (320ms layout). Refuse right after a tick to see it run backwards. Reduced: cross-fades, no glide.">
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        {rows.map(r => (
          <Animated.View key={r.id} entering={FadeIn.duration(m.t(220)).reduceMotion(ReduceMotion.Never)} exiting={exit} layout={layout} style={styles.tick}>
            <CheckBox done={r.done} onPress={() => !r.done && tick(r.id)} label={r.t} />
            <View style={{ flex: 1 }}><StrikeTitle struck={r.done}>{r.t}</StrikeTitle></View>
          </Animated.View>
        ))}
      </View>
      <View style={styles.row}>
        <Button label="Refuse last" variant="ghost" tone="rose" size="sm" onPress={refuse} />
        <Button label="Reset" variant="soft" size="sm" onPress={() => setRows(ROWS.map((t, i) => ({ id: i, t, done: false })))} />
      </View>
    </Section>
  );
}

/* ── crowd strip ──────────────────────────────────────────────────────────────── */

export function CrowdLab() {
  const [done, setDone] = useState(4);
  const total = 13;
  return (
    <Section title="Crowd strip" note="One dot per member. A dot that fills while you watch drops in (translateY −14, scale 1.6 → 1, pop spring); one that empties lifts out (220ms). Over 40 members the strip shows 40 dots, each a share. Reduced: cross-fades.">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}><CrowdStrip done={done} total={total} size={11} /></View>
        <CrowdCount done={done} total={total} />
      </View>
      <View style={styles.row}>
        <Button label="My tick" icon="check" tone="mint" size="sm" onPress={() => { haptics.success(); setDone(d => Math.min(total, d + 1)); }} />
        <Button label="Refused" variant="ghost" tone="rose" size="sm" onPress={() => { haptics.error(); setDone(d => Math.max(0, d - 1)); }} />
      </View>
    </Section>
  );
}

/* ── pen-stroke X + bars ──────────────────────────────────────────────────────── */

const OPTS = [{ id: 1, label: "Pizza", n: 1 }, { id: 2, label: "Tacos", n: 2 }];

export function VoteLab() {
  const { c } = useTheme();
  const m = useMotion();
  const [mine, setMine] = useState<number | null>(null);
  const [counts, setCounts] = useState<number[] | null>(null);
  const sealed = 3;

  const vote = (id: number) => {
    if (id === mine) return;
    haptics.tap();
    setMine(id);
    // the "server" answers 350ms later and reveals the counts
    setTimeout(() => setCounts(OPTS.map(o => o.n + (o.id === id ? 1 : 0))), m.t(350));
  };
  const refuse = () => { haptics.error(); setMine(null); setCounts(null); toast.error("Couldn't cast your vote", { detail: "This poll is closed" }); };
  const total = counts?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <Section title="Pen-stroke X + bars" note="Tap an option: the X is two strokes (170ms each, the second 150ms later) with a light haptic; when the counts arrive the bars grow (900ms, spring curve) and land with a success haptic. Counts stay hidden ('3 sealed') until then. Refuse erases the X backwards. Reduced: the X and bars cross-fade.">
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line2, padding: 8 }]}>
        {OPTS.map((o, i) => {
          const share = counts && total ? counts[i]! / total : 0;
          return (
            <Pressable key={o.id} style={styles.opt} onPress={() => vote(o.id)} accessibilityRole="radio" accessibilityState={{ checked: mine === o.id }}>
              <VoteBar share={share} show={counts != null} delay={PEN_MS} color={c.pastel.lilac.soft} onGrown={i === 0 ? () => haptics.success() : undefined} />
              <View style={[styles.box, { borderColor: c.ink2, backgroundColor: c.card }]}><PenX drawn={mine === o.id} /></View>
              <T v="callout" style={{ flex: 1 }}>{o.label}</T>
              {counts ? <T v="mono" color={c.ink3}>{Math.round(share * 100)}%</T> : null}
            </Pressable>
          );
        })}
        <T v="meta" color={c.ink3} style={{ paddingHorizontal: 8, paddingTop: 6 }}>
          {counts ? "Your vote is in. Tap another to change it." : `${sealed} sealed · counts open once you vote.`}
        </T>
      </View>
      <View style={styles.row}>
        <Button label="Server refuses" variant="ghost" tone="rose" size="sm" onPress={refuse} />
        <Button label="Reset" variant="soft" size="sm" onPress={() => { setMine(null); setCounts(null); }} />
      </View>
    </Section>
  );
}

/* ── envelope ─────────────────────────────────────────────────────────────────── */

export function EnvelopeLab() {
  const { c } = useTheme();
  const [k, setK] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <Section title="Envelope" note="A sealed ballot: tap and the flap folds back about its top edge (rotateX, 360ms) while the wax seal lifts and fades; the options then slide out. Reduced: flap and seal cross-fade.">
      <Pressable key={k} style={[styles.card, { backgroundColor: c.card, borderColor: c.line2, paddingVertical: 14 }]} onPress={() => setOpen(true)} accessibilityRole="button">
        <T v="subhead" style={{ paddingHorizontal: 16 }}>Pizza or tacos tonight?</T>
        <Envelope open={open} />
        {open ? <Animated.View entering={FadeIn.delay(200)}><T v="meta" color={c.ink3} style={{ padding: 16 }}>(the options slide out here)</T></Animated.View> : null}
      </Pressable>
      <View style={styles.row}><Button label="Seal it again" variant="soft" size="sm" onPress={() => { setOpen(false); setK(x => x + 1); }} /></View>
    </Section>
  );
}

const styles = StyleSheet.create({
  stack: { position: "relative", paddingBottom: 12 },
  flying: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 5 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  card: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  tick: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8 },
  box: { width: 24, height: 24, borderWidth: 1.8, borderRadius: 5 },
});
