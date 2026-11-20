/**
 * The Timeline's line on a phone (app/org/[slug]/timeline/page.tsx, paper-aesthetic.css
 * `.tl-*`, timeline-ledger.css ≤640px), piece by piece:
 *
 *   FilterSeg     All · Required · Deadlines · Parties · Service, each with its count
 *   LegendButton  the type dots and "REQ Attendance taken", in a small sheet
 *   ViewSwitch    Timeline / Calendar, an ink thumb that slides between them
 *   ReviewBand    "N excuses awaiting review" (MANAGE_ATTENDANCE) → Review
 *   PastBar       "Earlier · N events · N overdue · Show ▾", and the folded-month bar
 *   TodayMarker   the ink pill and the peach line
 *   MonthHead     "November 2026 ---- 14 left · 2 required ▴", the current month on a
 *                 sky highlighter; tap to fold
 *   Spine / Row   date stub · node on the rail · card (title, category, Required,
 *                 Overdue, ✓ Done, time, place, who it's on). Today's rows are inked with
 *                 the category's hard shadow; past rows go dashed and quiet; an unticked
 *                 past deadline keeps its weight on a peach wash.
 *   EndLine       "Nothing scheduled past Dec 13. Add event →"
 *
 * Motion: rows rise in 8pt as a month opens (staggered 30ms, capped); a fold closes up
 * with a layout transition. A just-added event lands: its card pops from .96 and its
 * category wash fades out. Reduced: fades only. No haptics here: these are navigation.
 */
import type { CalEventType, CalendarEvent } from "@/lib/api-types";
import { LAYERS, dowOf, shortDate, type CalLayer, type MonthGroup } from "@/lib/timeline/rows";
import { memo, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeIn, FadeOut, Keyframe, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { catOf, timeText } from "~/dash/UpNextCard";
import { Icon } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { Sheet } from "~/shell/sheets";
import { alpha } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { pressedDim } from "~/motion/press";

export const typeOf = (types: CalEventType[] | undefined, slug: string) => types?.find(t => t.slug === slug);
export const catLabel = (types: CalEventType[] | undefined, slug: string) => typeOf(types, slug)?.label ?? slug;

/* ── controls ─────────────────────────────────────────────────────────────────── */

export function FilterSeg({ value, counts, onChange }: { value: CalLayer; counts: Record<CalLayer, number>; onChange: (l: CalLayer) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.segScroll, { backgroundColor: c.paper2, borderColor: c.line }]}>
    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false}>
    <View style={styles.seg} accessibilityRole="tablist" accessibilityLabel="Filter events">
      {LAYERS.map(l => {
        const on = l.id === value;
        return (
          <Pressable key={l.id} accessibilityRole="tab" accessibilityState={{ selected: on }}
            onPress={() => { if (!on) { haptics.select(); onChange(l.id); } }}
            style={[styles.segBtn, on && { backgroundColor: c.card, boxShadow: c.sh1 }]}>
            <T v="callout" size={13} color={on ? c.ink : c.ink3} style={{ fontWeight: on ? "600" : "500" }}>{l.label}</T>
            <T v="mono" size={11} color={on ? c.ink : c.ink3} style={{ opacity: 0.7 }}>{counts[l.id]}</T>
          </Pressable>
        );
      })}
    </View>
    </ScrollView>
    </View>
  );
}

export function LegendButton({ types, workflows }: { types: CalEventType[] | undefined; workflows: string[] }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  // Not hidden, and its workflow (if any) on. Includes deadline: it's on the line too.
  const shown = (types ?? []).filter(t => !t.hidden && (t.workflowId == null || workflows.includes(t.workflowId))).sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Category legend"
        style={({ pressed }) => [styles.legendBtn, { borderColor: c.line2, backgroundColor: c.card, opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.info, { borderColor: c.ink2 }]}><T v="mono" size={9} color={c.ink2} style={{ fontWeight: "700", lineHeight: 11 }}>i</T></View>
        <T v="callout" size={13} color={c.ink2} style={{ fontWeight: "500" }}>Legend</T>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} size="fit" title="Legend" kicker="Timeline" tone="lilac" icon="timeline">
        <View style={styles.legendGrid}>
          {shown.map(t => {
            const cat = catOf(t.slug, t, c);
            return (
              <View key={t.slug} style={styles.legendItem}>
                <View style={[styles.dot7, { backgroundColor: cat.ink, width: 10, height: 10, borderRadius: 5 }]} />
                <T v="callout" color={c.ink}>{t.label}</T>
              </View>
            );
          })}
          <View style={styles.legendItem}>
            <View style={[styles.reqKey, { backgroundColor: c.ink }]}><T v="mono" size={9} color={c.paper} style={{ fontWeight: "700", letterSpacing: 0.8 }}>REQ</T></View>
            <T v="callout" color={c.ink}>Attendance taken</T>
          </View>
        </View>
      </Sheet>
    </>
  );
}

export type TimelineView = "timeline" | "calendar";

export function ViewSwitch({ value, onChange }: { value: TimelineView; onChange: (v: TimelineView) => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const [w, setW] = useState<{ timeline: number; calendar: number }>({ timeline: 0, calendar: 0 });
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  useEffect(() => {
    if (!w.timeline) return;
    const to = value === "timeline" ? 0 : w.timeline;
    const tw = value === "timeline" ? w.timeline : w.calendar;
    const cfg = m.reduced ? { duration: 0 } : undefined;
    x.value = cfg ? to : withSpring(to, m.spring("settle"));
    width.value = cfg ? tw : withSpring(tw, m.spring("settle"));
  }, [value, w]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumb = useAnimatedStyle(() => ({ width: width.value, transform: [{ translateX: x.value }] }));
  const opt = (v: TimelineView, label: string) => {
    const on = value === v;
    return (
      <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: on }}
        onLayout={(e: LayoutChangeEvent) => { const lw = e.nativeEvent.layout.width; setW(p => (p[v] === lw ? p : { ...p, [v]: lw })); }}
        onPress={() => { if (!on) { haptics.select(); onChange(v); } }} style={styles.viewBtn}>
        <Icon name={v === "timeline" ? "timeline" : "cal"} size={14} color={on ? c.paper : c.ink2} />
        <T v="callout" size={13} color={on ? c.paper : c.ink2} style={{ fontWeight: "600" }}>{label}</T>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="View" style={[styles.view, { backgroundColor: c.paper2, borderColor: c.line }]}>
      <Animated.View style={[styles.thumb, { backgroundColor: c.ink }, hard(c.pastel.lilac.fill, 2.5), thumb]} />
      <View style={{ flexDirection: "row" }}>
        {opt("timeline", "Timeline")}
        {opt("calendar", "Calendar")}
      </View>
    </View>
  );
}

function AddBtn({ icon, label, kind, onPress, shadow }: { icon: "cal" | "plus"; label: string; kind: "ghost" | "outline" | "ink"; onPress: () => void; shadow?: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => [
        styles.add,
        kind === "ghost" && { borderColor: c.line2, backgroundColor: c.card },
        kind === "outline" && { borderColor: c.ink, backgroundColor: c.card },
        kind === "ink" && { borderColor: c.ink, backgroundColor: c.ink },
        shadow ? hard(shadow, 3) : null,
        pressed && { transform: [{ translateX: 1 }, { translateY: 1 }], boxShadow: "none" },
      ]}>
      <Icon name={icon} size={15} color={kind === "ink" ? c.paper : kind === "ghost" ? c.ink2 : c.ink} />
      <T v="button" size={14} color={kind === "ink" ? c.paper : c.ink}>{label}</T>
    </Pressable>
  );
}

/** "Add to my calendar" · "Add Deadline" · "Add Event", each only when it's a real capability. */
export function AddButtons({ onCalendar, onDeadline, onEvent }: { onCalendar: () => void; onDeadline?: () => void; onEvent?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.adds}>
      <AddBtn icon="cal" label="Add to my calendar" kind="ghost" onPress={onCalendar} />
      {onDeadline ? <AddBtn icon="plus" label="Add Deadline" kind="outline" onPress={onDeadline} shadow={c.pastel.peach.fill} /> : null}
      {onEvent ? <AddBtn icon="plus" label="Add Event" kind="ink" onPress={onEvent} shadow={c.pastel.lilac.fill} /> : null}
    </View>
  );
}

/** The officer's review band: butter, taped, "N excuse(s) awaiting review", Review. */
export function ReviewBand({ count, onReview }: { count: number; onReview: () => void }) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(260).reduceMotion(ReduceMotion.System)}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${count} excuse${count === 1 ? "" : "s"} awaiting review. Review`} onPress={onReview}
        style={({ pressed }) => [styles.review, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border, opacity: pressed ? 0.85 : 1 }]}>
        <View style={[styles.tape, { backgroundColor: alpha(c.card, 0.75), borderColor: c.line }]} />
        <Icon name="alert" size={16} color={c.pastel.butter.ink} />
        <T v="bodyStrong" size={15.5} color={c.pastel.butter.ink} style={{ flex: 1 }}>{`${count} excuse${count === 1 ? "" : "s"} awaiting review`}</T>
        <T v="callout" color={c.ink} style={{ fontWeight: "600" }}>Review</T>
      </Pressable>
    </Animated.View>
  );
}

/* ── the line ─────────────────────────────────────────────────────────────────── */

export function PastBar({ label, count, overdue, open, ahead, onPress }: { label: string; count: string; overdue?: number; open: boolean; ahead?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress}
      style={({ pressed }) => [styles.past, { borderColor: c.line2, backgroundColor: pressed ? c.paper2 : "transparent" }, ahead && { marginTop: 14 }]}>
      <T v="bodyStrong" size={15.5} color={c.ink}>{label}</T>
      <T v="body" size={15} color={c.ink3}>{count}</T>
      {overdue ? (
        <View style={[styles.overdue, { backgroundColor: c.pastel.peach.soft, borderColor: c.pastel.peach.border }]}>
          <T v="callout" size={13.5} color={c.pastel.peach.ink} style={{ fontWeight: "600" }}>{`${overdue} overdue`}</T>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <T v="mono" size={11.5} color={c.ink3}>{open ? "Hide ▴" : "Show ▾"}</T>
    </Pressable>
  );
}

export function TodayMarker({ today, onLayout }: { today: string; onLayout?: (e: LayoutChangeEvent) => void }) {
  const { c } = useTheme();
  const label = `Today · ${dowOf(today)} ${shortDate(today).toUpperCase()}`;
  return (
    <View style={styles.todayRow} onLayout={onLayout} accessibilityRole="header" accessibilityLabel={label}>
      <View style={[styles.todayPill, { backgroundColor: c.ink, borderColor: c.ink }, hard(c.pastel.peach.fill, 2.5)]}>
        <T v="mono" size={11.5} color={c.paper} style={{ letterSpacing: 0.9 }}>{label.toUpperCase()}</T>
      </View>
      <View style={[styles.todayLine, { backgroundColor: c.pastel.peach.ink }]} />
    </View>
  );
}

export function MonthHead({ group, past, open, onToggle }: { group: MonthGroup; past?: boolean; open?: boolean; onToggle?: () => void }) {
  const { c } = useTheme();
  const count = group.events.length;
  const required = group.events.filter(e => e.mandatory).length;
  const cnt = past ? `${count} event${count === 1 ? "" : "s"}`
    : `${count} ${group.isCurrentMonth ? "left" : `event${count === 1 ? "" : "s"}`}${required > 0 ? ` · ${required} required` : ""}`;
  const body = (
    <>
      <View style={styles.monthTitle}>
        <View>
          {group.isCurrentMonth && !past ? <View style={[styles.monthMark, { backgroundColor: c.pastel.sky.fill, opacity: c.markOp }]} /> : null}
          <T v="hero" size={25} ls={-0.03} lh={1.1} color={past ? c.ink2 : c.ink}>{group.monthLabel}</T>
        </View>
        <T v="mono" size={11.5} color={c.ink3} style={{ marginLeft: 8, marginBottom: 3 }}>{group.year}</T>
      </View>
      <View style={[styles.rule, { borderTopColor: c.line2 }]} />
      <T v="mono" size={11.5} color={c.ink3}>{cnt}</T>
      {!past ? <T v="mono" size={11} color={c.ink3}>{open ? "▴" : "▾"}</T> : null}
    </>
  );
  if (past || !onToggle) return <View style={styles.month} accessibilityRole="header">{body}</View>;
  return (
    <Pressable style={styles.month} accessibilityRole="button" accessibilityState={{ expanded: !!open }}
      accessibilityLabel={`${group.monthLabel} ${group.year}, ${cnt}`} onPress={onToggle}>{body}</Pressable>
  );
}


/** One month's rows on the rail. */
/**
 * One month's line. Memoized, as is each Row: opening an event (or any other state
 * change on the Timeline) must not re-render every card under the sheet that's sliding
 * up. So everything passed in is stable: the maps come from the memoized rows, the
 * callbacks are the screen's useCallbacks, and `block` names the month for the layout
 * callbacks instead of a fresh closure per month.
 */
export const Spine = memo(function Spine({ block, events, types, today, past, doneById, ownerById, landed, tearing, onOpen, onRowLayout, onLayoutY }: {
  block: string; events: CalendarEvent[]; types: CalEventType[] | undefined; today: string; past?: boolean;
  doneById?: ReadonlyMap<number, boolean>; ownerById?: ReadonlyMap<number, string>; landed?: number | null;
  /** The row being deleted: it tears off (tilts, drops, fades) as it leaves. */
  tearing?: number | null;
  onOpen: (e: CalendarEvent) => void; onRowLayout?: (block: string, id: number, y: number) => void; onLayoutY?: (block: string, y: number) => void;
}) {
  const { c } = useTheme();
  return (
    <Animated.View style={styles.spine} layout={LinearTransition.duration(260).reduceMotion(ReduceMotion.System)}
      onLayout={onLayoutY ? (e: LayoutChangeEvent) => onLayoutY(block, e.nativeEvent.layout.y) : undefined}>
      <View style={[styles.rail, { backgroundColor: c.line }]} />
      {events.map((e, i) => (
        <Row key={e.id} block={block} event={e} types={types} today={today} past={!!past} i={i}
          done={doneById?.get(e.id)} owner={ownerById?.get(e.id)} landed={landed === e.id} torn={tearing === e.id}
          onOpen={onOpen} onLayout={onRowLayout} />
      ))}
    </Animated.View>
  );
});

/** The tear: the card tilts, drops 22pt and fades as its slot closes. Reduced: a fade. */
const TEAR = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }, { rotate: "0deg" }] },
  35: { opacity: 1, transform: [{ translateY: -3 }, { rotate: "1.5deg" }] },
  100: { opacity: 0, transform: [{ translateY: 22 }, { rotate: "-5deg" }] },
});

const Row = memo(function Row({ block, event, types, today, past, done, owner, i, landed, torn, onOpen, onLayout }: {
  block: string; event: CalendarEvent; types: CalEventType[] | undefined; today: string; past: boolean; done?: boolean; owner?: string;
  i: number; landed: boolean; torn: boolean; onOpen: (e: CalendarEvent) => void; onLayout?: (block: string, id: number, y: number) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const cat = catOf(event.category, typeOf(types, event.category), c);
  const overdue = past && done === false;
  const isToday = !past && event.date === today;
  const quiet = past && !overdue;
  const time = timeText(event);
  const label = catLabel(types, event.category);

  // A just-added event lands: pop from .96 and its wash fades.
  const pop = useSharedValue(1);
  const wash = useSharedValue(0);
  useEffect(() => {
    if (!landed) return;
    wash.value = withSequence(withTiming(1, { duration: m.t(120) }), withDelay(m.t(900), withTiming(0, { duration: m.t(700) })));
    if (!m.reduced) pop.value = withSequence(withTiming(0.96, { duration: m.t(90) }), withSpring(1, m.spring("pop")));
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value }));

  const enter = FadeIn.duration(m.t(260)).delay(m.t(Math.min(i, 8) * 30)).reduceMotion(ReduceMotion.System);
  const a11y = [event.title, label, event.mandatory ? "Required" : null, overdue ? "Overdue" : null, done ? "Done" : null, `${dowOf(event.date)} ${shortDate(event.date)}`, time, event.location, owner].filter(Boolean).join(", ");

  return (
    <Animated.View entering={enter} exiting={torn ? (m.reduced ? FadeOut.duration(200) : TEAR.duration(m.t(360))) : undefined}
      onLayout={onLayout ? (e: LayoutChangeEvent) => onLayout(block, event.id, e.nativeEvent.layout.y) : undefined}>
      <Pressable onPress={() => onOpen(event)} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => [styles.row, pressed && pressedDim]}>
        {({ pressed }) => (
          <>
            <View style={[styles.date, quiet && { opacity: 0.55 }]}>
              <T v="mono" size={10} color={c.ink3} style={{ fontWeight: "600", letterSpacing: 0.8 }}>{dowOf(event.date)}</T>
              <T v="hero" size={21} ls={-0.03} lh={1.05} color={c.ink}>{Number(event.date.slice(8, 10))}</T>
            </View>
            <View style={[styles.node, quiet && { opacity: 0.55 }]}>
              <View style={[styles.dot, { borderColor: cat.ink, backgroundColor: isToday ? cat.ink : c.card, boxShadow: `0 0 0 4px ${c.paper}` }, isToday && { transform: [{ scale: 1.15 }] }]} />
            </View>
            <Animated.View style={[styles.card,
              { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 },
              quiet && { backgroundColor: "transparent", borderStyle: "dashed", boxShadow: "none" },
              overdue && { borderColor: c.pastel.peach.border, backgroundColor: c.pastel.peach.soft },
              isToday && { borderColor: c.ink, ...hard(cat.fill, 3) },
              pressed && { transform: [{ translateX: 3 }], borderColor: isToday ? c.ink : c.line2 },
              popStyle]}>
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: cat.soft, borderRadius: 15 }, washStyle]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="bodyStrong" size={15.5} numberOfLines={1} color={quiet ? c.ink2 : c.ink}
                  style={done ? { textDecorationLine: "line-through", textDecorationColor: c.line2 } : undefined}>{event.title}</T>
                <View style={styles.meta}>
                  <View style={styles.catTag}>
                    <View style={[styles.dot7, { backgroundColor: cat.ink }]} />
                    <T v="meta" size={12.5} color={cat.ink} style={{ fontWeight: "600" }}>{label}</T>
                  </View>
                  {event.mandatory ? <Req /> : null}
                  {overdue ? <T v="meta" size={12.5} color={c.pastel.peach.ink} style={{ fontWeight: "700" }}>Overdue</T> : null}
                  {done ? <T v="meta" size={12.5} color={c.pastel.mint.ink} style={{ fontWeight: "700" }}>✓ Done</T> : null}
                  {time ? <T v="meta" size={12.5} color={c.ink3}>{time}</T> : null}
                  {event.location ? <T v="meta" size={12.5} color={c.ink3} numberOfLines={1}>{event.location}</T> : null}
                  {owner ? <T v="meta" size={12.5} color={c.ink3}>{owner}</T> : null}
                </View>
              </View>
              <Icon name="chev-r" size={15} color={c.ink3} />
            </Animated.View>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
});

export function Req() {
  const { c } = useTheme();
  return (
    <View style={[styles.req, { borderColor: c.ink3 }]}>
      <T v="mono" size={9} color={c.ink2} style={{ fontWeight: "700", letterSpacing: 1.1 }}>REQUIRED</T>
    </View>
  );
}

export function EndLine({ last, onAdd }: { last: string; onAdd?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.end}>
      <View style={[styles.endDot, { borderColor: c.line2 }]} />
      <T v="callout" size={14} color={c.ink3}>{`Nothing scheduled past ${shortDate(last)}.`}</T>
      {onAdd ? (
        <Pressable onPress={onAdd} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [[styles.endAdd, { borderBottomColor: c.ink2 }], pressed && pressedDim]}>
          <T v="callout" size={14} color={c.ink} style={{ fontWeight: "600" }}>Add event →</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "No events on this filter." and, off All, "Show all events". */
export function FilterEmpty({ onAll }: { onAll?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 64, gap: 14 }}>
      <T v="body" size={16} color={c.ink3} style={{ fontStyle: "italic" }}>No events on this filter.</T>
      {onAll ? (
        <Pressable onPress={onAll} accessibilityRole="button" style={({ pressed }) => [[styles.legendBtn, { borderColor: c.line2, backgroundColor: c.card }], pressed && pressedDim]}>
          <T v="callout" color={c.ink} style={{ fontWeight: "600" }}>Show all events</T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Block({ children, gap = 0 }: { children: ReactNode; gap?: number }) {
  return <Animated.View layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)} style={{ gap }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  segScroll: { borderRadius: 999, borderWidth: 1.5, overflow: "hidden" },
  seg: { flexDirection: "row", gap: 3, padding: 3 },
  segBtn: { flexDirection: "row", alignItems: "baseline", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  legendBtn: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5 },
  info: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  legendItem: { width: "50%", flexDirection: "row", alignItems: "center", gap: 10 },
  reqKey: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  view: { borderRadius: 999, borderWidth: 1.5, padding: 4, alignSelf: "flex-start" },
  thumb: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 999 },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 16 },
  adds: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  add: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5 },
  review: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5 },
  tape: { position: "absolute", top: -8, left: 36, width: 50, height: 16, borderWidth: 1, borderStyle: "dashed", transform: [{ rotate: "-2deg" }] },
  past: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed" },
  overdue: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1 },
  todayRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18, marginBottom: 6 },
  todayPill: { paddingVertical: 5, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  todayLine: { flex: 1, height: 2, borderRadius: 2 },
  month: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22, marginBottom: 8 },
  monthTitle: { flexDirection: "row", alignItems: "flex-end" },
  monthMark: { position: "absolute", left: -3, right: -3, bottom: 2, height: "46%", borderTopLeftRadius: 10, borderTopRightRadius: 14, borderBottomLeftRadius: 9, borderBottomRightRadius: 15, transform: [{ rotate: "-0.8deg" }] },
  rule: { flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: "dashed", marginTop: 4 },
  spine: { position: "relative" },
  rail: { position: "absolute", left: 73, top: 6, bottom: 6, width: 2, borderRadius: 2 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  date: { width: 56, paddingRight: 6, alignItems: "flex-end" },
  node: { width: 36, alignSelf: "stretch", alignItems: "center", justifyContent: "center", zIndex: 1 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
  card: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, overflow: "hidden" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 4, marginTop: 3 },
  catTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot7: { width: 7, height: 7, borderRadius: 4 },
  req: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, borderWidth: 1.5 },
  end: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 24 },
  endDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderStyle: "dashed" },
  endAdd: { borderBottomWidth: 1.5, paddingBottom: 1 },
});
