/**
 * Timeline (U4): every calendar event plus every open dated task folded in as a deadline,
 * by month, soonest first, with past months folded behind an "Earlier" bar. Month heads
 * stick under the bar. A Today marker sits in front of the first row from today on; when
 * it's scrolled out of view a "Today" pill jumps back to it. The calendar button in the bar
 * opens "Add to your calendar" (the chapter's feed).
 *
 * Reads GET /api/calendar, /api/calendar/event-types, /api/tasks (the dated ones),
 * /api/attendance/mine and /api/excuses/mine (my line on past required events), and names
 * from /api/brothers. The sheet (~/timeline/EventSheet) adds the per-event reads and holds
 * the writes: claim a supply, file an excuse, tick an action item, tick a deadline.
 *
 * States: first load = skeleton rows; nothing loaded and an error = ErrorState; offline or a
 * failed refresh over last-known data = StaleNote; a chapter with no events and no dated
 * tasks = the day-one empty (no button: members can't add events).
 */
import type { LayoutChangeEvent } from "react-native";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useCalendar, useEventTypes, useMyAttendance, useMyExcuses } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useRoster, useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { useChrome } from "~/shell/chrome";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { viewerOf } from "~/tasks/model";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { EventSheet, SubscribeSheet } from "~/timeline/EventSheet";
import { buildRows, byMonth, type Row } from "~/timeline/model";
import { EarlierBar, MonthBody, MonthHead, type Mine } from "~/timeline/Spine";
import { T } from "~/ui/T";

export default function Timeline() {
  const entry = useEntryOf("ready");
  const cal = useCalendar();
  const types = useEventTypes();
  const tasks = useTasks();
  const att = useMyAttendance();
  const excuses = useMyExcuses();
  const roster = useRoster();
  const today = localDay();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [feed, setFeed] = useState(false);
  const [earlier, setEarlier] = useState(false);

  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useSharedValue(0);
  const todayY = useSharedValue(-1);
  const bodyY = useRef(new Map<string, number>());
  const markerIn = useRef<{ month: string; y: number } | null>(null);

  const viewer = useMemo(() => (entry ? viewerOf(entry.me) : null), [entry]);
  const people = useMemo(() => new Map((roster.data ?? []).map(b => [b.id, b] as const)), [roster.data]);
  const mine: Mine = useMemo(() => ({
    attended: new Set(att.data?.attendedEventIds ?? []),
    excuses: new Map((excuses.data ?? []).map(x => [x.calendarEventId, x] as const)),
  }), [att.data, excuses.data]);

  const rows = useMemo(
    () => (cal.data ? buildRows(cal.data, tasks.data?.filter(t => t.status !== "done")) : null),
    [cal.data, tasks.data],
  );

  if (!entry || !viewer) return null;
  const refresh = () => Promise.all([cal.refetch(), tasks.refetch(), att.refetch(), excuses.refetch(), types.refetch()]);

  // The sheet reads its row live, so a tick or a claim updates it in place.
  const openEvent = openKey?.startsWith("e") ? cal.data?.find(e => `e${e.id}` === openKey) ?? null : null;
  const openTask = openKey?.startsWith("t") ? tasks.data?.find(t => `t${t.id}` === openKey) ?? null : null;

  const past = (rows ?? []).filter(r => r.date < today);
  const ahead = (rows ?? []).filter(r => r.date >= today);
  const months = byMonth([...(earlier ? past : []), ...ahead]);
  const todayKey = ahead[0]?.key ?? "end";
  const todayMonth = ahead[0]?.date.slice(0, 7) ?? months[months.length - 1]?.key ?? null;

  const placeMarker = () => {
    const mk = markerIn.current;
    if (!mk) return;
    const base = bodyY.current.get(mk.month);
    if (base != null) todayY.value = base + mk.y;
  };

  const children: ReactNode[] = [];
  const sticky: number[] = [];
  if (rows) children.push(<StaleNote key="stale" updatedAt={cal.dataUpdatedAt} failed={cal.isError} onRetry={() => void refresh()} />);
  if (rows && past.length) children.push(<EarlierBar key="earlier" count={past.length} open={earlier} onToggle={() => setEarlier(o => !o)} />);
  if (rows) {
    for (const mo of months) {
      sticky.push(children.length);
      children.push(<MonthHead key={`h${mo.key}`} month={mo} past={mo.key < today.slice(0, 7)} />);
      const holdsToday = mo.key === todayMonth;
      children.push(
        <MonthBody key={`b${mo.key}`} month={mo} today={today} types={types.data} mine={mine}
          todayKey={holdsToday ? (mo.rows.some(r => r.key === todayKey) ? todayKey : "end") : null}
          onOpen={(r: Row) => setOpenKey(r.key)}
          onLayout={(e: LayoutChangeEvent) => { bodyY.current.set(mo.key, e.nativeEvent.layout.y); placeMarker(); }}
          onTodayLayout={holdsToday ? (y: number) => { markerIn.current = { month: mo.key, y }; placeMarker(); } : undefined} />,
      );
    }
  }

  const empty = rows != null && rows.length === 0;
  const body: ReactNode = empty ? (
    <EmptyState
      pictures={[
        { icon: "cal", tone: "sky", label: "Meetings and events" },
        { icon: "flag", tone: "peach", label: "Deadlines" },
        { icon: "clip", tone: "butter", label: "Excuses, filed" },
      ]}
      title="Nothing on the calendar yet."
      line="When officers add meetings, events and dated tasks, they line up here by month, soonest first."
    />
  ) : !rows && cal.isError ? (
    <ErrorState title="Couldn't load the Timeline." error={cal.error} onRetry={() => void cal.refetch()} />
  ) : !rows ? (
    <View style={{ gap: 12 }}>
      <SkeletonCard lines={2} lead />
      <SkeletonCard lines={2} lead />
      <SkeletonCard lines={2} lead />
    </View>
  ) : null;

  const nextUp = ahead.find(r => r.kind === "event");
  const subtitle = !rows ? undefined : nextUp ? `${ahead.length} coming up` : "Nothing coming up";

  return (
    <Screen title="Timeline" subtitle={subtitle} large org onRefresh={refresh}
      sticky={body ? undefined : sticky} scrollY={scrollY} scrollRef={scrollRef} holdPosition={earlier}
      right={<FeedButton onPress={() => setFeed(true)} />}
      overlay={rows && !empty ? <JumpPill scrollY={scrollY} todayY={todayY} onJump={y => scrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true })} /> : null}>
      {body ?? children}
      <EventSheet event={openEvent} task={openTask} types={types.data} viewer={viewer} today={today} roster={people} onClose={() => setOpenKey(null)} />
      <SubscribeSheet open={feed} onClose={() => setFeed(false)} />
    </Screen>
  );
}

function FeedButton({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => { haptics.tap(); onPress(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add to your calendar"
      style={({ pressed }) => [styles.feed, { borderColor: c.line, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="cal" size={17} color={c.ink2} />
    </Pressable>
  );
}

/**
 * "Today ↑/↓": shows when the Today marker is out of view, says which way it is, and
 * scrolls back to it. Slides up from 12pt and fades (DUR.move); reduced motion: a fade.
 */
function JumpPill({ scrollY, todayY, onJump }: {
  scrollY: SharedValue<number>; todayY: SharedValue<number>; onJump: (y: number) => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const { height } = useWindowDimensions();
  const { tabBar } = useChrome();
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const shown = useSharedValue(0);
  const view = height - 220; // roughly what's visible under the bar and above the tab bar

  useAnimatedReaction(
    () => {
      if (todayY.value < 0) return null;
      if (todayY.value < scrollY.value - 20) return "up";
      if (todayY.value > scrollY.value + view) return "down";
      return null;
    },
    (next, prev) => {
      if (next === prev) return;
      shown.value = withTiming(next ? 1 : 0, m.timing(DUR.move, next ? "spring" : "out"));
      if (next) scheduleOnRN(setDir, next);
    },
  );
  const st = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: m.reduced ? 0 : (1 - shown.value) * 12 }],
  }));

  return (
    <Animated.View style={[styles.jumpWrap, { bottom: tabBar + 16 }, st]} pointerEvents="box-none">
      <Pressable onPress={() => { haptics.tap(); onJump(todayY.value); }} accessibilityRole="button" accessibilityLabel="Jump to today"
        style={[styles.jump, { backgroundColor: c.ink, boxShadow: c.sh2 }]}>
        <Icon name={dir === "up" ? "chev-u" : "chev-d"} size={14} color={c.paper} />
        <T v="pill" color={c.paper}>Today</T>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  feed: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  jumpWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  jump: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
});
