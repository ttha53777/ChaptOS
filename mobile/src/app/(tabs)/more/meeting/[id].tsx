/**
 * One meeting (the web's MeetingDetailOverlay on a phone, "the minutes sheet"), pushed from
 * Meetings, with the words and badges from @/lib/meetings/book:
 *
 *   bar        title, ⋯ (Share as text · Edit meeting · Delete meeting, MANAGE_EVENTS)
 *   ticket     month/day stub · weekday · time · room · REQUIRED / OPTIONAL stamp, and the
 *              roll ("10 of 11 present") or, while it runs, the clock bar
 *   tabs       Minutes · Summary (open action items, "!" when the minutes moved on) ·
 *              Who came (present count)
 *   Minutes    the legal pad, sections numbered; officers write unshared minutes here
 *              (autosaved, PATCH /api/calendar/[id] { description } → MinutesSaved).
 *              Shared minutes are written in the web's live editor.
 *   Summary    gist, decisions, action items (mine / an officer's are tickable)
 *   Who came   my line + excuse (app keep), check-in desk for officers (app keep), then
 *              Present / Excused / Absent as name chips
 *   dock       Write / Done + Summarize; on Summary, Minutes + Re-summarize; on Who came,
 *              Take / Edit attendance. Summarize is for everyone, as on the web.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import type { CalendarEvent, MeetingActionItem } from "@/lib/api-types";
import { attLabel, dateParts, dueLabel, fmtMins, hasNotes, meetingProgress, notesSummaryStale, summaryBadge, taken } from "@/lib/meetings/book";
import { minutesBeyondAgenda } from "@/lib/agenda-template";
import { errorMessage } from "~/api/errors";
import { timeText } from "~/dash/UpNextCard";
import { useCalendar, useEventAttendance, useMeetingSummary } from "~/data/calendar";
import { localDay } from "~/data/home";
import { saveMinutes, summarizeMeeting, useAttendanceSummary, usePendingExcuses } from "~/data/meetings";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { WindowPanel } from "~/meetings/CheckIn";
import { DeleteSheet } from "~/meetings/DeleteSheet";
import { EventForm } from "~/meetings/EventForm";
import { ExcuseReview } from "~/meetings/ExcuseReview";
import { MinutesText } from "~/meetings/MinutesText";
import { canAttendance, canEvents } from "~/meetings/model";
import { TakeAttendance } from "~/meetings/TakeAttendance";
import { spanOf } from "~/meetings/time";
import { navLabel } from "~/more/model";
import { haptics } from "~/motion/haptics";
import { initials } from "~/paper/bits";
import { LegalPad, PAD_LINE } from "~/paper/stationery";
import { Screen } from "~/shell/Screen";
import { Sheet } from "~/shell/sheets";
import { EmptyState, ErrorState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { CheckBox, StrikeTitle } from "~/tasks/bits";
import { useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { AttendanceBlock } from "~/timeline/Attendance";
import { tickActionItem } from "~/timeline/Minutes";
import { useNow } from "~/today/live";
import { T } from "~/ui/T";
import { pressedDim } from "~/motion/press";

type Tab = "min" | "sum" | "att";

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
  const [tab, setTab] = useState<Tab>("min");
  const [writing, setWriting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [summing, setSumming] = useState(false);
  const now = useNow(true, false);
  const today = localDay();

  if (!me) return null;
  const back = navLabel(me, "Chapter");
  const event = cal.data?.find(e => e.id === Number(id)) ?? null;
  const refresh = () => Promise.all([cal.refetch(), rows.refetch(), officerA ? pending.refetch() : null]);

  if (!event) {
    return (
      <Screen title={back} back={back} onRefresh={refresh}>
        {cal.isPending ? <SkeletonCard height={180} /> : <EmptyState title="This meeting isn't on the calendar." line="It may have been deleted. Pull to refresh, or go back to the list." />}
      </Screen>
    );
  }

  const row = rows.data?.find(r => r.calendarEventId === event.id);
  const waiting = (pending.data ?? []).filter(x => x.status === "pending" && x.calendarEventId === event.id).length;
  const filed = hasNotes(event);
  const shared = !!(event.notesInitialized || event.notesCollaborationEnabled);
  const canWrite = officerE && !shared;
  const badge = summaryBadge(event, summing);
  const presentN = taken(row) ? row.present : 0;
  const { start, end } = spanOf(event);
  const clock = meetingProgress(start, end, new Date(now));

  const summarize = async () => {
    if (summing) return;
    setSumming(true);
    try {
      const r = await summarizeMeeting(event.id);
      const n = Array.isArray((r.notesSummaryData as { actions?: unknown[] } | null)?.actions) ? (r.notesSummaryData as { actions: unknown[] }).actions.length : 0;
      haptics.success();
      toast.show("Summary ready", { detail: `${n} action ${n === 1 ? "item" : "items"}.` });
      setTab("sum");
    } catch (e) {
      haptics.error();
      toast.error("Couldn't summarize", { detail: errorMessage(e) });
    } finally { setSumming(false); }
  };

  const shareText = async () => {
    setMenu(false);
    const p = dateParts(event.date);
    const body = minutesBeyondAgenda(event) || (event.description ?? "").trim() || "No minutes filed.";
    try { await Share.share({ title: event.title, message: `${event.title} — ${p.dow} ${p.mon} ${p.dnum}\n\n${body}` }); }
    catch { toast.show("Couldn't open the share sheet."); }
  };

  const sumLabel = summing ? "Summarizing…" : event.notesSummaryData ? "Re-summarize" : "Summarize";
  const sumBtn = filed ? <DockBtn label={sumLabel} icon="spark" onPress={() => void summarize()} disabled={summing} grow /> : null;
  let dock: React.ReactNode = null;
  if (tab === "min") {
    dock = canWrite || sumBtn ? (
      <>
        {canWrite ? <DockBtn label={writing ? "Done" : "Write"} icon={writing ? "check" : "pencil"} ink onPress={() => setWriting(w => !w)} grow={!sumBtn} /> : null}
        {writing ? null : sumBtn}
      </>
    ) : null;
  } else if (tab === "sum") {
    dock = <><DockBtn label="Minutes" icon="pencil" ink onPress={() => setTab("min")} />{sumBtn}</>;
  } else if (officerA && event.mandatory) {
    dock = <DockBtn label={taken(row) ? "Edit attendance" : "Take attendance"} icon="check" ink onPress={() => setRolling(true)} grow />;
  }

  return (
    <Screen title={event.title} back={back} onRefresh={refresh}
      right={
        <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="More" hitSlop={8} style={({ pressed }) => [styles.more, pressed && pressedDim]}>
          <Icon name="dots" size={18} color={c.ink2} />
        </Pressable>
      }
      footer={dock ? <View style={styles.dock}>{dock}</View> : undefined}>
      <MeetingTicket event={event} label={attLabel(event, row, officerA)} time={timeText(event)} clock={clock} />

      <View style={[styles.tabs, { backgroundColor: c.paper2, borderColor: c.line }]} accessibilityRole="tablist">
        {([["min", "Minutes", null], ["sum", "Summary", badge], ["att", "Who came", presentN ? { text: String(presentN), warn: false } : null]] as const).map(([k, label, b]) => {
          const on = tab === k;
          const mint = k === "att";
          return (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { haptics.select(); setTab(k); }}
              style={[styles.tab, on && [{ backgroundColor: c.card, borderColor: c.line2 }, hard(c.line, 0, 1)]]}>
              <T v="callout" size={14.5} color={on ? c.ink : c.ink3} style={on ? { fontWeight: "600" } : undefined}>{label}</T>
              {b ? (
                <View style={[styles.badge, { backgroundColor: b.warn ? c.pastel.rose.soft : mint ? c.pastel.mint.soft : c.pastel.lilac.soft }]}>
                  <T v="mono" size={11} color={b.warn ? c.pastel.rose.ink : mint ? c.pastel.mint.ink : c.pastel.lilac.ink} style={{ fontWeight: "700" }}>{b.text}</T>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab === "min" ? (
        writing && canWrite ? <MinutesEditor event={event} onShared={() => setWriting(false)} />
          : <MinutesTab event={event} filed={filed} officer={officerE} shared={shared} canWrite={canWrite} past={event.date < today} />
      ) : tab === "sum" ? (
        <SummaryTab event={event} meId={me.id} />
      ) : (
        <View style={{ gap: 14 }}>
          {event.mandatory ? <AttendanceBlock event={event} meId={me.id} today={today} mineOnly /> : null}
          {officerA && event.mandatory ? <WindowPanel event={event} /> : null}
          {officerA && waiting ? (
            <Pressable onPress={() => setReviewing(true)} accessibilityRole="button"
              style={({ pressed }) => [styles.exc, { backgroundColor: pressed ? c.pastel.butter.fill : c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
              <Icon name="form" size={15} color={c.pastel.butter.ink} />
              <T v="callout" size={13.5} color={c.pastel.butter.ink} style={{ flex: 1 }}>{`${waiting} excuse${waiting === 1 ? "" : "s"} waiting for review`}</T>
              <Icon name="chev-r" size={13} color={c.pastel.butter.ink} />
            </Pressable>
          ) : null}
          <WhoCameTab event={event} />
        </View>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} size="fit" title={event.title} kicker="Meeting" icon="dots" tone="sky">
        <View style={{ gap: 4 }}>
          <MenuRow icon="out" label="Share as text" onPress={() => void shareText()} />
          {officerE ? <MenuRow icon="pencil" label="Edit meeting" onPress={() => { setMenu(false); setEditing(true); }} /> : null}
          {officerE ? <MenuRow icon="trash" label="Delete meeting" danger onPress={() => { setMenu(false); setDeleting(true); }} /> : null}
        </View>
      </Sheet>
      {officerE ? <EventForm open={editing} kind="meeting" editing={event} onClose={() => setEditing(false)} /> : null}
      {officerA ? <TakeAttendance event={rolling ? event : null} onClose={() => setRolling(false)} /> : null}
      {officerA ? <ExcuseReview open={reviewing} eventId={event.id} onClose={() => setReviewing(false)} /> : null}
      {officerE ? <DeleteSheet event={deleting ? event : null} onClose={() => setDeleting(false)} onDeleted={() => router.back()} /> : null}
    </Screen>
  );
}

/* ── ticket ───────────────────────────────────────────────────────────────────── */

function MeetingTicket({ event, label, time, clock }: { event: CalendarEvent; label: string; time: string | null; clock: { mins: number; left: number; pct: number } | null }) {
  const { c } = useTheme();
  const p = dateParts(event.date);
  return (
    <View style={[styles.ticket, { backgroundColor: c.card, borderColor: c.ink }, hard(c.pastel.sky.fill, 4)]}>
      <View style={[styles.stub, { backgroundColor: c.pastel.sky.soft }]}>
        <T v="mono" size={11.5} color={c.pastel.sky.ink} style={{ fontWeight: "700", letterSpacing: 1.2 }}>{p.mon.toUpperCase()}</T>
        <T v="hero" size={30} ls={-0.04} lh={1.05}>{String(p.dnum)}</T>
      </View>
      <View style={{ flex: 1, padding: 14, gap: 8 }}>
        <View style={styles.tTop}>
          <T v="body" size={15.5} color={c.ink2}>{[p.dow, time].filter(Boolean).join(" · ")}</T>
          {event.location ? <T v="body" size={15.5} color={c.ink2} numberOfLines={1} style={{ flexShrink: 1 }}>{event.location}</T> : null}
        </View>
        <View style={styles.tBot}>
          <View style={[styles.stamp, event.mandatory ? { backgroundColor: c.ink, borderColor: c.ink } : { borderColor: c.line2 }]}>
            <T v="mono" size={10.5} color={event.mandatory ? c.paper : c.ink3} style={{ fontWeight: "700", letterSpacing: 1.4 }}>{event.mandatory ? "REQUIRED" : "OPTIONAL"}</T>
          </View>
          {clock ? (
            <View style={{ flex: 1, gap: 4 }}>
              <T v="mono" size={11} color={c.ink3}>{`${fmtMins(clock.mins)} in · ${clock.left} min left`}</T>
              <View style={[styles.cBar, { backgroundColor: c.lineSoft }]}><View style={{ width: `${clock.pct}%`, backgroundColor: c.pastel.sky.ink }} /></View>
            </View>
          ) : <T v="mono" size={12} color={c.ink3}>{label}</T>}
        </View>
      </View>
    </View>
  );
}

/* ── the tabs ─────────────────────────────────────────────────────────────────── */

function TabKicker({ label, tone }: { label: string; tone: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.kick}>
      <View style={[styles.kickRule, { backgroundColor: tone }]} />
      <T v="kicker" size={11} color={c.ink3}>{label}</T>
    </View>
  );
}

function MinutesTab({ event, filed, officer, shared, canWrite, past }: { event: CalendarEvent; filed: boolean; officer: boolean; shared: boolean; canWrite: boolean; past: boolean }) {
  const { c } = useTheme();
  const text = minutesBeyondAgenda(event) || (event.description ?? "");
  return (
    <View style={{ gap: 12 }}>
      <TabKicker label="Meeting minutes" tone={c.pastel.sky.border} />
      {filed || text.trim() ? <MinutesText text={filed ? text : event.description ?? ""} /> : (
        <View style={[styles.none, { borderColor: c.line2 }]}>
          <Icon name="doc" size={18} color={c.ink3} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="callout">{past ? "No minutes were filed." : "Nothing written yet."}</T>
            <T v="meta" color={c.ink3}>{canWrite ? "Tap Write to take them here; they save as you type." : officer && shared ? "These minutes are shared: write them on the web, where officers edit them together live." : "Once someone files them, they show up here."}</T>
          </View>
        </View>
      )}
      {filed && officer && shared ? <T v="meta" color={c.ink3}>Shared minutes are edited on the web, live with the other officers.</T> : null}
    </View>
  );
}

/** Unshared minutes, typed on the phone: saved 600ms after you stop, and when you leave. */
function MinutesEditor({ event, onShared }: { event: CalendarEvent; onShared: () => void }) {
  const { c } = useTheme();
  const [text, setText] = useState(event.description ?? "");
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  const saved = useRef(event.description ?? "");

  const flush = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const v = latest.current;
    if (v === saved.current) return;
    setState("saving");
    try {
      await saveMinutes(event.id, v);
      saved.current = v;
      setState(latest.current === v ? "saved" : "dirty");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setState("error");
      haptics.error();
      toast.error("Couldn't save the minutes", { detail: errorMessage(e) });
      if (status === 409) onShared();
    }
  };
  useEffect(() => () => { void flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (v: string) => {
    setText(v);
    latest.current = v;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.kickRow}>
        <TabKicker label="Writing the minutes" tone={c.pastel.sky.border} />
        <T v="mono" size={11} color={state === "error" ? c.pastel.rose.ink : c.ink3}>
          {state === "saving" ? "Saving…" : state === "dirty" ? "Edited" : state === "error" ? "Not saved" : "Saved"}
        </T>
      </View>
      <LegalPad>
        <TextInput value={text} onChangeText={onChange} multiline autoFocus={!text} scrollEnabled={false} textAlignVertical="top"
          placeholder={"## Opening\nCalled to order at …\n\n## Old business\n- …"} placeholderTextColor={c.ink3}
          accessibilityLabel="Minutes" onBlur={() => void flush()}
          style={[styles.input, { color: c.note.ink, lineHeight: PAD_LINE }]} />
      </LegalPad>
      <T v="meta" color={c.ink3}>Start a line with ## for a section, - for a point, [ ] for a to-do.</T>
    </View>
  );
}

function SummaryTab({ event, meId }: { event: CalendarEvent; meId: number }) {
  const { c } = useTheme();
  const q = useMeetingSummary(event.id);
  if (q.isPending) return <SkeletonCard lines={4} />;
  if (q.isError) return <ErrorState compact title="Couldn't load the summary." error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data.summary;
  if (!s) {
    return (
      <View style={[styles.none, { borderColor: c.pastel.lilac.border }]}>
        <Icon name="spark" size={18} color={c.pastel.lilac.ink} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="callout">No summary yet.</T>
          <T v="meta" color={c.ink3}>{hasNotes(event) ? "Summarize the minutes for the gist, what was decided and who owes what." : "Once there are minutes, they can be summarized."}</T>
        </View>
      </View>
    );
  }
  const at = q.data.summarizedAt ? new Date(q.data.summarizedAt) : null;
  const gen = at ? `Generated ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : null;
  const stale = notesSummaryStale(event);
  const today = localDay();
  const canTick = (a: MeetingActionItem) => q.data.canTickAll || a.brotherId === meId;
  return (
    <View style={[styles.sum, { backgroundColor: c.pastel.lilac.soft, borderColor: c.pastel.lilac.border }]}>
      <View style={styles.sumHead}>
        <View style={[styles.chip, { borderColor: c.pastel.lilac.border, backgroundColor: c.card }]}>
          <Icon name="spark" size={11} color={c.pastel.lilac.ink} />
          <T v="label" size={11} color={c.pastel.lilac.ink}>Summary</T>
        </View>
        {gen ? <T v="mono" size={11} color={c.ink3} style={{ flexShrink: 1 }}>{gen}</T> : null}
      </View>
      {stale ? <T v="meta" color={c.pastel.rose.ink}>Notes changed since — re-summarize to catch up.</T> : null}
      {s.gist ? <T v="heading" size={18.5} lh={1.35}>{s.gist}</T> : null}
      {s.decisions.length ? (
        <View style={{ gap: 8 }}>
          <TabKicker label="Decisions" tone={c.pastel.lilac.ink} />
          {s.decisions.map((d, i) => (
            <View key={i} style={styles.dec}>
              <View style={[styles.diamond, { backgroundColor: c.pastel.lilac.border }]} />
              <T v="body" size={15.5} style={{ flex: 1 }}>{d}</T>
            </View>
          ))}
        </View>
      ) : null}
      {s.actions.length ? (
        <View style={{ gap: 10 }}>
          <TabKicker label="Action items" tone={c.pastel.butter.ink} />
          {s.actions.map(a => {
            const late = !a.done && !!a.due && a.due < today;
            return (
              <View key={a.id} style={styles.item}>
                {canTick(a) ? <CheckBox done={a.done} tone="lilac" label={a.text} onPress={() => tickActionItem(event.id, a, !a.done)} />
                  : <View style={[styles.box, { borderColor: a.done ? c.pastel.lilac.ink : c.line2, backgroundColor: a.done ? c.pastel.lilac.ink : "transparent" }]} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <StrikeTitle struck={a.done} color={a.done ? c.ink3 : c.ink}>{a.text}</StrikeTitle>
                  <T v="meta" color={c.ink3}>
                    {a.brotherId === meId ? "You" : a.owner ?? "Nobody named"}
                    {a.due ? <>{" · "}{late ? <T v="meta" color={c.pastel.rose.ink} style={{ fontWeight: "700" }}>{`was due ${dueLabel(a.due)}`}</T> : `by ${dueLabel(a.due)}`}</> : null}
                  </T>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function WhoCameTab({ event }: { event: CalendarEvent }) {
  const { c } = useTheme();
  const q = useEventAttendance(event.id);
  if (!event.mandatory) return <T v="callout" color={c.ink3} align="center" style={{ padding: 18 }}>Optional meeting — no roll is taken.</T>;
  if (q.isPending) return <SkeletonCard lines={3} />;
  if (q.isError) return <ErrorState compact title="Couldn't load who came." error={q.error} onRetry={() => void q.refetch()} />;
  const groups = [
    { label: "Present", tone: c.pastel.mint.ink, names: q.data.attended.map(a => a.brotherName) },
    { label: "Excused", tone: c.pastel.butter.ink, names: q.data.excused.map(a => a.brotherName) },
    { label: "Absent", tone: c.pastel.rose.ink, names: q.data.unexcused.map(a => a.brotherName) },
  ].filter(g => g.names.length);
  return (
    <View style={[styles.att, { backgroundColor: c.card, borderColor: c.line }]}>
      <T v="kicker" size={11} color={c.ink3}>Attendance</T>
      {!groups.length ? <T v="body" color={c.ink3}>{q.data.checkInOpen ? "Check-in is open; nobody has tapped in yet." : "Nobody has been marked yet."}</T> : null}
      {groups.map(g => (
        <View key={g.label} style={{ gap: 8 }}>
          <View style={styles.gHead}>
            <View style={[styles.gDot, { backgroundColor: g.tone }]} />
            <T v="callout" size={15} color={g.tone} style={{ fontWeight: "700" }}>{g.label}</T>
            <T v="mono" size={12.5} color={c.ink3}>{String(g.names.length)}</T>
          </View>
          <View style={styles.chips}>
            {g.names.map((n, i) => (
              <View key={`${n}${i}`} style={[styles.nameChip, { borderColor: c.line2, backgroundColor: c.paper }]}>
                <View style={[styles.ini, { backgroundColor: c.paper2 }]}><T v="mono" size={10.5} color={c.ink3} style={{ fontWeight: "700" }}>{initials(n)}</T></View>
                <T v="body" size={14.5}>{n.split(" ")[0]}</T>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ── bits ─────────────────────────────────────────────────────────────────────── */

function DockBtn({ label, icon, ink, grow, disabled, onPress }: { label: string; icon: IconName; ink?: boolean; grow?: boolean; disabled?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const fg = ink ? c.paper : c.pastel.lilac.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [styles.dockBtn, grow && { flex: 1 }, ink ? { backgroundColor: c.ink, borderColor: c.ink } : { backgroundColor: c.card, borderColor: c.line2 },
        !pressed ? hard(ink ? c.pastel.sky.fill : c.pastel.lilac.soft, 3) : { transform: [{ translateX: 1 }, { translateY: 1 }] }, disabled && { opacity: 0.6 }]}>
      <Icon name={icon} size={16} color={fg} />
      <T v="button" size={15} color={fg}>{label}</T>
    </Pressable>
  );
}

function MenuRow({ icon, label, danger, onPress }: { icon: IconName; label: string; danger?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const col = danger ? c.pastel.rose.ink : c.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: c.paper2 }]}>
      <Icon name={icon} size={17} color={col} />
      <T v="callout" size={15.5} color={col}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  more: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  dock: { flexDirection: "row", gap: 10 },
  dockBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1.5 },
  ticket: { flexDirection: "row", borderWidth: 1.5, borderRadius: 20, overflow: "hidden" },
  stub: { width: 74, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  tTop: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 2 },
  tBot: { flexDirection: "row", alignItems: "center", gap: 12 },
  stamp: { borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  cBar: { height: 5, borderRadius: 3, overflow: "hidden", flexDirection: "row" },
  tabs: { flexDirection: "row", borderWidth: 1.5, borderRadius: 18, padding: 4, gap: 2 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: "transparent" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  kick: { flexDirection: "row", alignItems: "center", gap: 10 },
  kickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kickRule: { width: 22, height: 2, borderRadius: 1 },
  none: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed" },
  input: { fontSize: 16, minHeight: PAD_LINE * 10, padding: 0 },
  sum: { borderWidth: 1.5, borderRadius: 22, padding: 18, gap: 14 },
  sumHead: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5 },
  dec: { flexDirection: "row", alignItems: "center", gap: 12 },
  diamond: { width: 10, height: 10, transform: [{ rotate: "45deg" }], borderRadius: 2 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, marginTop: 2 },
  exc: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  att: { borderWidth: 1.5, borderRadius: 22, padding: 18, gap: 16 },
  gHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  gDot: { width: 9, height: 9, borderRadius: 5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nameChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4, paddingRight: 14, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5 },
  ini: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 12 },
});
