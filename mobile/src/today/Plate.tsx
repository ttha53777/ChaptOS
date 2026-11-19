/**
 * On your plate: only what's waiting on the signed-in member (GET /api/home `plate`),
 * late first, then today, then soon.
 *
 *   task   swipe left: Open · Done. A full swipe ticks it (PATCH /api/tasks/[id]
 *          { status: "done" }; for an Everyone · each task that's their own part).
 *          Undo in the toast sends { status: "open" } and the row comes back. The write
 *          is ~/tasks/tick, the same one the Tasks tab uses, so both caches agree.
 *   poll   no swipe: tapping opens the Tasks tab, where the ballot is.
 *   dues   no swipe: a member can't pay in the app (paying happens off the app; the
 *          treasurer records it). Tapping opens the dues book (More → Dues).
 *
 * Resolving is optimistic: the row leaves the cached plate at once, so the list itself
 * animates it away (exit: slide left + fade; the rows below glide up, transform only).
 * If the server refuses, the row comes back where it was and a toast says why.
 * Reduced motion: rows fade out and in; the rest of the list moves without travel.
 */
import type { HomePlateItem } from "@/lib/api-types";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, FadeOutLeft, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { plateKey } from "~/data/home";
import { Icon } from "~/icons/Icon";
import { EASE } from "~/motion/motion";
import { EmptyState } from "~/shell/states";
import { SwipeRow, type SwipeAction } from "~/shell/SwipeRow";
import { tickTask } from "~/tasks/tick";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { clockLabel, daysFrom, money, monthDay, relDay } from "./time";

/** Today's swipe and the Tasks screen tick through the same path (~/tasks/tick). */
export function tickPlateTask(item: Extract<HomePlateItem, { kind: "task" }>) {
  tickTask(item.task, true);
}

/* ── rows ─────────────────────────────────────────────────────────────────────── */

interface Face { tag: string; tone: Tone; title: string; meta: string | null }

function faceOf(item: HomePlateItem, today: string): Face {
  if (item.kind === "task") {
    const t = item.task;
    const at = clockLabel(t.dueTime);
    const tag = item.lane === "late" ? `Late · ${item.daysLate} ${item.daysLate === 1 ? "day" : "days"}`
      : item.lane === "today" ? `Due today${at ? ` · ${at}` : ""}`
      : t.dueDate ? `Due ${relDay(today, t.dueDate)}${at ? ` · ${at}` : ""}` : "To do";
    const meta = t.everyone === "each"
      ? `Everyone does their own · ${t.doneCount ?? 0} of ${t.memberCount ?? "?"} done`
      : t.everyone === "any" ? "Anyone can finish this for the chapter" : t.notes?.split("\n")[0] ?? null;
    return { tag, tone: item.lane === "late" ? "rose" : item.lane === "today" ? "butter" : "sky", title: t.title, meta };
  }
  if (item.kind === "poll") {
    const p = item.poll;
    const closes = p.closeDate ? (daysFrom(today, p.closeDate) <= 0 ? "closes today" : `closes ${relDay(today, p.closeDate)}`) : null;
    return {
      tag: "Vote", tone: "lilac", title: p.question,
      meta: [`${p.totalVotes} of ${p.assigneeCount} voted`, closes].filter(Boolean).join(" · "),
    };
  }
  const s = item.standing;
  const overdue = s.standing === "overdue";
  return {
    tag: overdue ? "Dues · overdue" : "Dues", tone: overdue ? "rose" : "peach",
    title: `${money(s.owes)} owed`,
    meta: overdue
      ? `${money(s.overdue)} overdue · ${s.lateDays} ${s.lateDays === 1 ? "day" : "days"} late`
      : s.nextDueDate ? `Next due ${monthDay(s.nextDueDate)}` : null,
  };
}

function RowFace({ face, link }: { face: Face; link?: boolean }) {
  const { c } = useTheme();
  const p = c.pastel[face.tone];
  return (
    <View style={[styles.face, { backgroundColor: c.card, borderColor: c.line }]}>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={[styles.tag, { backgroundColor: p.soft, borderColor: p.border }]}>
          <T v="kicker" color={p.ink} style={{ fontSize: 9.5 }}>{face.tag}</T>
        </View>
        <T v="callout" numberOfLines={2}>{face.title}</T>
        {face.meta ? <T v="meta" color={c.ink3} numberOfLines={1}>{face.meta}</T> : null}
      </View>
      {link ? <Icon name="chev-r" size={16} color={c.ink3} /> : null}
    </View>
  );
}

const toTasks = () => router.navigate("/more/tasks", { withAnchor: true });
const toDues = () => router.navigate("/more/dues", { withAnchor: true });

function PlateRow({ item, today }: { item: HomePlateItem; today: string }) {
  const face = faceOf(item, today);
  if (item.kind === "task") {
    const actions: SwipeAction[] = [
      { label: "Open", icon: "arrow-r", tone: "sky", onPress: toTasks },
      { label: "Done", icon: "check", tone: "mint", onPress: () => tickPlateTask(item) },
    ];
    return (
      <SwipeRow actions={actions} onPress={toTasks} label={`${face.tag}. ${face.title}. ${face.meta ?? ""}`} hint="Swipe left to tick it off, or open Tasks">
        <RowFace face={face} />
      </SwipeRow>
    );
  }
  const go = item.kind === "poll" ? toTasks : toDues;
  return (
    <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={`${face.tag}. ${face.title}. ${face.meta ?? ""}`}
      accessibilityHint={item.kind === "poll" ? "Opens Tasks, where you vote" : "Opens your dues"}
      style={({ pressed }) => pressed && { opacity: 0.9 }}>
      <RowFace face={face} link />
    </Pressable>
  );
}

export function Plate({ plate, today }: { plate: HomePlateItem[]; today: string }) {
  const { c } = useTheme();
  const m = useMotion();
  // Unknown kinds may arrive from a newer server: skip them (lib/api-types/home.ts).
  const items = plate.filter(p => p.kind === "task" || p.kind === "poll" || p.kind === "dues");
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(320)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const exit = m.reduced
    ? FadeOut.duration(m.t(180)).reduceMotion(ReduceMotion.Never)
    : FadeOutLeft.duration(m.t(260)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const enter = FadeIn.duration(m.t(240)).delay(m.t(80)).reduceMotion(ReduceMotion.Never);
  const tasks = items.some(i => i.kind === "task");

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <T v="heading" accessibilityRole="header">On your plate</T>
        {items.length ? <T v="mono" color={c.ink3}>{items.length}</T> : null}
      </View>
      {items.length === 0 ? (
        <Animated.View entering={enter}>
          <EmptyState compact title="Nothing on your plate." line="Tasks, votes and dues that need you will show up here." />
        </Animated.View>
      ) : (
        <Animated.View layout={layout} style={{ gap: 8 }}>
          {items.map(item => (
            <Animated.View key={plateKey(item)} entering={enter} exiting={exit} layout={layout}>
              <PlateRow item={item} today={today} />
            </Animated.View>
          ))}
          {tasks ? (
            <Animated.View layout={layout} style={styles.tip}>
              <View style={{ transform: [{ scaleX: -1 }] }}><Icon name="arrow-r" size={13} color={c.ink3} /></View>
              <T v="meta" color={c.ink3}>Swipe a task left to tick it off. Tap to open.</T>
            </Animated.View>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  face: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 18, borderWidth: 1.5 },
  tag: { alignSelf: "flex-start", paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6, borderWidth: 1 },
  tip: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
});
