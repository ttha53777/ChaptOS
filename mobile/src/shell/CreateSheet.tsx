/**
 * Create: the tab bar's sheet (the web's MobileTabBar `.mtb-sheet`). Same tiles, order and
 * gates as the web, so a chapter sees the same choices on either screen. A tile appears
 * once its form exists on the phone (nothing here opens a dead end):
 *
 *   Reimbursement   workflow "finance"; the request sheet (~/money/RequestSheet)
 *   Log excuse      always, as on the web; "Which meeting?" (the web's "Select Event to
 *                   Excuse": required events I wasn't at and haven't an excuse in for),
 *                   then the excuse pad (~/timeline/Attendance ExcuseSheet + fileExcuse)
 *
 *   Open check-in   the inked hero above the grid (MANAGE_ATTENDANCE): which event, then
 *                   open its window (~/meetings/CheckIn)
 *   New event       workflow "events" + MANAGE_EVENTS (the route's gate; the web shows it
 *                   to everyone and lets the server refuse): ~/meetings/EventForm
 *   Log excuse      officers (MANAGE_ATTENDANCE) also pick who it's for; theirs is
 *                   approved as it's filed (POST /api/excuses with brotherId)
 *   Add task        MANAGE_TASKS, as on the web: the task sheet (~/tasks/TaskForm)
 *   Pinned note     MANAGE_ANNOUNCEMENTS + the operations "announcement" section on, as on
 *                   the web: the note editor (~/today/NoteEditor), with the current note in
 *   Log expense     workflow "finance" + MANAGE_TREASURY (the route's gate; the web shows
 *   Log revenue     them to every admin and lets the server refuse): ~/money/TxForm
 *   IG post         workflow "communications" + MANAGE_INSTAGRAM (the route's gate; the web
 *                   shows it to everyone): Media's post form (~/media/sheets PostForm)
 *
 * Every tile on the web's phone bar now has its phone form.
 *
 * The tiles (`.mcr-it`) rise 14pt and fade in one after another, 40ms apart (the mock's
 * `.qa-i`); a press presses the tile in and inks its border. The chosen form stacks over
 * Create, and Create folds away with it once the thing is sent; backing out of the form
 * lands back on Create.
 *
 * Reduced motion: the tiles fade in together, in place.
 */
import type { Brother, CalendarEvent } from "@/lib/api-types";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { useCalendar, useMyAttendance, useMyExcuses } from "~/data/calendar";
import { localDay } from "~/data/home";
import { excuseFor } from "~/data/meetings";
import { useAnnouncement } from "~/data/home";
import { keepsBooks, useCategories, visibleExpense } from "~/data/money";
import { TxForm } from "~/money/TxForm";
import { TaskForm } from "~/tasks/TaskForm";
import { viewerOf } from "~/tasks/model";
import { canPin, NoteEditor } from "~/today/NoteEditor";
import { useRoster } from "~/data/tasks";
import { canManage as canMedia } from "~/media/model";
import { PostForm } from "~/media/sheets";
import { errorMessage } from "~/api/errors";
import { OpenCheckInSheet } from "~/meetings/CheckIn";
import { EventForm } from "~/meetings/EventForm";
import { canAttendance, canEvents } from "~/meetings/model";
import { useEntryOf } from "~/entry/EntryContext";
import { NO_TERM_LINE, useNoTerm } from "~/entry/term";
import { Icon, type IconName } from "~/icons/Icon";
import { RequestSheet } from "~/money/RequestSheet";
import { haptics } from "~/motion/haptics";
import { excusable } from "~/more/model";
import { Avatar, Tile } from "~/paper/bits";
import { alpha, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { ExcuseSheet, fileExcuse } from "~/timeline/Attendance";
import { daysFrom, monthDay, relDay, weekdayShort } from "~/today/time";
import { T } from "~/ui/T";
import { Sheet } from "./sheets";
import { SkeletonList } from "./states";
import { toast } from "./toast";

type Key = "event" | "task" | "announcement" | "expense" | "revenue" | "reimburse" | "excuse" | "ig";

/** The web's FACE: label, glyph, tone. */
const FACE: Record<Key, { label: string; icon: IconName; tone: Tone }> = {
  event:        { label: "New event", icon: "cal", tone: "sky" },
  task:         { label: "Add task", icon: "box", tone: "peach" },
  announcement: { label: "Pinned note", icon: "pin", tone: "butter" },
  expense:      { label: "Log expense", icon: "wallet", tone: "rose" },
  revenue:      { label: "Log revenue", icon: "cash", tone: "mint" },
  reimburse: { label: "Reimbursement", icon: "receipt", tone: "butter" },
  excuse:    { label: "Log excuse", icon: "form", tone: "lilac" },
  ig:        { label: "IG post", icon: "camera", tone: "peach" },
};

export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useEntryOf("ready")?.me ?? null;
  const [form, setForm] = useState<Key | "checkin" | null>(null);
  const finance = !!me?.org?.enabledWorkflows.includes("finance");
  const events = !!me && !!me.org?.enabledWorkflows.includes("events") && canEvents(me);
  const officerA = !!me && canAttendance(me);
  const cats = useCategories(open && finance);
  // The web shows "IG post" to everyone with the communications workflow, but only
  // MANAGE_INSTAGRAM can save one; the phone offers it only to people who can.
  const ig = !!me && !!me.org?.enabledWorkflows.includes("communications") && canMedia(me);
  const cal = useCalendar();
  const tasks = !!me && viewerOf(me).canManage;
  const pin = !!me && canPin(me);
  const note = useAnnouncement();
  const books = finance && !!me && keepsBooks(me);

  // the web's order: event, task, announcement, then expense, revenue, reimburse, excuse, ig
  const keys: Key[] = [
    ...(events ? ["event" as const] : []),
    ...(tasks ? ["task" as const] : []),
    ...(pin ? ["announcement" as const] : []),
    ...(books ? ["expense" as const, "revenue" as const] : []),
    ...(finance ? ["reimburse" as const] : []),
    "excuse",
    ...(ig ? ["ig" as const] : []),
  ];
  useEffect(() => { if (!open) setForm(null); }, [open]);

  const done = () => { setForm(null); onClose(); };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Create" icon="plus" tone="lilac" accessibilityLabel="Create">
        {officerA ? <CheckInHero open={open} onPress={() => setForm("checkin")} /> : null}
        <View style={styles.grid}>
          {keys.map((k, i) => (
            <CreateTile key={k} k={k} i={i} open={open} onPress={() => setForm(k)} />
          ))}
          {/* keep a short last row left-aligned in the three-up grid */}
          {Array.from({ length: (3 - (keys.length % 3)) % 3 }, (_, i) => <View key={`f${i}`} style={styles.filler} />)}
        </View>
      </Sheet>

      {me && finance ? (
        <RequestSheet open={open && form === "reimburse"} onClose={() => setForm(null)} onSent={done}
          meId={me.id} categories={visibleExpense(cats.data)} />
      ) : null}
      <ExcuseFlow open={open && form === "excuse"} onBack={() => setForm(null)} onFiled={done} officer={officerA} />
      {events ? <EventForm open={open && form === "event"} kind="event" onClose={() => setForm(null)} onSaved={done} /> : null}
      {tasks ? <TaskForm open={open && form === "task"} task={null} onClose={() => setForm(null)} onSaved={done} /> : null}
      {pin ? <NoteEditor open={open && form === "announcement"} current={note.data} onClose={() => setForm(null)} onSaved={done} /> : null}
      {books ? (
        <TxForm open={open && (form === "expense" || form === "revenue")} kind={form === "revenue" ? "income" : "expense"} tx={null}
          cats={cats.data ?? []} onClose={() => setForm(null)} onSaved={done} />
      ) : null}
      {ig ? (
        <PostForm open={open && form === "ig"} post={null} events={cal.data ?? []} onClose={() => setForm(null)} onSaved={done} />
      ) : null}
      {officerA ? <OpenCheckInSheet open={open && form === "checkin"} onClose={() => setForm(null)} onOpened={done} /> : null}
    </>
  );
}

/* ── a tile ───────────────────────────────────────────────────────────────────── */

function CreateTile({ k, i, open, onPress }: { k: Key; i: number; open: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const f = FACE[k];
  const shown = useSharedValue(0);
  const press = useSharedValue(0);
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (!open) { shown.value = 0; return; }
    shown.value = m.reduced
      ? withTiming(1, m.timing(180, "out"))
      : withDelay(m.t(90 + i * 40), withSpring(1, m.spring("settle")));
  }, [open, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.4),
    transform: [
      { translateY: m.reduced ? 0 : 14 * (1 - shown.value) },
      { scale: 1 - 0.04 * press.value },
    ],
  }));

  return (
    <Animated.View style={[styles.cell, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { setDown(true); press.value = withTiming(1, m.timing(80, "out")); }}
        onPressOut={() => { setDown(false); press.value = withTiming(0, m.timing(m.reduced ? 90 : 240, "spring")); }}
        accessibilityRole="button"
        accessibilityLabel={f.label}
        style={[styles.tile, { borderColor: down ? c.ink : c.line, backgroundColor: down ? c.card : c.paper }]}
      >
        <Tile icon={f.icon} tone={f.tone} size={40} rotate={-5} />
        <T v="callout" numberOfLines={1} style={styles.tileLabel}>{f.label}</T>
      </Pressable>
    </Animated.View>
  );
}

/** The web's `.mcr-hero`: an inked ticket over the grid, arriving just before the tiles. */
function CheckInHero({ open, onPress }: { open: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    if (!open) { shown.value = 0; return; }
    shown.value = m.reduced ? withTiming(1, m.timing(180, "out")) : withDelay(m.t(50), withSpring(1, m.spring("settle")));
  }, [open, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value * 1.4), transform: [{ translateY: m.reduced ? 0 : 12 * (1 - shown.value) }] }));
  return (
    <Animated.View style={[{ marginBottom: 12 }, style]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open check-in. Members check themselves in from their phones"
        style={({ pressed }) => [styles.hero, { backgroundColor: c.ink, borderColor: c.ink, boxShadow: `${pressed ? 1 : 3}px ${pressed ? 1 : 3}px 0 ${c.note.fill.mint}` },
          pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
        <View style={[styles.heroIc, { backgroundColor: c.note.fill.mint }]}><Icon name="check" size={18} color={c.note.ink} /></View>
        <View style={{ flex: 1, gap: 1 }}>
          <T v="subhead" color={c.paper}>Open check-in</T>
          <T v="meta" color={alpha(c.paper, 0.7)}>Members check themselves in from their phones</T>
        </View>
        <Icon name="arrow-r" size={16} color={alpha(c.paper, 0.75)} />
      </Pressable>
    </Animated.View>
  );
}

/* ── Log excuse: which meeting, then the pad ──────────────────────────────────── */

function ExcuseFlow({ open, onBack, onFiled, officer }: { open: boolean; onBack: () => void; onFiled: () => void; officer: boolean }) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const noTerm = useNoTerm();
  const cal = useCalendar();
  const att = useMyAttendance();
  const ex = useMyExcuses();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState("");
  const [who, setWho] = useState<Brother | null>(null);
  const [choosing, setChoosing] = useState(false);
  const today = localDay();
  useEffect(() => { if (open) { setEvent(null); setDraft(""); setWho(null); setChoosing(false); } }, [open]);

  const loaded = cal.data && att.data && ex.data;
  const termStart = me?.org?.activeTerm?.startDate;
  // for someone else: the term's required meetings (their record is the server's to check)
  const list = !loaded ? [] : who
    ? cal.data!.filter(e => e.mandatory && (!termStart || e.date >= termStart)).sort((a, b) => a.date.localeCompare(b.date))
    : excusable(cal.data!, att.data!.attendedEventIds, ex.data!, today, termStart);
  const anyRequired = !!cal.data?.some(e => e.mandatory);
  const ahead = list.filter(e => e.date >= today);
  const missed = list.filter(e => e.date < today).reverse();

  const file = (reason: string) => {
    const ev = event;
    if (!ev) return;
    setEvent(null);
    onFiled();
    if (who) {
      const name = who.name;
      excuseFor(ev.id, who.id, reason).then(
        () => { haptics.success(); toast.show(`${name} is excused`, { detail: `${ev.title} · ${monthDay(ev.date)}` }); },
        e => { haptics.error(); toast.error(`Couldn't excuse ${name}`, { detail: errorMessage(e) }); },
      );
      return;
    }
    fileExcuse(ev, reason, {
      ok: () => { haptics.soft(); toast.show("Excuse filed", { detail: `${ev.title} · an officer will look at it.` }); },
    });
  };

  return (
    <>
      <Sheet open={open} onClose={onBack} title="Which meeting?" kicker={who ? `Log excuse · for ${who.name}` : "Log excuse"} tone="butter" icon="form">
        {officer && !noTerm ? (
          <View style={styles.forRow}>
            <T v="label" color={c.ink3}>For</T>
            <ForChip label="Me" on={!who} onPress={() => { haptics.select(); setWho(null); }} />
            <ForChip label={who ? who.name : "Someone else"} on={!!who} icon={who ? undefined : "people"} onPress={() => { haptics.select(); setChoosing(true); }} />
          </View>
        ) : null}
        {noTerm ? (
          <Quiet icon="cal" line={NO_TERM_LINE} />
        ) : !loaded ? (
          cal.isError || att.isError || ex.isError
            ? <Quiet icon="alert" line="Couldn't load the calendar. Try again in a moment." />
            : <SkeletonList count={3} />
        ) : !list.length ? (
          <Quiet icon="check" tone="mint" line={!anyRequired ? "No required meetings on the calendar yet." : who ? "No required meetings this term." : "Nothing to excuse. You were at every required meeting."} />
        ) : (
          <View style={{ gap: 16 }}>
            {ahead.length ? <Section label="Coming up" events={ahead} today={today} onPick={e => { haptics.select(); setEvent(e); }} /> : null}
            {missed.length ? <Section label="Missed" events={missed} today={today} onPick={e => { haptics.select(); setEvent(e); }} /> : null}
            <T v="meta" color={c.ink3}>{who ? "Filed by you, it's approved right away. If they were marked here, it says so." : "Only officers who take attendance read your reason."}</T>
          </View>
        )}
      </Sheet>
      {event ? (
        <ExcuseSheet open={open && !!event} event={event} draft={draft} setDraft={setDraft} onClose={() => setEvent(null)} onSubmit={file} forName={who?.name} />
      ) : null}
      {officer ? <PersonPicker open={open && choosing} meId={me?.id ?? 0} onClose={() => setChoosing(false)} onPick={b => { setWho(b); setChoosing(false); }} /> : null}
    </>
  );
}

function ForChip({ label, on, icon, onPress }: { label: string; on: boolean; icon?: IconName; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`For ${label}`}
      style={[styles.forChip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.butter.soft : c.card }]}>
      {icon ? <Icon name={icon} size={13} color={c.ink3} /> : null}
      <T v="pill" color={on ? c.ink : c.ink2} numberOfLines={1} style={{ maxWidth: 150 }}>{label}</T>
    </Pressable>
  );
}

/** Who it's for: the roster with a find line, me left out. */
function PersonPicker({ open, meId, onClose, onPick }: { open: boolean; meId: number; onClose: () => void; onPick: (b: Brother) => void }) {
  const { c } = useTheme();
  const roster = useRoster(open);
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const people = (roster.data ?? []).filter(b => b.id !== meId).sort((a, b) => a.name.localeCompare(b.name));
  const shown = q.trim() ? people.filter(b => b.name.toLowerCase().includes(q.trim().toLowerCase())) : people;
  return (
    <Sheet open={open} onClose={onClose} size="tall" title="Who's it for?" kicker="Log excuse" tone="butter" icon="people">
      {!roster.data ? <SkeletonList count={5} /> : (
        <View style={{ gap: 12 }}>
          <View style={[styles.find, { borderColor: c.line2, backgroundColor: c.card }]}>
            <Icon name="search" size={15} color={c.ink3} />
            <TextInput value={q} onChangeText={setQ} placeholder="Find someone" placeholderTextColor={c.faint} accessibilityLabel="Find someone" style={[styles.findIn, { color: c.ink }]} />
          </View>
          <View style={[styles.people, { borderColor: c.line, backgroundColor: c.card }]}>
            {shown.map((b, i) => (
              <Pressable key={b.id} onPress={() => { haptics.select(); onPick(b); }} accessibilityRole="button" accessibilityLabel={b.name}
                style={({ pressed }) => [styles.person, i > 0 && { borderTopWidth: 1, borderTopColor: c.lineSoft }, pressed && { backgroundColor: c.paper2 }]}>
                <Avatar name={b.name} uri={b.avatarUrl ?? null} tone="butter" style={{ width: 32, height: 32, borderRadius: 16 }} />
                <View style={{ flex: 1 }}>
                  <T v="callout" numberOfLines={1}>{b.name}</T>
                  {b.role ? <T v="meta" color={c.ink3} numberOfLines={1}>{b.role}</T> : null}
                </View>
                <Icon name="chev-r" size={14} color={c.ink3} />
              </Pressable>
            ))}
            {!shown.length ? <T v="meta" color={c.ink3} style={{ padding: 14 }}>No one by that name.</T> : null}
          </View>
        </View>
      )}
    </Sheet>
  );
}

function Section({ label, events, today, onPick }: { label: string; events: CalendarEvent[]; today: string; onPick: (e: CalendarEvent) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T v="label" color={c.ink3} accessibilityRole="header">{label}</T>
      {events.slice(0, 6).map(e => <MeetingRow key={e.id} e={e} today={today} onPress={() => onPick(e)} />)}
    </View>
  );
}

/** A meeting as a torn ticket: a date stub, a perforation, then the name and when. */
function MeetingRow({ e, today, onPress }: { e: CalendarEvent; today: string; onPress: () => void }) {
  const { c } = useTheme();
  const past = e.date < today;
  const d = daysFrom(today, e.date);
  const when = past ? `Missed · ${monthDay(e.date)}` : d <= 6 ? `${relDay(today, e.date)}${e.time ? ` · ${e.time}` : ""}` : `${monthDay(e.date)}${e.time ? ` · ${e.time}` : ""}`;
  const p = c.pastel[past ? "rose" : "butter"];
  const day = Number(e.date.slice(8, 10));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${e.title}, ${when}`}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card, borderColor: pressed ? c.ink : c.line, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      <View style={[styles.stub, { backgroundColor: p.soft }]}>
        <T v="kicker" color={p.ink} style={{ fontSize: 9.5 }}>{weekdayShort(e.date)}</T>
        <T v="title" color={c.ink} style={{ fontSize: 21, lineHeight: 24 }}>{day}</T>
      </View>
      <View style={[styles.perf, { borderColor: alpha(c.ink, 0.22) }]} />
      <View style={{ flex: 1, gap: 2, paddingVertical: 11 }}>
        <T v="callout" numberOfLines={1}>{e.title}</T>
        <T v="meta" color={past ? p.ink : c.ink3} numberOfLines={1}>{when}</T>
      </View>
      <Icon name="chev-r" size={15} color={c.ink3} />
    </Pressable>
  );
}

function Quiet({ icon, line, tone = "butter" }: { icon: IconName; line: string; tone?: Tone }) {
  const { c } = useTheme();
  return (
    <View style={[styles.quiet, { borderColor: c.line2 }]}>
      <Tile icon={icon} tone={tone} rotate={-4} />
      <T v="body" color={c.ink2} style={{ flex: 1 }}>{line}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  cell: { flexBasis: "30%", flexGrow: 1 },
  filler: { flexBasis: "30%", flexGrow: 1 },
  tile: { alignItems: "center", gap: 9, paddingTop: 16, paddingBottom: 13, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1.5 },
  tileLabel: { fontSize: 13, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 14, borderWidth: 1.5, borderRadius: 14, overflow: "hidden", minHeight: 58 },
  stub: { width: 54, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 1 },
  perf: { alignSelf: "stretch", borderLeftWidth: 1.5, borderStyle: "dashed", marginVertical: 6, marginLeft: -12 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5 },
  heroIc: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  forRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  forChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, minHeight: 34 },
  find: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 44 },
  findIn: { flex: 1, fontSize: 16, paddingVertical: 8 },
  people: { borderWidth: 1.5, borderRadius: 16, overflow: "hidden" },
  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 52 },
  quiet: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
});
