/**
 * Timeline (Phase 3 of docs/mobile-web-parity-plan.md): the web timeline's phone render
 * (app/org/[slug]/timeline/page.tsx at 390pt), on the same rules (lib/timeline/rows).
 *
 *   briefing     "THURSDAY, NOVEMBER 19, 2026 · WEEK OF NOV 16–22", "The weeks *ahead*.",
 *                the digest read off the calendar (or the quiet line); day one says what
 *                the page is for instead
 *   add          Add to my calendar · Add Deadline (MANAGE_TASKS, the task form in place)
 *                · Add Event (MANAGE_EVENTS, the event form; meetings can repeat)
 *   day one      nothing on the calendar at all: three pictures and the gated buttons
 *   controls     the filter with counts, Legend, Timeline / Calendar (remembered)
 *   review       officers (MANAGE_ATTENDANCE): "N excuses awaiting review" → the review sheet
 *   line         Earlier bar → months → Today marker → months ahead (beyond six weeks they
 *                fold into a bar) → "Nothing scheduled past …"
 *   calendar     the month page; a day opens in a sheet
 *   event        the event sheet (details, supplies, attendance, excuse filing, minutes),
 *                with Edit / Delete / Take attendance for officers; dated tasks and media
 *                posts open as deadlines
 *
 * Rows are calendar events plus every dated task and Instagram post, as on the web.
 *
 * Motion: a new event lands (scrolls into view, pops, its wash fades). Delete tears the
 * row off (tilts, drops and fades; reduced: fades), then an Undo holds for 6s before the
 * DELETE goes; Undo puts the row back and lands it. A failure puts it back and says why.
 * Haptics: warn as the delete slip opens, soft on the tear, error on a failure.
 *
 * Deep links: ?event=<id> opens an event; ?review=1 opens the excuse review.
 */
import type { CalendarEvent } from "@/lib/api-types";
import { isNavVisible } from "@/lib/nav-order";
import {
  buildTimeline, filterByLayer, layerCounts, overdueInPast, postIdOf, taskIdOf, timelineDigest, timelineRows, type CalLayer,
} from "@/lib/timeline/rows";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type ScrollViewInstance } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { isApiError, errorMessage } from "~/api/errors";
import { weekRange } from "~/dash/Brief";
import { byStart, isOver, timeText } from "~/dash/UpNextCard";
import { useCalendar, useEventTypes } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useMedia } from "~/data/media";
import { deleteEvent, refreshAfterEventWrite, usePendingExcuses } from "~/data/meetings";
import { useRoster, useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { EventForm } from "~/meetings/EventForm";
import { ExcuseReview } from "~/meetings/ExcuseReview";
import { canAttendance, canEvents } from "~/meetings/model";
import { TakeAttendance } from "~/meetings/TakeAttendance";
import { DUR } from "~/motion/motion";
import { haptics } from "~/motion/haptics";
import { useChrome } from "~/shell/chrome";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { toast } from "~/shell/toast";
import { viewerOf } from "~/tasks/model";
import { TaskForm } from "~/tasks/TaskForm";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { TimelineDayOne } from "~/timeline/DayOne";
import { DeleteSlip } from "~/timeline/DeleteSlip";
import { EventSheet, SubscribeSheet, type SheetOfficer } from "~/timeline/EventSheet";
import { SlotView, useSlot } from "~/shell/slot";
import {
  AddButtons, EndLine, FilterEmpty, FilterSeg, LegendButton, MonthHead, PastBar, ReviewBand, Spine, TodayMarker, ViewSwitch, type TimelineView,
} from "~/timeline/Line";
import { DaySheet, MonthGrid, type Ym } from "~/timeline/MonthGrid";
import { useNow } from "~/today/live";
import { PageBrief } from "~/ui/PageBrief";
import { T } from "~/ui/T";

const VIEW_KEY = "chaptos:timeline-view";
const UNDO_MS = 6000;
const BIT = { parties: 1 << 3, tasks: 1 << 12, fundraising: 1 << 14 } as const;

/** Monday–Sunday around a day (app/data.ts isoWeekBounds). */
function weekOf(today: string): { start: string; end: string } {
  const d = new Date(`${today}T12:00:00`);
  const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: iso(mon), end: iso(sun) };
}

export default function Timeline() {
  const entry = useEntryOf("ready");
  const me = entry?.me ?? null;
  const params = useLocalSearchParams<{ event?: string; review?: string }>();
  const workflows = me?.org?.enabledWorkflows ?? [];
  const can = (bit: number) => !!me && (me.isAdmin || (me.permissions & bit) !== 0);
  const officerEvents = !!me && canEvents(me);
  const officerAtt = !!me && canAttendance(me);
  const officerTasks = can(BIT.tasks);

  const cal = useCalendar();
  const types = useEventTypes();
  const tasks = useTasks();
  const media = useMedia(isNavVisible("Instagram", workflows));
  const roster = useRoster();
  const pending = usePendingExcuses(officerAtt);
  const today = localDay();
  const now = useNow(true, false);

  const [layer, setLayer] = useState<CalLayer>("all");
  const [view, setView] = useState<TimelineView>("timeline");
  const [earlier, setEarlier] = useState(false);
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const [calMonth, setCalMonth] = useState<Ym>(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [calDir, setCalDir] = useState<1 | -1 | 0>(0);
  const [calDay, setCalDay] = useState<string | null>(null);
  // The open event lives on a slot, so opening one re-renders the sheet, not the line (~/shell/slot).
  const opened = useSlot<number>();
  const setOpenId = opened.set;
  const [form, setForm] = useState<{ editing: CalendarEvent | null } | null>(null);
  const [taskForm, setTaskForm] = useState(false);
  const [delAsk, setDelAsk] = useState<CalendarEvent | null>(null);
  const [take, setTake] = useState<CalendarEvent | null>(null);
  const [review, setReview] = useState(false);
  const [feed, setFeed] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [tearing, setTearing] = useState<number | null>(null);
  const [landed, setLanded] = useState<number | null>(null);

  // remembered per viewer, as on the web
  useEffect(() => { AsyncStorage.getItem(VIEW_KEY).then(v => { if (v === "calendar") setView("calendar"); }, () => undefined); }, []);
  const switchView = (v: TimelineView) => { setView(v); setCalDay(null); void AsyncStorage.setItem(VIEW_KEY, v).catch(() => undefined); };

  /* ── derivations (lib/timeline/rows) ── */
  const rows = useMemo(
    () => (cal.data && tasks.data ? timelineRows(cal.data, tasks.data, media.data ?? [], hidden) : null),
    [cal.data, tasks.data, media.data, hidden],
  );
  const overAt = (e: CalendarEvent) => isOver(e, today, now);
  const filtered = useMemo(() => (rows ? filterByLayer(rows.all, layer) : []), [rows, layer]);
  const counts = useMemo(() => layerCounts(rows?.all ?? []), [rows]);
  // The clock ticks every minute, but the line only changes when an event tips into the
  // past: rebuild on that (the ids that are over), not on every tick. Rebuilding per tick
  // made new event arrays, so every memoized Spine and Row redrew once a minute.
  const overKey = filtered.filter(overAt).map(e => e.id).join(",");
  const line = useMemo(() => buildTimeline(filtered, today, byStart, overAt), [filtered, today, overKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const overduePast = rows ? overdueInPast(line, rows.doneById) : 0;
  const week = weekOf(today);
  const overdueTasks = (tasks.data ?? []).filter(t => t.status !== "done" && t.dueDate != null && t.dueDate < today).length;
  const digest = rows ? timelineDigest({
    all: rows.all, today, weekStart: week.start, weekEnd: week.end, overdue: overdueTasks,
    compare: byStart, isOver: overAt, start: e => timeText(e)?.split(" – ")[0] ?? null,
  }) : null;
  const lastEvent = rows?.all.length ? [...rows.all].sort(byStart)[rows.all.length - 1]! : null;
  const dayOne = rows != null && rows.all.length === 0 && (!media.isLoading);
  const collapsed = (id: string) => line.defaultCollapsed.has(id) !== toggled.has(id);
  const toggleMonth = (id: string) => setToggled(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const waiting = (pending.data ?? []).filter(x => x.status === "pending").length;

  /* ── what the sheet shows (rendered from the slot, below) ── */
  const eventSheet = (openId: number | null, close: () => void) => {
    const row = openId != null ? rows?.all.find(e => e.id === openId) ?? null : null;
    const tId = row ? taskIdOf(row) : null;
    const pId = row ? postIdOf(row) : null;
    const sheetTask = tId != null ? tasks.data?.find(t => t.id === tId) ?? null : null;
    const sheetPost = pId != null ? media.data?.find(p => p.id === pId) ?? null : null;
    const sheetEvent = row && tId == null && pId == null ? cal.data?.find(e => e.id === row.id) ?? null : null;
    const officer: SheetOfficer | null = sheetEvent && me ? {
      canEdit: officerEvents && !!rows?.eventIds.has(sheetEvent.id),
      canDelete: officerEvents && (!sheetEvent.partyEventId || can(BIT.parties)) && (sheetEvent.category !== "fundraising" || can(BIT.fundraising)),
      canLog: officerAtt,
      onEdit: () => { setOpenId(null); setForm({ editing: sheetEvent }); },
      onDelete: () => { setOpenId(null); setDelAsk(sheetEvent); },
      onLog: () => { setOpenId(null); setTake(sheetEvent); },
    } : null;
    const go = (path: string) => () => { setOpenId(null); router.push(path as Href); };
    const links = sheetEvent ? {
      party: sheetEvent.partyEventId != null ? go("/more/parties") : undefined,
      fundraiser: sheetEvent.category === "fundraising" ? go("/more/fundraisers") : undefined,
      programming: sheetEvent.programmingEventId != null ? go("/more/programming") : undefined,
      media: isNavVisible("Instagram", workflows) ? go("/more/media") : undefined,
    } : sheetPost ? { media: go("/more/media") } : undefined;
    const linkedPosts = sheetEvent ? (media.data ?? []).filter(p => p.calendarEventId === sheetEvent.id) : undefined;
    return (
      <EventSheet event={sheetEvent} task={sheetTask} post={sheetPost} types={types.data} viewer={viewer} today={today} roster={people}
        officer={officer} links={links} linkedPosts={linkedPosts} managed={sheetTask != null || sheetPost != null} onClose={close} />
    );
  };

  /* ── deep links ── */
  const linked = useRef({ event: false, review: false });
  useEffect(() => {
    const id = Number(params.event);
    if (!linked.current.event && id && rows?.all.some(e => e.id === id)) { linked.current.event = true; setOpenId(id); }
  }, [params.event, rows]);
  useEffect(() => {
    if (!linked.current.review && params.review === "1" && waiting > 0) { linked.current.review = true; setReview(true); }
  }, [params.review, waiting]);

  /* ── where things are, for landing and the Today pill ── */
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useSharedValue(0);
  const todayY = useSharedValue(-1);
  const lineY = useRef(0);
  const blockY = useRef(new Map<string, number>());
  const rowY = useRef(new Map<number, { month: string; y: number }>());
  const spineY = useRef(new Map<string, number>());
  const markerY = useRef(0);
  // Stable, so the memoized month lines (Spine) don't re-render when the screen does.
  const openRow = useCallback((e: CalendarEvent) => setOpenId(e.id), [setOpenId]);
  const onSpineY = useCallback((block: string, y: number) => { spineY.current.set(block, y); }, []);
  const onRowY = useCallback((block: string, id: number, y: number) => { rowY.current.set(id, { month: block, y }); }, []);
  const placeToday = () => { todayY.value = lineY.current + markerY.current; };
  const yOf = (id: number) => {
    const r = rowY.current.get(id);
    const b = r ? blockY.current.get(r.month) : undefined;
    return r && b != null ? lineY.current + b + (spineY.current.get(r.month) ?? 50) + r.y : null;
  };

  // Land a new or restored event: open its month (and Earlier, if it's past), scroll, pop.
  const land = (id: number) => {
    setLayer("all");
    switchView("timeline");
    setLanded(null);
    setTimeout(() => {
      const ev = cal.data?.find(e => e.id === id);
      if (ev) {
        if (overAt(ev)) setEarlier(true);
        const mo = ev.date.slice(0, 7);
        if (collapsed(mo)) toggleMonth(mo);
      }
      setTimeout(() => {
        const y = yOf(id);
        if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
        setLanded(id);
      }, 220);
    }, 120);
  };
  // A created event arrives with the next calendar read; land it once it's there.
  const [awaiting, setAwaiting] = useState<number | null>(null);
  useEffect(() => { if (awaiting != null && cal.data?.some(e => e.id === awaiting)) { land(awaiting); setAwaiting(null); } }, [awaiting, cal.data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── delete: tear, Undo for 6s, then DELETE ── */
  const hide = (id: number, on: boolean) => setHidden(p => { if (p.has(id) === on) return p; const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const startDelete = (ev: CalendarEvent, records: boolean) => {
    setDelAsk(null);
    haptics.soft();
    setTearing(ev.id);
    requestAnimationFrame(() => hide(ev.id, true));
    let settled = false;
    toast.show(`${ev.title} deleted`, {
      detail: records ? "Its records went with it." : "Off the timeline.",
      icon: "trash", tone: "rose", undoMs: UNDO_MS,
      undo: () => { settled = true; setTearing(null); hide(ev.id, false); setTimeout(() => setLanded(ev.id), 60); },
      onExpire: () => {
        if (settled) return;
        settled = true;
        deleteEvent(ev.id).then(
          () => { void refreshAfterEventWrite(); },
          (e: unknown) => {
            if (isApiError(e, 404)) { void refreshAfterEventWrite(); return; }
            hide(ev.id, false);
            setTearing(null);
            haptics.error();
            const why = isApiError(e, 403)
              ? (ev.partyEventId != null ? "It has a party ledger, and deleting that needs Manage parties." : "Your role no longer includes managing events.")
              : isApiError(e, 401) ? "Sign in again, then delete it. It’s back where it was."
              : `${errorMessage(e, "Something went wrong on our end.")} It’s back where it was.`;
            toast.error(isApiError(e, 403) ? `You can’t delete ${ev.title}` : `Couldn’t delete ${ev.title}`, { detail: why });
          },
        );
      },
    });
  };

  if (!entry || !me) return null;
  const viewer = viewerOf(me);
  const people = new Map((roster.data ?? []).map(b => [b.id, b] as const));
  const refresh = () => Promise.all([cal.refetch(), tasks.refetch(), types.refetch(), media.refetch(), officerAtt ? pending.refetch() : null]);
  const now0 = new Date();
  const dateLabel = now0.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const addEvent = officerEvents ? () => setForm({ editing: null }) : undefined;
  const addDeadline = officerTasks ? () => setTaskForm(true) : undefined;

  const brief = (
    <PageBrief key="brief" pill={dateLabel} kicker={`Week of ${weekRange(week.start, week.end)}`}
      lead={dayOne ? "Everything you have on, " : "The weeks "} mark={dayOne ? "on one line" : "ahead"} markTone="sky"
      sub={dayOne ? "Add an event or a deadline once. It takes its place on the line by date, everyone can see it, and on the day they tap in." : null}
      digest={dayOne ? null : digest}
      quiet={!dayOne && !digest && rows ? `Everything ${me.org?.name ?? "your chapter"} has on — meetings, events, deadlines — on one line through the term. It starts filling in with your first event.` : null} />
  );

  let body;
  if (!rows && cal.isError) body = <ErrorState title="Couldn't load the Timeline." error={cal.error} onRetry={() => void cal.refetch()} />;
  else if (!rows) body = <View style={{ gap: 12 }}><SkeletonCard lines={2} lead /><SkeletonCard lines={2} lead /><SkeletonCard lines={2} lead /></View>;
  else if (dayOne) body = <TimelineDayOne canEvents={officerEvents} canDeadlines={officerTasks} onAddEvent={() => setForm({ editing: null })} onAddDeadline={() => setTaskForm(true)} />;
  else body = (
    <View style={{ gap: 16 }}>
      <FilterSeg value={layer} counts={counts} onChange={setLayer} />
      <View style={styles.controls}>
        <LegendButton types={types.data} workflows={workflows} />
        <ViewSwitch value={view} onChange={switchView} />
      </View>
      {officerAtt && waiting > 0 ? <ReviewBand count={waiting} onReview={() => setReview(true)} /> : null}

      {view === "calendar" ? (
        <MonthGrid events={filtered} types={types.data} month={calMonth} dir={calDir} today={today} picked={calDay}
          onMonth={(mo, d) => { setCalDir(d); setCalMonth(mo); }} onDay={setCalDay} />
      ) : line.pastCount === 0 && line.upcoming.length === 0 ? (
        <FilterEmpty onAll={layer !== "all" ? () => setLayer("all") : undefined} />
      ) : (
        <View onLayout={(e: LayoutChangeEvent) => { lineY.current = e.nativeEvent.layout.y; placeToday(); }}>
          {line.pastCount > 0 ? (
            <PastBar label="Earlier" count={`${line.pastCount} event${line.pastCount === 1 ? "" : "s"}`} overdue={overduePast} open={earlier} onPress={() => setEarlier(o => !o)} />
          ) : null}
          {earlier ? line.past.map(g => (
            <View key={`p${g.id}`} onLayout={(e: LayoutChangeEvent) => { blockY.current.set(`p${g.id}`, e.nativeEvent.layout.y); }}>
              <MonthHead group={g} past />
              <Spine block={`p${g.id}`} events={g.events} types={types.data} today={today} past doneById={rows.doneById} ownerById={rows.ownerById}
                landed={landed} tearing={tearing} onOpen={openRow} onLayoutY={onSpineY} onRowLayout={onRowY} />
            </View>
          )) : null}

          <TodayMarker today={today} onLayout={(e: LayoutChangeEvent) => { markerY.current = e.nativeEvent.layout.y; placeToday(); }} />

          {line.upcoming.map(g => {
            const count = g.events.length;
            const required = g.events.filter(e => e.mandatory).length;
            if (collapsed(g.id)) {
              return <PastBar key={g.id} ahead label={`${g.monthLabel} ${g.year}`} count={`${count} upcoming${required > 0 ? ` · ${required} required` : ""}`} open={false} onPress={() => toggleMonth(g.id)} />;
            }
            return (
              <View key={g.id} onLayout={(e: LayoutChangeEvent) => { blockY.current.set(g.id, e.nativeEvent.layout.y); }}>
                <MonthHead group={g} open onToggle={() => toggleMonth(g.id)} />
                <Spine block={g.id} events={g.events} types={types.data} today={today} doneById={rows.doneById} ownerById={rows.ownerById}
                  landed={landed} tearing={tearing} onOpen={openRow} onLayoutY={onSpineY} onRowLayout={onRowY} />
              </View>
            );
          })}

          {lastEvent ? <EndLine last={lastEvent.date} onAdd={addEvent} /> : null}
        </View>
      )}
    </View>
  );

  return (
    <Screen title="Timeline" large org onRefresh={refresh} scrollY={scrollY} scrollRef={scrollRef} holdPosition={earlier}
      overlay={rows && !dayOne && view === "timeline" ? <JumpPill scrollY={scrollY} todayY={todayY} onJump={y => scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true })} /> : null}>
      {rows ? <StaleNote key="stale" updatedAt={cal.dataUpdatedAt} failed={cal.isError} onRetry={() => void refresh()} /> : null}
      {brief}
      {!dayOne ? <AddButtons key="add" onCalendar={() => setFeed(true)} onDeadline={addDeadline} onEvent={addEvent} /> : null}
      {body}

      <SlotView slot={opened}>{eventSheet}</SlotView>
      <DaySheet date={calDay} events={filtered} types={types.data} today={today} doneById={rows?.doneById ?? new Map()}
        onClose={() => setCalDay(null)} onOpen={e => { setCalDay(null); setOpenId(e.id); }}
        onAdd={addEvent ? () => { setCalDay(null); setForm({ editing: null }); } : undefined} />
      <EventForm open={form != null} kind="event" editing={form?.editing ?? null} onClose={() => setForm(null)}
        onSaved={id => { if (form?.editing) setTimeout(() => land(id), 200); else setAwaiting(id); }} />
      <TaskForm open={taskForm} task={null} onClose={() => setTaskForm(false)} />
      <DeleteSlip event={delAsk} types={types.data} onKeep={() => setDelAsk(null)} onDelete={startDelete} />
      <TakeAttendance event={take} onClose={() => setTake(null)} />
      <ExcuseReview open={review} onClose={() => setReview(false)} />
      <SubscribeSheet open={feed} onClose={() => setFeed(false)} />
    </Screen>
  );
}

/**
 * "Today ↑/↓": shows when the Today marker is out of view, says which way it is, and
 * scrolls back to it (the web's Jump to today). Slides up 12pt and fades; reduced: a fade.
 */
function JumpPill({ scrollY, todayY, onJump }: { scrollY: SharedValue<number>; todayY: SharedValue<number>; onJump: (y: number) => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const { height } = useWindowDimensions();
  const { tabBar } = useChrome();
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  const shown = useSharedValue(0);
  const view = height - 220;
  // Built on the JS thread: calling m.timing() inside the worklet is a fatal non-worklet call.
  const showCfg = m.timing(DUR.move, "spring");
  const hideCfg = m.timing(DUR.move, "out");
  useAnimatedReaction(
    () => (todayY.value < 0 ? null : todayY.value < scrollY.value - 20 ? "up" : todayY.value > scrollY.value + view ? "down" : null),
    (next, prev) => {
      if (next === prev) return;
      shown.value = withTiming(next ? 1 : 0, next ? showCfg : hideCfg);
      if (next) scheduleOnRN(setDir, next);
    },
  );
  const st = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: m.reduced ? 0 : (1 - shown.value) * 12 }] }));
  return (
    <Animated.View style={[styles.jumpWrap, { bottom: tabBar + 16 }, st]} pointerEvents="box-none">
      <Pressable onPress={() => onJump(todayY.value)} accessibilityRole="button" accessibilityLabel="Jump to today"
        style={[styles.jump, { backgroundColor: c.ink, boxShadow: c.sh2 }]}>
        <Icon name={dir === "up" ? "chev-u" : "chev-d"} size={14} color={c.paper} />
        <T v="pill" color={c.paper}>Today</T>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  jumpWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  jump: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
});
