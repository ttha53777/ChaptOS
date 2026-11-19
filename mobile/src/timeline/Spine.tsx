/**
 * The timeline spine (mock `tlx-*`): a month head per month (sticks under the bar as you
 * scroll; ../app/(tabs)/timeline passes their indices to Screen), then that month's rows on
 * a ruled spine. Each row: a date column (only on a day's first row), a node on the spine
 * (a dot in the category's ink; a diamond for a deadline), and a card with the category,
 * the title, when and where, a Required tag, and for a past required event my own line
 * (Here / Excused / Excuse waiting / Missed).
 *
 * The next event (the first one from today on) is inked: its card takes the ink border and
 * a hard offset shadow in its category's pastel, and its node a pastel halo. Past rows fade
 * their card and date, never their node, so the spine doesn't show through it.
 *
 * Motion:
 *   arrive   rows rise 10pt and fade in, 35ms apart (the first ten; the rest land with
 *            the tenth), DUR.move on the out curve. Reduced: a fade, no rise, no stagger
 *   press    the card sinks 1pt and shrinks 1.5% (80ms in, a 240ms spring back), and an
 *            inked card's shadow tucks under it. Reduced: a quick dim instead
 *   leave    a row that drops off (a ticked deadline) fades out, and the rest close up
 *            with a DUR.move layout transition. Reduced: cross-fade only, no glide
 */
import type { CalEventType, MyExcuseItem } from "@/lib/api-types";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { DUR, EASE } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { Pill } from "~/paper/bits";
import { alpha, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { daysFrom, dayStart } from "~/today/time";
import { T } from "~/ui/T";
import { inkOf, labelOf, toneOf, whenLabel, type Month, type Row } from "./model";

export interface Mine { attended: Set<number>; excuses: Map<number, MyExcuseItem> }

const STAGGER = 35, STAGGER_MAX = 10;

export function MonthHead({ month, past }: { month: Month; past: boolean }) {
  const { c } = useTheme();
  const events = month.rows.filter(r => r.kind === "event").length;
  const due = month.rows.length - events;
  const count = [events ? `${events} event${events === 1 ? "" : "s"}` : null, due ? `${due} due` : null].filter(Boolean).join(" · ");
  return (
    <View style={[styles.head, { backgroundColor: c.paper }]} accessibilityRole="header" accessibilityLabel={`${month.label} ${month.year}, ${count}`}>
      <T v="heading" color={past ? c.ink3 : c.ink}>{month.label}</T>
      <T v="mono" color={c.ink3} style={{ fontSize: 11, flex: 1 }}>{month.year}</T>
      <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{count}</T>
      <View style={[styles.headRule, { backgroundColor: past ? c.line : c.line2 }]} />
    </View>
  );
}

export function MonthBody({ month, today, types, mine, todayKey, nextKey, start = 0, onOpen, onLayout, onTodayLayout }: {
  month: Month; today: string; types: CalEventType[] | undefined; mine: Mine;
  /** The row the Today marker goes in front of; "end" = after this month's last row. */
  todayKey: string | null;
  /** The next event's row: inked. */
  nextKey?: string | null;
  /** Rows above this month, for the arrival stagger. */
  start?: number;
  onOpen: (r: Row) => void; onLayout?: (e: LayoutChangeEvent) => void; onTodayLayout?: (y: number) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  // Driven by the app's own reduced-motion setting (Lab can force it), not the system's.
  const layout = m.reduced ? undefined : LinearTransition.duration(m.t(DUR.move)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
  const exit = FadeOut.duration(m.t(DUR.fade)).reduceMotion(ReduceMotion.Never);
  const cfg = m.timing(m.reduced ? DUR.fade : DUR.move, "out");
  const rise = m.reduced ? 0 : 10;
  const arrive = (i: number) => {
    const delay = m.reduced ? 0 : m.t(Math.min(start + i, STAGGER_MAX) * STAGGER);
    return () => {
      "worklet";
      return {
        initialValues: { opacity: 0, transform: [{ translateY: rise }] },
        animations: { opacity: withDelay(delay, withTiming(1, cfg)), transform: [{ translateY: withDelay(delay, withTiming(0, cfg)) }] },
      };
    };
  };
  return (
    <View onLayout={onLayout} style={styles.body}>
      <Animated.View entering={FadeIn.duration(m.t(DUR.move)).reduceMotion(ReduceMotion.Never)} style={[styles.spine, { backgroundColor: c.line2 }]} />
      {month.rows.map((r, i) => {
        const firstOfDay = i === 0 || month.rows[i - 1]!.date !== r.date;
        return (
          <Animated.View key={r.key} layout={layout} entering={arrive(i)} exiting={exit}>
            {todayKey === r.key ? <TodayMarker onLayout={onTodayLayout} /> : null}
            <RowView row={r} today={today} types={types} mine={mine} firstOfDay={firstOfDay} next={r.key === nextKey} onOpen={onOpen} />
          </Animated.View>
        );
      })}
      {todayKey === "end" ? (
        <Animated.View entering={arrive(month.rows.length)}><TodayMarker onLayout={onTodayLayout} last /></Animated.View>
      ) : null}
    </View>
  );
}

function TodayMarker({ onLayout, last }: { onLayout?: (y: number) => void; last?: boolean }) {
  const { c } = useTheme();
  const ink = c.pastel.rose.ink;
  return (
    <View onLayout={e => onLayout?.(e.nativeEvent.layout.y)} style={styles.todayWrap} accessibilityRole="text" accessibilityLabel={last ? "Today. Nothing after this." : "Today"}>
      <View style={styles.today}>
        <View style={[styles.todayTag, { backgroundColor: ink }]}><T v="label" color={c.card} style={{ fontSize: 9.5 }}>Today</T></View>
        <View style={[styles.todayDot, { backgroundColor: ink, borderColor: c.paper }]} />
        <View style={[styles.todayRule, { backgroundColor: alpha(ink, 0.5) }]} />
      </View>
      {last ? <T v="meta" color={c.ink3} style={styles.todayNote}>Nothing else on the calendar.</T> : null}
    </View>
  );
}

function RowView({ row, today, types, mine, firstOfDay, next, onOpen }: {
  row: Row; today: string; types: CalEventType[] | undefined; mine: Mine; firstOfDay: boolean; next: boolean; onOpen: (r: Row) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);
  const slug = row.kind === "event" ? row.event.category : "deadline";
  const ink = inkOf(slug, c);
  const fill = c.note.fill[toneOf(slug)];
  const n = daysFrom(today, row.date);
  const past = n < 0;
  const d = dayStart(row.date);
  const title = row.kind === "event" ? row.event.title : row.task.title;
  const where = row.kind === "event" ? row.event.location : null;
  const status = row.kind === "event" && row.event.mandatory && past ? myLine(row.event.id, mine) : null;
  const when = whenLabel(row, today);
  const deadline = row.kind === "deadline";

  const card = useAnimatedStyle(() => (m.reduced
    ? { opacity: (past ? 0.62 : 1) * (1 - 0.18 * press.value) }
    : { opacity: past ? 0.62 : 1, transform: [{ translateX: press.value }, { translateY: press.value }, { scale: 1 - 0.015 * press.value }] }));
  // the inked card's shadow is its own layer, so a press can tuck it under (transform only)
  const shadow = useAnimatedStyle(() => ({ transform: [{ translateX: 3 - 2 * press.value }, { translateY: 3 - 2 * press.value }] }));

  return (
    <View style={styles.row}>
      <View style={styles.date} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {firstOfDay ? (
          <>
            <T v="mono" color={n === 0 ? c.pastel.rose.ink : c.ink3} style={{ fontSize: 10 }}>{d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}</T>
            <T v="title" color={n === 0 ? c.pastel.rose.ink : past ? c.ink3 : c.ink} style={{ fontSize: 22, lineHeight: 26 }}>{d.getDate()}</T>
          </>
        ) : null}
      </View>
      <View style={styles.nodeCol}>
        {next ? <View style={[styles.halo, { backgroundColor: fill }]} /> : null}
        {deadline
          ? <View style={[styles.diamond, { borderColor: ink, backgroundColor: past ? c.paper : c.card }]} />
          : <View style={[styles.node, { backgroundColor: past ? c.paper : ink, borderColor: past ? c.line2 : ink }]} />}
      </View>
      <View style={styles.cardCol}>
        {next ? <Animated.View style={[StyleSheet.absoluteFill, styles.cardShape, { backgroundColor: fill }, shadow]} /> : null}
        <Animated.View style={card}>
          <Pressable onPress={() => { haptics.select(); onOpen(row); }}
            onPressIn={() => { press.value = withTiming(1, m.timing(80, "out")); }}
            onPressOut={() => { press.value = withTiming(0, m.timing(m.reduced ? 120 : 240, "spring")); }}
            accessibilityRole="button"
            accessibilityLabel={`${next ? "Next up. " : ""}${title}. ${labelOf(slug, types)}. ${when}${where ? `, ${where}` : ""}${row.kind === "event" && row.event.mandatory ? ". Required" : ""}${status ? `. ${status.label}` : ""}`}
            style={[styles.card, styles.cardShape, {
              backgroundColor: c.card,
              borderColor: next ? c.ink : deadline ? alpha(ink, 0.6) : c.line,
              borderStyle: deadline && !next ? "dashed" : "solid",
            }]}>
            <View style={styles.cardTop}>
              <View style={[styles.catDot, { backgroundColor: ink }]} />
              <T v="label" color={ink} style={{ fontSize: 9.5, flex: 1 }} numberOfLines={1}>{next ? `${labelOf(slug, types)} · next up` : labelOf(slug, types)}</T>
              {row.kind === "event" && row.event.mandatory && !past ? <Pill label="Required" tone="rose" /> : null}
              {status ? <Pill label={status.label} tone={status.tone} dot /> : null}
            </View>
            <T v="callout" numberOfLines={2} style={{ fontSize: 16 }}>{title}</T>
            <T v="meta" color={c.ink3} numberOfLines={1}>{when}{where ? ` · ${where}` : ""}</T>
          </Pressable>
        </Animated.View>
      </View>
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
      accessibilityLabel={open ? "Hide earlier events" : `Show ${count} earlier`} hitSlop={6}
      style={({ pressed }) => [styles.earlier, { borderColor: pressed ? c.ink3 : c.line2, backgroundColor: pressed ? c.paper2 : "transparent" }]}>
      <T v="pill" color={c.ink2}>{open ? "Hide earlier" : `Earlier · ${count}`}</T>
    </Pressable>
  );
}

/** Nothing from today on (the past is behind Earlier): the Today marker, alone, with a line. */
export function NothingAhead() {
  const { c } = useTheme();
  const m = useMotion();
  return (
    <Animated.View entering={FadeIn.duration(m.t(DUR.move)).reduceMotion(ReduceMotion.Never)} style={{ gap: 6 }}>
      <TodayMarker />
      <T v="meta" color={c.ink3} style={styles.todayNote}>Nothing coming up. When officers add an event or a dated task, it lands here.</T>
    </Animated.View>
  );
}

const DATE_W = 40, NODE_W = 22, CARD_GAP = 8;
// A card's first line is 22pt tall (the height of a Pill), so the node and the weekday
// line up with it whether or not a Required / status pill is there.
const CARD_PAD = 11, BORDER = 1.5, TOP_LINE = 22;
const LINE_MID = BORDER + CARD_PAD + TOP_LINE / 2; // 23.5
const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingTop: 8, paddingBottom: 9 },
  headRule: { position: "absolute", left: 0, right: 0, bottom: 0, height: 1.5 },
  body: { gap: 12, paddingTop: 4, paddingBottom: 8 },
  spine: { position: "absolute", left: DATE_W + NODE_W / 2 - 0.75, top: 0, bottom: 0, width: 1.5 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  date: { width: DATE_W, alignItems: "flex-start", paddingTop: LINE_MID - 8.5 },
  nodeCol: { width: NODE_W, alignItems: "center", paddingTop: LINE_MID - 5.5 },
  node: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  diamond: { width: 10, height: 10, borderWidth: 2, borderRadius: 1.5, transform: [{ rotate: "45deg" }] },
  halo: { position: "absolute", top: LINE_MID - 10, width: 20, height: 20, borderRadius: 10 },
  cardCol: { flex: 1, marginLeft: CARD_GAP },
  cardShape: { borderRadius: 16 },
  card: { gap: 3, paddingVertical: CARD_PAD, paddingHorizontal: 13, borderWidth: BORDER },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: TOP_LINE },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  todayWrap: { marginBottom: 6 },
  today: { flexDirection: "row", alignItems: "center", height: 28 },
  todayTag: { width: DATE_W - 4, alignItems: "center", paddingVertical: 2, borderRadius: 6 },
  todayDot: { marginLeft: 4 + NODE_W / 2 - 7, width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  todayRule: { flex: 1, height: 1.5, marginLeft: 6 },
  todayNote: { marginLeft: DATE_W + NODE_W + CARD_GAP },
  earlier: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed" },
});
