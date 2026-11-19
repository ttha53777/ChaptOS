/**
 * The timeline spine (mock `tlx-*`): a month head per month (sticks under the bar as you
 * scroll; ../app/(tabs)/timeline passes their indices to Screen), then that month's rows on
 * a ruled spine. Each row: a date column (only on a day's first row), a node on the spine
 * (a dot in the category's ink; a diamond for a deadline), and a card with the category,
 * the title, when and where, a Required tag, and for a past required event my own line
 * (Here / Excused / Excuse waiting / Missed).
 *
 * Rows leave through a layout exit (a ticked deadline drops off), and the rest close up
 * with a 240ms layout transition; reduced motion: cross-fades only, no glide.
 */
import type { CalEventType, MyExcuseItem } from "@/lib/api-types";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { DUR, EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Pill } from "~/paper/bits";
import { alpha, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { daysFrom, dayStart } from "~/today/time";
import { T } from "~/ui/T";
import { inkOf, labelOf, whenLabel, type Month, type Row } from "./model";

export interface Mine { attended: Set<number>; excuses: Map<number, MyExcuseItem> }

export function MonthHead({ month, past }: { month: Month; past: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.head, { backgroundColor: c.paper }]} accessibilityRole="header">
      <T v="heading" color={past ? c.ink3 : c.ink}>{month.label}</T>
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{month.year}</T>
      <View style={[styles.headRule, { backgroundColor: c.line }]} />
    </View>
  );
}

export function MonthBody({ month, today, types, mine, todayKey, onOpen, onLayout, onTodayLayout }: {
  month: Month; today: string; types: CalEventType[] | undefined; mine: Mine;
  /** The row the Today marker goes in front of; "end" = after this month's last row. */
  todayKey: string | null;
  onOpen: (r: Row) => void; onLayout?: (e: LayoutChangeEvent) => void; onTodayLayout?: (y: number) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  // Driven by the app's own reduced-motion setting (Lab can force it), not the system's.
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(DUR.move)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const exit = FadeOut.duration(m.t(DUR.fade)).reduceMotion(ReduceMotion.Never);
  return (
    <Animated.View onLayout={onLayout} entering={FadeIn.duration(m.t(DUR.move)).reduceMotion(ReduceMotion.Never)} style={styles.body}>
      <View style={[styles.spine, { backgroundColor: c.line2 }]} />
      {month.rows.map((r, i) => {
        const firstOfDay = i === 0 || month.rows[i - 1]!.date !== r.date;
        return (
          <Animated.View key={r.key} layout={layout} exiting={exit}>
            {todayKey === r.key ? <TodayMarker onLayout={onTodayLayout} /> : null}
            <RowView row={r} today={today} types={types} mine={mine} firstOfDay={firstOfDay} onOpen={onOpen} />
          </Animated.View>
        );
      })}
      {todayKey === "end" ? <TodayMarker onLayout={onTodayLayout} last /> : null}
    </Animated.View>
  );
}

function TodayMarker({ onLayout, last }: { onLayout?: (y: number) => void; last?: boolean }) {
  const { c } = useTheme();
  const ink = c.pastel.rose.ink;
  return (
    <View onLayout={e => onLayout?.(e.nativeEvent.layout.y)} style={styles.today} accessibilityRole="text" accessibilityLabel={last ? "Today. Nothing after this." : "Today"}>
      <View style={[styles.todayTag, { backgroundColor: ink }]}><T v="label" color={c.card} style={{ fontSize: 9.5 }}>Today</T></View>
      <View style={[styles.todayDot, { backgroundColor: ink, borderColor: c.paper }]} />
      <View style={[styles.todayRule, { backgroundColor: alpha(ink, 0.5) }]} />
      {last ? <T v="meta" color={c.ink3} style={{ position: "absolute", left: 66, top: 18 }}>Nothing else on the calendar.</T> : null}
    </View>
  );
}

function RowView({ row, today, types, mine, firstOfDay, onOpen }: {
  row: Row; today: string; types: CalEventType[] | undefined; mine: Mine; firstOfDay: boolean; onOpen: (r: Row) => void;
}) {
  const { c } = useTheme();
  const slug = row.kind === "event" ? row.event.category : "deadline";
  const ink = inkOf(slug, c);
  const n = daysFrom(today, row.date);
  const past = n < 0;
  const d = dayStart(row.date);
  const title = row.kind === "event" ? row.event.title : row.task.title;
  const where = row.kind === "event" ? row.event.location : null;
  const status = row.kind === "event" && row.event.mandatory && past ? myLine(row.event.id, mine) : null;
  const when = whenLabel(row, today);

  return (
    <View style={[styles.row, past && { opacity: 0.72 }]}>
      <View style={styles.date} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {firstOfDay ? (
          <>
            <T v="mono" color={n === 0 ? c.pastel.rose.ink : c.ink3} style={{ fontSize: 10 }}>{d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}</T>
            <T v="title" color={n === 0 ? c.pastel.rose.ink : c.ink} style={{ fontSize: 22, lineHeight: 26 }}>{d.getDate()}</T>
          </>
        ) : null}
      </View>
      <View style={styles.nodeCol}>
        {row.kind === "deadline"
          ? <View style={[styles.diamond, { borderColor: ink, backgroundColor: c.paper }]} />
          : <View style={[styles.node, { backgroundColor: past ? c.paper : ink, borderColor: ink }]} />}
      </View>
      <Pressable onPress={() => { haptics.select(); onOpen(row); }} accessibilityRole="button"
        accessibilityLabel={`${title}. ${labelOf(slug, types)}. ${when}${where ? `, ${where}` : ""}${row.kind === "event" && row.event.mandatory ? ". Required" : ""}${status ? `. ${status.label}` : ""}`}
        style={({ pressed }) => [styles.card, {
          backgroundColor: c.card, borderColor: row.kind === "deadline" ? alpha(ink, 0.6) : c.line,
          borderStyle: row.kind === "deadline" ? "dashed" : "solid", transform: [{ scale: pressed ? 0.985 : 1 }],
        }]}>
        <View style={styles.cardTop}>
          <View style={[styles.catDot, { backgroundColor: ink }]} />
          <T v="label" color={ink} style={{ fontSize: 9.5, flex: 1 }} numberOfLines={1}>{labelOf(slug, types)}</T>
          {row.kind === "event" && row.event.mandatory && !past ? <Pill label="Required" tone="rose" /> : null}
          {status ? <Pill label={status.label} tone={status.tone} dot /> : null}
        </View>
        <T v="callout" numberOfLines={2} style={{ fontSize: 16 }}>{title}</T>
        <T v="meta" color={c.ink3} numberOfLines={1}>{when}{where ? ` · ${where}` : ""}</T>
      </Pressable>
    </View>
  );
}

function myLine(eventId: number, mine: Mine): { label: string; tone: Tone } {
  if (mine.attended.has(eventId)) return { label: "Here", tone: "mint" };
  const x = mine.excuses.get(eventId);
  if (x?.status === "approved") return { label: "Excused", tone: "butter" };
  if (x?.status === "pending") return { label: "Excuse waiting", tone: "sky" };
  return { label: "Missed", tone: "peach" };
}

/** The "Earlier" bar above today: shows or hides the past months. */
export function EarlierBar({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.select(); onToggle(); }} accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? "Hide earlier events" : `Show ${count} earlier`}
      style={({ pressed }) => [styles.earlier, { borderColor: c.line2, opacity: pressed ? 0.7 : 1 }]}>
      <T v="pill" color={c.ink2}>{open ? "Hide earlier" : `Earlier · ${count}`}</T>
    </Pressable>
  );
}

const DATE_W = 40, NODE_W = 22;
const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingTop: 6, paddingBottom: 8 },
  headRule: { position: "absolute", left: 0, right: 0, bottom: 0, height: 1.5 },
  body: { gap: 10, paddingBottom: 6 },
  spine: { position: "absolute", left: DATE_W + NODE_W / 2 - 0.75, top: 0, bottom: 0, width: 1.5 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  date: { width: DATE_W, alignItems: "flex-start", paddingTop: 10 },
  nodeCol: { width: NODE_W, alignItems: "center", paddingTop: 18 },
  node: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  diamond: { width: 11, height: 11, borderWidth: 2, transform: [{ rotate: "45deg" }] },
  card: { flex: 1, marginLeft: 8, gap: 3, paddingVertical: 11, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1.5 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  today: { flexDirection: "row", alignItems: "center", height: 28, marginBottom: 4 },
  todayTag: { width: DATE_W - 4, alignItems: "center", paddingVertical: 2, borderRadius: 6 },
  todayDot: { marginLeft: 4 + NODE_W / 2 - 7, width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  todayRule: { flex: 1, height: 1.5, marginLeft: 6 },
  earlier: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed" },
});
