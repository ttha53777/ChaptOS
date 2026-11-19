/**
 * Meetings (the web's Chapter page), reached from More → Chapter:
 *
 *   the digest     one briefing sentence: when chapter meets next, how many were held this
 *                  term, turnout, and which ones still have no minutes
 *   on deck        the next meeting as Today's up-next ticket
 *   waiting        officers: excuses to review, as a butter band
 *   the book       held meetings, newest first, as ledger rows: a date stub, the name,
 *                  the summary's gist or the minutes' first lines, the roll; filters
 *                  All / No minutes / Under 70%
 *   day one        nothing yet: three pictures and Add your first meeting (officers)
 *
 * Officers (MANAGE_EVENTS) add meetings from the + in the header. Rows open the meeting.
 */
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import type { AttendanceSummaryRow, CalendarEvent } from "@/lib/api-types";
import { useCalendar } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useAttendanceSummary, usePendingExcuses } from "~/data/meetings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { EventForm } from "~/meetings/EventForm";
import { ExcuseReview } from "~/meetings/ExcuseReview";
import {
  canAttendance, canEvents, digest, filterPast, hasMinutes, isLow, isSummarized, LOW_PCT, notesPreview, splitMeetings, taken, type PastFilter,
} from "~/meetings/model";
import { navLabel } from "~/more/model";
import { EASE } from "~/motion/motion";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { UpNextTicket } from "~/today/UpNext";
import { dayStart } from "~/today/time";
import { Segmented } from "~/ui/Segmented";
import { T } from "~/ui/T";

export default function Meetings() {
  const { c } = useTheme();
  const m = useMotion();
  const entry = useEntryOf("ready");
  const me = entry?.me ?? null;
  const cal = useCalendar();
  const sum = useAttendanceSummary();
  const officerE = !!me && canEvents(me);
  const officerA = !!me && canAttendance(me);
  const pending = usePendingExcuses(officerA);
  const [filter, setFilter] = useState<PastFilter>("all");
  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const today = localDay();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const rows = useMemo(() => new Map((sum.data ?? []).map(r => [r.calendarEventId, r] as const)), [sum.data]);
  const split = useMemo(() => (cal.data ? splitMeetings(cal.data, today, nowMin) : null), [cal.data, today, Math.floor(nowMin / 5)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return null;

  const title = navLabel(me, "Chapter");
  const term = me.org?.activeTerm ?? null;
  const waiting = (pending.data ?? []).filter(x => x.status === "pending").length;
  const refresh = () => Promise.all([cal.refetch(), sum.refetch(), officerA ? pending.refetch() : null]);
  const open = (e: CalendarEvent) => { router.push(`/more/meeting/${e.id}`); };
  const add = () => setAdding(true);

  const right = officerE ? (
    <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Add meeting" hitSlop={8}
      style={({ pressed }) => [styles.plus, { backgroundColor: c.ink, boxShadow: `${pressed ? 1 : 2}px ${pressed ? 1 : 2}px 0 ${c.note.fill.sky}` }, pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
      <Icon name="plus" size={16} color={c.paper} />
    </Pressable>
  ) : null;

  let body: React.ReactNode;
  if (!split) {
    body = cal.isError ? <ErrorState title="Couldn't load the meetings." error={cal.error} onRetry={() => void cal.refetch()} /> : <><SkeletonCard height={150} /><SkeletonList count={4} /></>;
  } else if (!split.next && !split.past.length) {
    body = (
      <EmptyState
        pictures={[{ icon: "cal", tone: "sky", label: "Put meetings on the calendar" }, { icon: "check", tone: "mint", label: "Members tap in" }, { icon: "note", tone: "butter", label: "Minutes go in the book" }]}
        title="No meetings yet."
        line={officerE ? "Add the first one: the usual day, time and room carry over to the next." : "When an officer adds a meeting, it shows up here and on the Timeline."}
        action={officerE ? { label: "Add your first meeting", icon: "plus", onPress: add } : undefined} />
    );
  } else {
    const past = filterPast(split.past, rows, filter);
    const missing = split.past.filter(e => !hasMinutes(e)).length;
    const low = split.past.filter(e => isLow(rows.get(e.id))).length;
    const runs = digest(split.next, split.past, rows, today, term);
    const layout = LinearTransition.duration(m.t(m.reduced ? 0 : 260)).easing(EASE.standard).reduceMotion(ReduceMotion.Never);
    body = (
      <>
        <T v="body" color={c.ink2} style={{ lineHeight: 23 }}>
          {runs.map((r, i) => <T key={i} v="body" color={c.ink2}>{r.lead}{r.strong ? <T v="body" color={c.ink} style={{ fontWeight: "700" }}>{r.strong}</T> : null}{r.rest}</T>)}
        </T>

        {waiting && officerA ? (
          <Pressable onPress={() => setReviewing(true)} accessibilityRole="button" accessibilityLabel={`${waiting} excuses waiting for review`}
            style={({ pressed }) => [styles.band, { backgroundColor: c.pastel.butter.soft, borderColor: pressed ? c.ink : c.pastel.butter.border }]}>
            <Icon name="form" size={18} color={c.pastel.butter.ink} />
            <View style={{ flex: 1 }}>
              <T v="callout">{`${waiting} ${waiting === 1 ? "excuse" : "excuses"} waiting`}</T>
              <T v="meta" color={c.ink3}>Excuse or decline before the roll closes them out.</T>
            </View>
            <Icon name="chev-r" size={15} color={c.ink3} />
          </Pressable>
        ) : null}

        {split.next ? (
          <View style={{ gap: 10 }}>
            <T v="label" color={c.ink3} accessibilityRole="header">On deck</T>
            <UpNextTicket event={split.next} today={today} onPress={() => open(split.next!)} />
            {split.later.length ? <T v="meta" color={c.ink3}>{`Then ${split.later.length} more on the calendar.`}</T> : null}
          </View>
        ) : null}

        {split.past.length ? (
          <View style={{ gap: 12 }}>
            <View style={styles.bookHead}>
              <T v="label" color={c.ink3} accessibilityRole="header" style={{ flex: 1 }}>The book</T>
              <T v="mono" color={c.ink3} style={{ fontSize: 11 }}>{`${split.past.length} held`}</T>
            </View>
            {missing || low ? (
              <Segmented<PastFilter> label="Show" value={filter} onChange={v => setFilter(v)}
                options={[{ value: "all", label: "All" }, { value: "missing", label: `No minutes${missing ? ` · ${missing}` : ""}` }, { value: "low", label: `Under ${LOW_PCT}%${low ? ` · ${low}` : ""}` }]} />
            ) : null}
            <View style={[styles.ledger, { borderColor: c.line, backgroundColor: c.card }]}>
              {past.map((e, i) => (
                <Animated.View key={e.id} layout={layout} exiting={FadeOut.duration(m.t(140)).reduceMotion(ReduceMotion.Never)}
                  entering={(m.reduced ? FadeIn.duration(m.t(160)) : FadeInDown.delay(m.t(Math.min(i, 8) * 28)).duration(m.t(240)).springify().damping(18)).reduceMotion(ReduceMotion.Never)}>
                  <LedgerRow e={e} row={rows.get(e.id)} first={i === 0} onPress={() => open(e)} />
                </Animated.View>
              ))}
              {!past.length ? <T v="meta" color={c.ink3} style={{ padding: 16 }}>{filter === "missing" ? "Every meeting has minutes." : "No meeting fell under the line."}</T> : null}
            </View>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <Screen title={title} large back="More" right={right} onRefresh={refresh}
      subtitle={term ? term.label : undefined}>
      {body}
      {officerE ? <EventForm open={adding} kind="meeting" onClose={() => setAdding(false)} onSaved={id => router.push(`/more/meeting/${id}`)} /> : null}
      {officerA ? <ExcuseReview open={reviewing} onClose={() => setReviewing(false)} /> : null}
    </Screen>
  );
}

function LedgerRow({ e, row, first, onPress }: { e: CalendarEvent; row: AttendanceSummaryRow | undefined; first: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const d = dayStart(e.date);
  const filed = hasMinutes(e);
  const preview = filed ? notesPreview(e) : "";
  const pct = taken(row) ? Math.round((row.present / row.eligible) * 100) : null;
  const low = isLow(row);
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}. ${filed ? "Has minutes" : "No minutes"}${pct != null ? `, ${pct} percent turnout` : ""}`}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: 1, borderTopColor: c.lineSoft }, pressed && { backgroundColor: c.paper2 }]}>
      <View style={[styles.stub, { borderColor: c.line2, backgroundColor: c.paper }]}>
        <T v="kicker" color={c.ink3} style={{ fontSize: 9 }}>{d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</T>
        <T v="title" style={{ fontSize: 19, lineHeight: 22 }}>{String(d.getDate())}</T>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.rowTop}>
          <T v="callout" numberOfLines={1} style={{ flex: 1 }}>{e.title}</T>
          {pct != null ? (
            <View style={styles.turn}>
              <View style={[styles.meter, { borderColor: low ? c.pastel.rose.border : c.line2 }]}>
                <View style={{ width: `${pct}%`, height: "100%", backgroundColor: low ? c.pastel.rose.ink : c.pastel.mint.ink, opacity: 0.75 }} />
              </View>
              <T v="mono" color={low ? c.pastel.rose.ink : c.ink3} style={{ fontSize: 11.5, fontWeight: low ? "700" : "400" }}>{`${row!.present}/${row!.eligible}`}</T>
            </View>
          ) : null}
        </View>
        {filed ? (
          <T v="meta" color={c.ink2} numberOfLines={2}>{isSummarized(e) ? "✦ " : ""}{preview || "Minutes filed."}</T>
        ) : (
          <View style={styles.noMin}>
            <View style={[styles.dash, { borderColor: c.pastel.rose.border }]} />
            <T v="meta" color={c.pastel.rose.ink}>No minutes</T>
          </View>
        )}
      </View>
      <Icon name="chev-r" size={14} color={c.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plus: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  band: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5 },
  bookHead: { flexDirection: "row", alignItems: "baseline" },
  ledger: { borderWidth: 1.5, borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, minHeight: 64 },
  stub: { width: 44, alignItems: "center", paddingVertical: 5, borderRadius: 10, borderWidth: 1.5 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  turn: { flexDirection: "row", alignItems: "center", gap: 6 },
  meter: { width: 26, height: 6, borderRadius: 3, borderWidth: 1, overflow: "hidden" },
  noMin: { flexDirection: "row", alignItems: "center", gap: 6 },
  dash: { width: 14, borderTopWidth: 1.5, borderStyle: "dashed" },
});
