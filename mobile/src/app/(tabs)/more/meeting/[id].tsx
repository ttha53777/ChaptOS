/**
 * One meeting (the web's MeetingDetailOverlay, "the minutes book"), pushed from Meetings:
 *
 *   the ticket        date stub, name, when and where, Required / Optional
 *   officer desk      check-in (open / close & record / cancel / reopen), Take attendance,
 *                     excuses waiting on this meeting (MANAGE_ATTENDANCE); Edit (MANAGE_EVENTS)
 *   attendance        my line, filing an excuse, who came (~/timeline/Attendance)
 *   from the minutes  the summary and its action items (~/timeline/Minutes); Summarize
 *                     when there are minutes without a fresh summary (MANAGE_EVENTS)
 *   the minutes       as written, on a legal pad (read-only: they're written in the web's
 *                     collaborative editor during the meeting)
 *   Delete meeting    at the foot, quiet (MANAGE_EVENTS)
 *
 * Reads the meeting live from the calendar cache, so every write updates it in place.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { errorMessage } from "~/api/errors";
import { useCalendar } from "~/data/calendar";
import { localDay } from "~/data/home";
import { summarizeMeeting, useAttendanceSummary, usePendingExcuses } from "~/data/meetings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { WindowPanel } from "~/meetings/CheckIn";
import { DeleteSheet } from "~/meetings/DeleteSheet";
import { EventForm } from "~/meetings/EventForm";
import { ExcuseReview } from "~/meetings/ExcuseReview";
import { MinutesText } from "~/meetings/MinutesText";
import { canAttendance, canEvents, hasMinutes, isSummarized, minutesBeyondAgenda, shortDate, taken } from "~/meetings/model";
import { TakeAttendance } from "~/meetings/TakeAttendance";
import { navLabel } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Pill } from "~/paper/bits";
import { Ticket } from "~/paper/Ticket";
import { Screen } from "~/shell/Screen";
import { EmptyState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { useTheme } from "~/theme/PaperProvider";
import { AttendanceBlock } from "~/timeline/Attendance";
import { Minutes } from "~/timeline/Minutes";
import { clockLabel, dayStart, relDay } from "~/today/time";
import { T } from "~/ui/T";

export default function MeetingPage() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useEntryOf("ready");
  const cal = useCalendar();
  const rows = useAttendanceSummary();
  const me = entry?.me ?? null;
  const officerA = !!me && canAttendance(me);
  const officerE = !!me && canEvents(me);
  const pending = usePendingExcuses(officerA);
  const [editing, setEditing] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [summing, setSumming] = useState(false);
  const today = localDay();

  if (!me) return null;
  const back = navLabel(me, "Chapter");
  const event = cal.data?.find(e => e.id === Number(id)) ?? null;
  const refresh = () => Promise.all([cal.refetch(), rows.refetch(), pending.refetch()]);

  if (!event) {
    return (
      <Screen title={back} back={back} onRefresh={refresh}>
        {cal.isPending ? <SkeletonCard height={180} /> : <EmptyState title="This meeting isn't on the calendar." line="It may have been deleted. Pull to refresh, or go back to the list." />}
      </Screen>
    );
  }

  const row = rows.data?.find(r => r.calendarEventId === event.id);
  const waiting = (pending.data ?? []).filter(x => x.status === "pending" && x.calendarEventId === event.id).length;
  const minutes = minutesBeyondAgenda(event);
  const filed = hasMinutes(event);
  const stale = isSummarized(event) && (event.notesSummaryRevision ?? 0) < (event.notesContentRevision ?? 0);
  const canSummarize = officerE && filed && (!isSummarized(event) || stale);
  const past = event.date < today;

  const summarize = async () => {
    if (summing) return;
    setSumming(true);
    try {
      const r = await summarizeMeeting(event.id);
      const n = Array.isArray((r.notesSummaryData as { actions?: unknown[] } | null)?.actions) ? (r.notesSummaryData as { actions: unknown[] }).actions.length : 0;
      haptics.success();
      toast.show("Summary ready", { detail: `${n} action ${n === 1 ? "item" : "items"}.` });
    } catch (e) {
      haptics.error();
      toast.error("Couldn't summarize", { detail: errorMessage(e) });
    } finally { setSumming(false); }
  };

  const d = dayStart(event.date);
  const meta = [past ? shortDate(event.date) : relDay(today, event.date), clockLabel(event.time), event.location].filter(Boolean).join("  ·  ");

  return (
    <Screen title={event.title} back={back} onRefresh={refresh}
      right={officerE ? (
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Edit meeting" hitSlop={8} style={[styles.edit, { borderColor: c.line2 }]}>
          <Icon name="pencil" size={15} color={c.ink2} />
        </Pressable>
      ) : null}>
      <Ticket tone="sky" body={
        <View style={styles.top}>
          <View style={[styles.date, { backgroundColor: c.ink }]}>
            <T v="kicker" color={c.paper} style={{ opacity: 0.75 }}>{d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}</T>
            <T v="title" color={c.paper} style={{ fontSize: 26, lineHeight: 28 }}>{String(d.getDate())}</T>
            <T v="kicker" color={c.paper} style={{ opacity: 0.75, fontSize: 9 }}>{d.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</T>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="title" numberOfLines={3}>{event.title}</T>
            {meta ? <T v="meta" color={c.ink3}>{meta}</T> : null}
            <View style={styles.pills}>
              <Pill label={event.mandatory ? "Required" : "Optional"} tone={event.mandatory ? "peach" : "sky"} />
              {taken(row) ? <Pill label={`${row.present}/${row.eligible} here`} tone={row.present / row.eligible < 0.7 ? "rose" : "mint"} /> : null}
              {isSummarized(event) ? <Pill label="Summarized" tone="lilac" /> : null}
            </View>
          </View>
        </View>
      } />

      {officerA && event.mandatory ? (
        <View style={{ gap: 10 }}>
          <WindowPanel event={event} />
          <View style={styles.acts}>
            <Button label="Take attendance" icon="clip" variant="ghost" tone="mint" size="sm" onPress={() => setRolling(true)} style={{ flex: 1 }} />
            {waiting ? <Button label={`${waiting} ${waiting === 1 ? "excuse" : "excuses"} waiting`} icon="form" variant="ghost" tone="butter" size="sm"
              onPress={() => setReviewing(true)} style={{ flex: 1 }} /> : null}
          </View>
        </View>
      ) : null}

      {event.mandatory ? <AttendanceBlock event={event} meId={me.id} today={today} /> : null}

      <Minutes eventId={event.id} meId={me.id} />
      {canSummarize ? (
        <Button label={summing ? "Reading the minutes…" : stale ? "Summarize again (minutes changed)" : "Summarize the minutes"} icon="spark" variant="soft" tone="lilac"
          onPress={() => void summarize()} disabled={summing} />
      ) : null}

      <View style={{ gap: 10 }}>
        <T v="label" color={c.ink3} accessibilityRole="header">The minutes</T>
        {filed ? <MinutesText text={minutes || (event.description ?? "")} /> : (
          <View style={[styles.none, { borderColor: c.line2 }]}>
            <Icon name="note" size={18} color={c.ink3} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="callout">{past ? "No minutes were filed." : "Minutes are taken during the meeting."}</T>
              <T v="meta" color={c.ink3}>{officerE ? "They're written in the notes editor on a laptop, live with the other officers, and land here as they're saved." : "Once someone files them, they show up here."}</T>
            </View>
          </View>
        )}
      </View>

      {officerE ? (
        <Pressable onPress={() => setDeleting(true)} accessibilityRole="button" style={styles.del} hitSlop={6}>
          <Icon name="trash" size={14} color={c.pastel.rose.ink} />
          <T v="callout" color={c.pastel.rose.ink}>Delete meeting</T>
        </Pressable>
      ) : null}

      {officerE ? <EventForm open={editing} kind="meeting" editing={event} onClose={() => setEditing(false)} /> : null}
      {officerA ? <TakeAttendance event={rolling ? event : null} onClose={() => setRolling(false)} /> : null}
      {officerA ? <ExcuseReview open={reviewing} eventId={event.id} onClose={() => setReviewing(false)} /> : null}
      {officerE ? <DeleteSheet event={deleting ? event : null} onClose={() => setDeleting(false)} onDeleted={() => router.back()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  date: { width: 58, alignItems: "center", borderRadius: 14, paddingTop: 6, paddingBottom: 7, transform: [{ rotate: "-3deg" }] },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  acts: { flexDirection: "row", gap: 8 },
  edit: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  none: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed" },
  del: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
});
