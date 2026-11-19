/**
 * Programming (the web's events page), reached from More → Programming:
 *
 *   status line   what's next, then the counts you can go and change: wrap-ups due,
 *                 ready to confirm, ideas nobody's on. Each count jumps to its lane
 *   the glance    On the slate · Next 14 days · Unowned ideas · Average stars
 *   the board     one lane at a time (Idea · Planning · Confirmed · Done) under tabs
 *                 whose ink marker slides; type chips filter; a find line when it's long
 *   day one       nothing yet: three pictures and Add your first idea (officers)
 *
 * Cards open the event sheet. Officers (MANAGE_EVENTS) add ideas from the header +.
 */
import type { ProgrammingEvent, ProgrammingStage } from "@/lib/api-types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { localDay } from "~/data/home";
import { useProgramming } from "~/data/programming";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { navLabel } from "~/more/model";
import { EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { EventCard } from "~/programming/Card";
import { EventSheet } from "~/programming/EventSheet";
import { canManage, needsWrapUp, readyToConfirm, STAGE, STAGES, stats, statusLine, type Clause } from "~/programming/model";
import { NewIdea } from "~/programming/steps";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { toneOf } from "~/timeline/model";
import { T } from "~/ui/T";

const LANE_EMPTY: Record<ProgrammingStage, string> = {
  idea: "No ideas waiting. Anything the chapter might do starts here.",
  planning: "Nothing being planned. Pick up an idea to start one.",
  confirmed: "Nothing confirmed. A plan with a day, a place and an owner can be.",
  done: "Nothing wrapped yet. Confirmed events land here once they've happened.",
};

export default function Programming() {
  const { c } = useTheme();
  const m = useMotion();
  const me = useEntryOf("ready")?.me ?? null;
  const q = useProgramming();
  const officer = !!me && canManage(me);
  const today = localDay();
  const [lane, setLane] = useState<ProgrammingStage | null>(null);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const all = q.data ?? null;
  // land on the lane that needs someone: wrap-ups, then plans, then ideas
  useEffect(() => {
    if (!all || lane) return;
    setLane(all.some(e => needsWrapUp(e, today)) && officer ? "confirmed"
      : all.some(e => e.stage === "planning") ? "planning"
        : all.some(e => e.stage === "idea") ? "idea" : all.some(e => e.stage === "confirmed") ? "confirmed" : "idea");
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const usedTypes = useMemo(() => {
    const n = new Map<string, string>();
    for (const e of all ?? []) n.set(e.category, e.type);
    return [...n.entries()].map(([slug, label]) => ({ slug, label }));
  }, [all]);

  const shown = useMemo(() => {
    let l = all ?? [];
    if (types.size) l = l.filter(e => types.has(e.category));
    const s = find.trim().toLowerCase();
    if (s) l = l.filter(e => [e.title, e.location, e.collab ?? "", e.type].some(x => x.toLowerCase().includes(s)));
    return l;
  }, [all, types, find]);

  if (!me) return null;
  const title = navLabel(me, "Programming");
  const counts = Object.fromEntries(STAGES.map(s => [s, shown.filter(e => e.stage === s).length])) as Record<ProgrammingStage, number>;
  const cur = lane ?? "idea";
  const inLane = sortLane(shown.filter(e => e.stage === cur), cur, today);

  const right = officer ? (
    <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="New idea" hitSlop={8}
      style={({ pressed }) => [styles.plus, { backgroundColor: c.ink, boxShadow: `${pressed ? 1 : 2}px ${pressed ? 1 : 2}px 0 ${c.note.fill.butter}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      <Icon name="plus" size={16} color={c.paper} />
    </Pressable>
  ) : null;

  let body: React.ReactNode;
  if (!all) {
    body = q.isError ? <ErrorState title="Couldn't load the board." error={q.error} onRetry={() => void q.refetch()} /> : <><SkeletonCard height={90} /><SkeletonList count={4} /></>;
  } else if (!all.length) {
    body = (
      <EmptyState
        pictures={[{ icon: "spark", tone: "butter", label: "Jot the idea" }, { icon: "people", tone: "peach", label: "Someone picks it up" }, { icon: "cal", tone: "sky", label: "Confirm: it's on the Timeline" }]}
        title="Nothing on the board."
        line={officer ? "Start with an idea. It needs only a name and a kind; the rest comes as it firms up." : "When officers start planning events, you'll see them here before they hit the calendar."}
        action={officer ? { label: "Add your first idea", icon: "plus", onPress: () => setAdding(true) } : undefined} />
    );
  } else {
    const st = stats(all, today);
    const line = statusLine(all, today, officer);
    const jump = (k: Clause["kind"]) => {
      haptics.select();
      setTypes(new Set()); setFind("");
      setLane(k === "wrap" ? "confirmed" : k === "ready" ? "planning" : "idea");
    };
    const layout = LinearTransition.duration(m.t(m.reduced ? 0 : 260)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
    body = (
      <>
        <T v="body" color={c.ink2} style={{ lineHeight: 23 }}>
          {line.lead ? <T v="body" color={c.ink2}>{"Next up: "}<T v="body" color={c.ink} style={{ fontWeight: "700" }}>{line.lead.title}</T>{` ${line.lead.when}. `}</T> : <T v="body" color={c.ink2}>{"Nothing dated coming up. "}</T>}
          {line.bits.map(b => (
            <T key={b.kind} v="body" color={b.kind === "wrap" ? c.pastel.rose.ink : c.pastel.butter.ink} style={styles.clause} onPress={() => jump(b.kind)} accessibilityRole="link">{b.text}</T>
          ))}
          {!line.bits.length ? <T v="body" color={c.ink2}>Every plan has someone on it.</T> : null}
        </T>

        <View style={styles.glance}>
          <Measure label="On the slate" value={String(st.slate)} />
          <Measure label="Next 14 days" value={String(st.next14)} sub={st.next14Unready ? `${st.next14Unready} not ready` : undefined} warn={st.next14Unready > 0} />
          <Measure label="Unowned" value={String(st.unowned)} warn={st.unowned > 0} />
          <Measure label="Average" value={st.avg != null ? `${st.avg.toFixed(1)}★` : "–"} sub={st.rated ? `${st.rated} rated` : undefined} />
        </View>

        <LaneTabs lane={cur} counts={counts} onPick={s => { if (s !== cur) { haptics.select(); setLane(s); } }} />

        {usedTypes.length > 1 || all.length > 12 ? (
          <View style={{ gap: 10 }}>
            {all.length > 12 ? (
              <View style={[styles.find, { borderColor: c.line2, backgroundColor: c.card }]}>
                <Icon name="search" size={15} color={c.ink3} />
                <TextInput value={find} onChangeText={setFind} placeholder="Find an event" placeholderTextColor={c.faint} style={[styles.findIn, { color: c.ink }]} accessibilityLabel="Find an event" />
              </View>
            ) : null}
            {usedTypes.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                {usedTypes.map(t => {
                  const on = types.has(t.slug);
                  const p = c.pastel[toneOf(t.slug)];
                  return (
                    <Pressable key={t.slug} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t.label}
                      onPress={() => { haptics.select(); setTypes(s => { const n = new Set(s); if (n.has(t.slug)) n.delete(t.slug); else n.add(t.slug); return n; }); }}
                      style={[styles.chip, { borderColor: on ? c.ink : p.border, backgroundColor: on ? p.soft : c.card }]}>
                      <View style={[styles.dot, { backgroundColor: p.ink }]} />
                      <T v="pill" color={on ? c.ink : c.ink2}>{t.label}</T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        <View key={cur} style={{ gap: 12 }}>
          <T v="meta" color={c.ink3}>{STAGE[cur].meaning}{cur === "confirmed" || cur === "done" ? " On the chapter's Timeline." : " Not on the Timeline yet."}</T>
          {inLane.map((e, i) => (
            <Animated.View key={e.id} layout={layout} exiting={FadeOut.duration(m.t(150)).reduceMotion(ReduceMotion.Never)}
              entering={(m.reduced ? FadeIn.duration(m.t(160)) : FadeInDown.delay(m.t(Math.min(i, 8) * 30)).duration(m.t(260)).springify().damping(18)).reduceMotion(ReduceMotion.Never)}>
              <EventCard e={e} i={i} today={today} onPress={() => setOpen(e.id)} />
            </Animated.View>
          ))}
          {!inLane.length ? (
            <View style={[styles.laneEmpty, { borderColor: c.line2 }]}>
              <T v="body" color={c.ink2}>{types.size || find.trim() ? "Nothing here matches that filter." : LANE_EMPTY[cur]}</T>
              {officer && cur === "idea" && !types.size && !find.trim() ? <Pressable onPress={() => setAdding(true)} accessibilityRole="button"><T v="callout" color={c.pastel.butter.ink}>+ New idea</T></Pressable> : null}
            </View>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <Screen title={title} large back="More" right={right} onRefresh={() => q.refetch()} subtitle={me.org?.activeTerm?.label}>
      {body}
      <EventSheet id={open} onClose={() => setOpen(null)} />
      {officer ? <NewIdea open={adding} onClose={() => setAdding(false)} onAdded={e => { setLane("idea"); setOpen(e.id); }} /> : null}
    </Screen>
  );
}

/** Within a lane: what needs someone first, then by date (dateless last); done newest first. */
function sortLane(l: ProgrammingEvent[], lane: ProgrammingStage, today: string): ProgrammingEvent[] {
  const rank = (e: ProgrammingEvent) => (needsWrapUp(e, today) ? 0 : readyToConfirm(e) ? 1 : e.stage === "idea" && !e.owner ? 2 : 3);
  return l.slice().sort((a, b) => {
    if (lane === "done") return (b.dueDate ?? "").localeCompare(a.dueDate ?? "");
    return rank(a) - rank(b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id - b.id;
  });
}

function Measure({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.measure, { borderColor: c.line, backgroundColor: c.card }]} accessible accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ""}`}>
      <T v="title" style={{ fontSize: 22, lineHeight: 26 }} color={warn ? c.pastel.rose.ink : c.ink}>{value}</T>
      <T v="kicker" color={c.ink3} numberOfLines={1} style={{ fontSize: 9 }}>{label}</T>
      {sub ? <T v="meta" color={warn ? c.pastel.rose.ink : c.ink3} numberOfLines={1} style={{ fontSize: 11 }}>{sub}</T> : null}
    </View>
  );
}

/** Four lane tabs; an ink marker slides under the chosen one (settle spring; reduced: it jumps). */
function LaneTabs({ lane, counts, onPick }: { lane: ProgrammingStage; counts: Record<ProgrammingStage, number>; onPick: (s: ProgrammingStage) => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const [w, setW] = useState(0);
  const idx = STAGES.indexOf(lane);
  const x = useSharedValue(idx);
  const first = useRef(true);
  useEffect(() => {
    if (first.current || m.reduced) { x.value = idx; first.current = false; return; }
    x.value = withSpring(idx, m.spring("settle"));
  }, [idx, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const seg = w / 4;
  const mark = useAnimatedStyle(() => ({ opacity: w ? 1 : 0, transform: [{ translateX: seg * x.value }] }));
  return (
    <View style={[styles.tabs, { borderColor: c.ink, backgroundColor: c.card }]} onLayout={e => setW(e.nativeEvent.layout.width - 3)} accessibilityRole="tablist">
      <Animated.View style={[styles.tabMark, { width: seg, backgroundColor: c.ink }, mark]} />
      {STAGES.map(s => {
        const on = s === lane;
        return (
          <Pressable key={s} onPress={() => onPick(s)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${STAGE[s].label}, ${counts[s]}`}>
            <T v="pill" color={on ? c.paper : c.ink2} numberOfLines={1}>{STAGE[s].label}</T>
            <View style={[styles.count, { backgroundColor: on ? c.note.fill[STAGE[s].tone] : c.paper2 }]}>
              <T v="mono" color={on ? c.note.ink : c.ink3} style={{ fontSize: 10.5, fontWeight: "700" }}>{counts[s]}</T>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  plus: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  clause: { fontWeight: "600", textDecorationLine: "underline", textDecorationStyle: "dotted" },
  glance: { flexDirection: "row", gap: 7 },
  measure: { flex: 1, gap: 1, paddingVertical: 10, paddingHorizontal: 9, borderRadius: 14, borderWidth: 1.5 },
  tabs: { flexDirection: "row", borderWidth: 1.5, borderRadius: 14, height: 44, overflow: "hidden" },
  tabMark: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 12 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 2 },
  count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  find: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  findIn: { flex: 1, fontSize: 16, paddingVertical: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 34 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  laneEmpty: { gap: 8, padding: 18, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", alignItems: "flex-start" },
});
