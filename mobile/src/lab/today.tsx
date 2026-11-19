/**
 * Motion Lab: U3 Today. The check-in band in each state (and its drop-in), the
 * countdown's single-digit roll, swipe rows (open, rubber band, full swipe, collapse,
 * Undo) and the announcement's tape-press. All local data: nothing here calls the API.
 */
import type { Announcement, LiveCheckIn } from "@/lib/api-types";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOutLeft, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { TickingNumber } from "~/paper/TickingNumber";
import { SwipeRow } from "~/shell/SwipeRow";
import { toast } from "~/shell/toast";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { AnnouncementNote } from "~/today/AnnouncementNote";
import { CheckInBand } from "~/today/CheckInBand";
import { countdown } from "~/today/time";
import { useNow } from "~/today/live";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";
import { Section } from "./sections";

type BandState = "open" | "closing" | "closed" | "void";

const NAMES = ["Maya Rivera", "Dev Okafor", "Jordan Tao", "Leo Park", "Wes Thornton", "Tariq Aziz"];

function fakeLive(state: BandState, present: number, me: boolean): LiveCheckIn {
  const now = new Date();
  return {
    event: { id: 0, title: "Chapter Meeting", date: now.toISOString().slice(0, 10), time: "19:00", location: "Chapter Room", mandatory: true },
    state: state === "void" || state === "closed" ? "closed" : state,
    openedAt: now.toISOString(),
    closedAt: state === "closed" || state === "void" ? now.toISOString() : null,
    closedByName: state === "closed" || state === "void" ? "Maya Rivera" : null,
    cancelledAt: state === "void" ? now.toISOString() : null,
    msRemaining: state === "closing" ? 4 * 60_000 + 12_000 : 38 * 60_000,
    presentCount: present,
    eligibleCount: 13,
    recent: state === "void" ? [] : NAMES.slice(0, Math.min(4, present)).map((name, i) => ({ brotherId: i + 1, name, avatarUrl: null, at: now.toISOString() })),
    me: { checkedIn: me, checkedInAt: me ? now.toISOString() : null, excuse: null },
  };
}

export function BandLab() {
  const [state, setState] = useState<BandState>("open");
  const [present, setPresent] = useState(5);
  const [me, setMe] = useState(false);
  const [shown, setShown] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const now = useNow(true);
  return (
    <Section title="Check-in band" note="Tone by state, cross-faded (240ms). The closing clock counts on the phone between polls. Hide → Show replays the drop-in a window gets when it opens while Today is on screen. +1 rolls only the changed digit.">
      {shown ? (
        <CheckInBand live={fakeLive(state, present, me)} fetchedAt={fetchedAt} now={now} onPress={() => toast.show("Opens the full-screen check-in")} />
      ) : <View style={{ height: 76 }} />}
      <Segmented<BandState> label="State" value={state} onChange={v => { setState(v); setFetchedAt(Date.now()); }}
        options={[{ value: "open", label: "Open" }, { value: "closing", label: "Closing" }, { value: "closed", label: "Closed" }, { value: "void", label: "VOID" }]} />
      <View style={styles.row}>
        <Button label="+1 arrival" size="sm" icon="plus" onPress={() => setPresent(p => Math.min(13, p + 1))} />
        <Button label={me ? "Me: in" : "Me: out"} size="sm" variant="soft" onPress={() => setMe(v => !v)} />
        <Button label={shown ? "Hide" : "Show"} size="sm" variant="ghost" onPress={() => setShown(s => !s)} />
      </View>
    </Section>
  );
}

export function CountdownLab() {
  const { c } = useTheme();
  const [target, setTarget] = useState(() => Date.now() + 65_000);
  const now = useNow(true);
  const cd = countdown(target - now);
  const from = (ms: number) => () => setTarget(Date.now() + ms);
  return (
    <Section title="Countdown digit" note="Mono figures; only the digit that changed rolls down (320ms, spring curve). Reduced: it cross-fades in place. Watch 1:00 → 0:59, where three digits change at once.">
      <View style={styles.cd}>
        {cd ? <TickingNumber value={cd.face} v="monoLg" direction={-1} /> : <T v="monoLg">Now</T>}
        <T v="label" color={c.ink3}>{cd?.unit ?? "under way"}</T>
      </View>
      <View style={styles.row}>
        <Button label="1:05" size="sm" variant="soft" onPress={from(65_000)} />
        <Button label="10:03" size="sm" variant="soft" onPress={from(603_000)} />
        <Button label="1:00:04" size="sm" variant="soft" onPress={from(3_604_000)} />
        <Button label="2 days" size="sm" variant="soft" onPress={from(2 * 86_400_000 + 4 * 3_600_000)} />
      </View>
    </Section>
  );
}

const ROWS = [
  { id: 1, tag: "Late · 2 days", title: "Send formal headcount" },
  { id: 2, tag: "Due today", title: "Sign the risk waiver" },
  { id: 3, tag: "Due Saturday", title: "Book the bus for Saturday" },
];

export function SwipeLab() {
  const { c } = useTheme();
  const m = useMotion();
  const [rows, setRows] = useState(ROWS);
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(320)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const exit = FadeOutLeft.duration(m.t(260)).reduceMotion(ReduceMotion.Never);
  const done = (r: (typeof ROWS)[number]) => {
    setRows(rs => rs.filter(x => x.id !== r.id));
    haptics.success();
    toast.show("Done", { detail: r.title, undo: () => setRows(rs => [...rs, r].sort((a, b) => a.id - b.id)) });
  };
  return (
    <Section title="Swipe rows" note="Release past 60pt opens; past the actions it rubber-bands at 0.7; a full swipe is judged on the raw finger delta (230pt with two actions) and ticks a selection haptic as it arms. Done collapses the row; Undo in the toast brings it back.">
      <Animated.View layout={layout} style={{ gap: 8 }}>
        {rows.map(r => (
          <Animated.View key={r.id} entering={FadeIn.duration(m.t(240)).reduceMotion(ReduceMotion.Never)} exiting={exit} layout={layout}>
            <SwipeRow label={r.title} onPress={() => toast.show("Opens the task")}
              actions={[
                { label: "Open", icon: "arrow-r", tone: "sky", onPress: () => toast.show("Opens the task") },
                { label: "Done", icon: "check", tone: "mint", onPress: () => done(r) },
              ]}>
              <View style={[styles.face, { backgroundColor: c.card, borderColor: c.line }]}>
                <T v="kicker" color={c.pastel.rose.ink} style={{ fontSize: 9.5 }}>{r.tag}</T>
                <T v="callout">{r.title}</T>
              </View>
            </SwipeRow>
          </Animated.View>
        ))}
      </Animated.View>
      <Button label="Reset rows" size="sm" variant="ghost" icon="refresh" onPress={() => setRows(ROWS)} />
    </Section>
  );
}

export function AnnouncementLab() {
  const [a, setA] = useState<NonNullable<Announcement>>({
    title: "Formal tickets are live", body: "Pick yours up from Maya before Friday.", ctaLabel: null, ctaUrl: null,
    authorName: "Maya Rivera", updatedAt: new Date().toISOString(),
  });
  return (
    <Section title="Announcement" note="A new announcement arriving while Today is open lands with a tape-press (scale 1.04 → 1, 1.5° settle, soft haptic). Reduced: a cross-fade. The first render never animates.">
      <AnnouncementNote a={a} />
      <Button label="New announcement" size="sm" icon="megaphone" onPress={() => setA(x => ({ ...x, title: x.title === "Formal tickets are live" ? "Bus leaves at 6 sharp" : "Formal tickets are live", updatedAt: new Date().toISOString() }))} />
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cd: { alignItems: "flex-start", gap: 2 },
  face: { gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5 },
});
