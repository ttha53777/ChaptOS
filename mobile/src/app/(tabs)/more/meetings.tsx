/**
 * Meetings (the web's Chapter page, app/org/[slug]/chapter/page.tsx), reached from More:
 * the same phone layout, drawn from the rules in @/lib/meetings/book.
 *
 *   briefing     "The *minutes*." and the digest (when chapter meets next, the meetings on
 *                the books this term, turnout, the ones still without minutes); Add meeting
 *                (MANAGE_EVENTS); Ask about past meetings
 *   on deck      the next meeting (~/meetings/Book OnDeck): attendance block, excuses
 *                waiting (opens the review), check-in / Take attendance, minutes, Edit
 *   past         the book, newest first, with All / No minutes / Under 70% tabs
 *   day one      nothing on the calendar: "Every meeting, *written down*.", three pictures,
 *                Add your first meeting (officers)
 *
 * Not here: Templates (agenda templates are built on the web).
 */
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { bookTabs, digestRuns, onDeckRoll, relativeWhen, splitMeetings, type PastFilter } from "@/lib/meetings/book";
import { timeText } from "~/dash/UpNextCard";
import { useCalendar } from "~/data/calendar";
import { localDay, useLiveCheckIn } from "~/data/home";
import { useAttendanceSummary, usePendingExcuses } from "~/data/meetings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon } from "~/icons/Icon";
import { Book, ChapterDayOne, OnDeck, SecHead } from "~/meetings/Book";
import { EventForm } from "~/meetings/EventForm";
import { ExcuseReview } from "~/meetings/ExcuseReview";
import { canAttendance, canEvents, isMeeting } from "~/meetings/model";
import { TakeAttendance } from "~/meetings/TakeAttendance";
import { byStart, overAt, startClock } from "~/meetings/time";
import { navLabel } from "~/more/model";
import { Screen } from "~/shell/Screen";
import { ErrorState, SkeletonCard, SkeletonList } from "~/shell/states";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { useNow } from "~/today/live";
import { PageBrief } from "~/ui/PageBrief";
import { T } from "~/ui/T";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Meetings() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const me = entry?.me ?? null;
  const cal = useCalendar();
  const sum = useAttendanceSummary();
  const officerE = !!me && canEvents(me);
  const officerA = !!me && canAttendance(me);
  const pending = usePendingExcuses(officerA);
  const live = useLiveCheckIn(false);
  const [filter, setFilter] = useState<PastFilter>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const today = localDay();
  const now = useNow(true, false);
  const minute = Math.floor(now / 60_000);

  const rows = useMemo(() => new Map((sum.data ?? []).map(r => [r.calendarEventId, r] as const)), [sum.data]);
  const meetings = useMemo(() => (cal.data ? cal.data.filter(isMeeting) : null), [cal.data]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const split = useMemo(() => (meetings ? splitMeetings(meetings, byStart, overAt(today, now)) : null), [meetings, today, minute]);
  if (!me) return null;

  const term = me.org?.activeTerm ?? null;
  const next = split?.next ?? null;
  const dayOne = !!meetings && meetings.length === 0;
  const book = split ? bookTabs(split.past, rows) : null;
  const liveHere = live.data && next && live.data.event.id === next.id && live.data.state !== "closed" ? live.data : null;
  const pendingHere = next ? (pending.data ?? []).filter(p => p.status === "pending" && p.calendarEventId === next.id) : [];
  const refresh = () => Promise.all([cal.refetch(), sum.refetch(), officerA ? pending.refetch() : null, live.refetch()]);
  const open = (id: number) => router.push(`/more/meeting/${id}`);
  const d = new Date();
  const pill = `${DOW[d.getDay()]} · ${MON[d.getMonth()]} ${d.getDate()}`;

  const digest = split && meetings && !dayOne
    ? digestRuns({ count: meetings.length, next, past: split.past, rows, term, today, start: startClock }).map(r => ({ text: r.text, bold: r.b }))
    : null;

  let body: React.ReactNode;
  if (!split || !book) {
    body = cal.isError ? <ErrorState title="Couldn't load the meetings." error={cal.error} onRetry={() => void cal.refetch()} /> : <><SkeletonCard height={260} /><SkeletonList count={4} /></>;
  } else if (dayOne) {
    body = <ChapterDayOne canAdd={officerE} onAdd={() => setAdding(true)} />;
  } else {
    body = (
      <>
        {next ? (
          <View style={{ gap: 14 }}>
            <SecHead title="On deck" right={relativeWhen(next.date, today)} />
            <OnDeck event={next} today={today} start={startClock(next)} time={timeText(next)}
              roll={onDeckRoll(next, rows.get(next.id), liveHere, today)}
              pendingNames={pendingHere.map(p => p.brotherName)} canAttend={officerA} canEvents={officerE} live={!!liveHere}
              onCheckIn={() => router.push("/checkin")} onTake={() => setRolling(true)} onMinutes={() => open(next.id)}
              onEdit={() => setEditing(true)} onExcuses={() => setReviewing(next.id)} onOpen={() => open(next.id)} />
          </View>
        ) : null}
        <Book past={split.past} shown={book.lists[filter]} tabs={book.tabs} filter={filter} onFilter={setFilter} rows={rows} onOpen={e => open(e.id)} />
      </>
    );
  }

  return (
    <Screen title={navLabel(me, "Chapter")} back="More" onRefresh={refresh}>
      {dayOne ? (
        <PageBrief pill={pill} kicker="Chapter Meetings" lead="Every meeting, " mark="written down" markTone="sky"
          sub="Add the meeting. While it happens, someone types the notes. Afterwards everyone can read what was decided, who came, and who owes what." />
      ) : (
        <PageBrief pill={pill} kicker="Chapter Meetings" lead="The " mark="minutes" markTone="sky" digest={digest} />
      )}
      <View style={styles.acts}>
        {officerE ? (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button"
            style={({ pressed }) => [styles.add, { backgroundColor: c.ink }, pressed ? { transform: [{ translateX: 1 }, { translateY: 1 }] } : hard(c.pastel.lilac.fill, 3)]}>
            <Icon name="plus" size={15} color={c.paper} />
            <T v="button" size={14} color={c.paper}>Add meeting</T>
          </Pressable>
        ) : null}
        {!dayOne ? (
          <Pressable onPress={() => router.push("/ask")} accessibilityRole="button" accessibilityHint="Opens Ask Chapt"
            style={({ pressed }) => [styles.ask, { borderColor: c.line2, backgroundColor: pressed ? c.pastel.lilac.soft : "transparent" }]}>
            <Icon name="spark" size={14} color={c.pastel.lilac.ink} />
            <T v="callout" size={14} color={c.ink3}>Ask about past meetings</T>
          </Pressable>
        ) : null}
      </View>
      {body}

      {officerE ? <EventForm open={adding} kind="meeting" onClose={() => setAdding(false)} onSaved={id => open(id)} /> : null}
      {officerE && next ? <EventForm open={editing} kind="meeting" editing={next} onClose={() => setEditing(false)} /> : null}
      {officerA ? <TakeAttendance event={rolling ? next : null} onClose={() => setRolling(false)} /> : null}
      {officerA ? <ExcuseReview open={reviewing != null} eventId={reviewing ?? undefined} onClose={() => setReviewing(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  acts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  add: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999 },
  ask: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed" },
});
