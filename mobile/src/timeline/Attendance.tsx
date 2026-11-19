/**
 * A required event's attendance, in the event sheet. What the web timeline shows a member:
 *
 *   my line      here (checked in / marked present) · excused · excuse waiting · "Not
 *                accepted" slip with the officer's note and Resubmit · marked absent
 *   excuse       "Can't make it?" files one (POST /api/excuses) for any required event I
 *                wasn't marked present at, past ones included (the server marks those
 *                retroactive). Filing is the small signature: the note folds and files
 *                under the event (~/moments/ExcuseFile). Optimistic; a refusal (e.g. 409
 *                "Excuse already pending review") lifts the note back out, reopens the
 *                form with the words kept, and says why.
 *   who came     Attended / Excused / Absent counts, tap one for the names
 *                (GET /api/attendance/[eventId]; reasons are never shown here)
 */
import { NO_TERM_LINE, useNoTerm } from "~/entry/term";
import type { CalendarEvent, EventAttendance, MyExcuseItem } from "@/lib/api-types";
import { submitExcuseInput } from "@/lib/validation/excuse";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { errorMessage } from "~/api/errors";
import { postExcuse, refreshAttendance, refreshExcuses, setMyExcuse, useEventAttendance, useMyAttendance, useMyExcuses } from "~/data/calendar";
import { Icon } from "~/icons/Icon";
import { FiledNote, type FileState } from "~/moments/ExcuseFile";
import { haptics } from "~/motion/haptics";
import { Button } from "~/paper/Button";
import { Avatar } from "~/paper/bits";
import { PAD_LINE } from "~/paper/stationery";
import { Sheet } from "~/shell/sheets";
import { ErrorState, SkeletonCard } from "~/shell/states";
import { toast } from "~/shell/toast";
import { alpha, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { daysFrom, monthDay } from "~/today/time";
import { T } from "~/ui/T";

type Group = "attended" | "excused" | "unexcused";
const GROUPS: { key: Group; label: string; tone: Tone }[] = [
  { key: "attended", label: "Attended", tone: "mint" },
  { key: "excused", label: "Excused", tone: "butter" },
  { key: "unexcused", label: "Absent", tone: "peach" },
];

const reasonSchema = submitExcuseInput.shape.reason;

/** `mineOnly`: just my line and the excuse (the minutes sheet draws who came itself, as name chips). */
export function AttendanceBlock({ event, meId, today, mineOnly }: { event: CalendarEvent; meId: number; today: string; mineOnly?: boolean }) {
  const { c } = useTheme();
  const att = useEventAttendance(event.id);
  const mine = useMyAttendance();
  const excuses = useMyExcuses();
  const [filing, setFiling] = useState<FileState | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  // after a refusal: runs once the note has lifted back out
  const afterGone = useRef<(() => void) | null>(null);

  const past = daysFrom(today, event.date) < 0;
  const here = (mine.data?.attendedEventIds ?? []).includes(event.id) || !!att.data?.attended.some(a => a.brotherId === meId);
  const absent = !!att.data?.unexcused.some(a => a.brotherId === meId);
  const myExcuse = (excuses.data ?? []).find(x => x.calendarEventId === event.id) ?? null;
  const noTerm = useNoTerm();
  const canFile = !noTerm && !here && (!myExcuse || myExcuse.status === "rejected");

  const file = (reason: string) => {
    setFormOpen(false);
    setFiling("filing");
    fileExcuse(event, reason, {
      ok: () => setDraft(""),
      refused: restore => {
        // once the note has lifted out: the form comes back with the words kept
        afterGone.current = () => { restore(); setFormOpen(true); void refreshExcuses(); };
        setFiling("unfiling");
      },
    });
  };

  return (
    <View style={{ gap: 12 }}>
      {mineOnly ? null : <T v="label" color={c.ink3} accessibilityRole="header">Attendance</T>}

      <MyLine here={here} past={past} absent={absent} excuse={myExcuse} filing={filing}
        onLanded={() => { haptics.soft(); toast.show("Excuse filed", { detail: "An officer will look at it." }); }}
        onGone={() => { setFiling(null); const f = afterGone.current; afterGone.current = null; f?.(); }}
        onResubmit={noTerm ? undefined : () => { setDraft(myExcuse?.reason ?? ""); setFormOpen(true); }} />

      {noTerm && !here ? <T v="meta" color={c.ink3}>{NO_TERM_LINE}</T> : null}

      {canFile && myExcuse?.status !== "rejected" && filing == null ? (
        <View style={[styles.ask, { borderColor: c.pastel.butter.border, backgroundColor: c.pastel.butter.soft }]}>
          <Icon name="clip" size={18} color={c.pastel.butter.ink} />
          <View style={{ flex: 1 }}>
            <T v="callout">{past ? (absent ? "Marked absent" : "Missed it?") : "Can't make it?"}</T>
            <T v="meta" color={c.ink3}>{past ? "You can still file a late excuse." : "It's required. File an excuse and an officer will look at it."}</T>
          </View>
          <Button label="Excuse" size="sm" tone="butter" onPress={() => setFormOpen(true)} />
        </View>
      ) : null}

      {mineOnly ? null : att.data ? <WhoCame data={att.data} group={group} setGroup={setGroup} past={past} />
        : att.isError ? <ErrorState compact title="Couldn't load who came." error={att.error} onRetry={() => void att.refetch()} />
        : <SkeletonCard lines={1} title={false} />}

      <ExcuseSheet open={formOpen} event={event} draft={draft} setDraft={setDraft} onClose={() => setFormOpen(false)} onSubmit={file} />
    </View>
  );
}

/**
 * File an excuse: optimistic (my excuse shows as waiting at once), then
 * POST /api/excuses. On a refusal the error haptic + toast play here; `refused` gets the
 * cache undo so the caller can run it when its own motion has played backwards.
 */
export function fileExcuse(event: CalendarEvent, reason: string, on: { ok?: () => void; refused?: (restore: () => void) => void } = {}) {
  const restore = setMyExcuse({
    id: -event.id, calendarEventId: event.id, eventTitle: event.title, eventDate: event.date, reason,
    status: "pending", submittedAt: new Date().toISOString(), decidedAt: null, rejectionNote: null,
  });
  postExcuse(event.id, reason).then(
    () => { on.ok?.(); void refreshExcuses(); void refreshAttendance(event.id); },
    e => {
      haptics.error();
      toast.error("Couldn't file that excuse", { detail: errorMessage(e) });
      if (on.refused) on.refused(restore); else { restore(); void refreshExcuses(); }
    },
  );
}

/* ── my line ──────────────────────────────────────────────────────────────────── */

function MyLine({ here, past, absent, excuse, filing, onLanded, onGone, onResubmit }: {
  here: boolean; past: boolean; absent: boolean; excuse: MyExcuseItem | null; filing: FileState | null;
  onLanded: () => void; onGone: () => void; onResubmit?: () => void;
}) {
  const { c } = useTheme();
  if (here) {
    return (
      <View style={[styles.line, { borderColor: c.pastel.mint.border, backgroundColor: c.pastel.mint.soft }]}>
        <Icon name="check" size={16} color={c.pastel.mint.ink} />
        <T v="callout" style={{ flex: 1 }}>{past ? "You were here." : "You're checked in."}</T>
      </View>
    );
  }
  if (!excuse && !filing) return null;
  if (excuse?.status === "rejected" && !filing) {
    return (
      <View style={[styles.slip, { borderColor: c.pastel.rose.border, backgroundColor: c.pastel.rose.soft }]}>
        <T v="kicker" color={c.pastel.rose.ink} style={{ fontSize: 10 }}>Not accepted</T>
        <T v="body" color={c.ink2} style={{ textDecorationLine: "line-through" }}>“{excuse.reason}”</T>
        {excuse.rejectionNote ? (
          <View style={{ gap: 2 }}>
            <T v="label" color={c.ink3}>Officer's note</T>
            <T v="body">{excuse.rejectionNote}</T>
          </View>
        ) : null}
        {onResubmit ? <Button label="Resubmit" icon="refresh" variant="ghost" tone="rose" size="sm" onPress={onResubmit} style={{ alignSelf: "flex-start" }} /> : null}
      </View>
    );
  }
  const approved = excuse?.status === "approved";
  const note = (
    <View style={[styles.note, { backgroundColor: approved ? c.pastel.mint.soft : c.pastel.butter.soft, borderColor: approved ? c.pastel.mint.border : c.pastel.butter.border }]}>
      <View style={[styles.margin, { backgroundColor: alpha(c.pastel.rose.ink, 0.45) }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={approved ? "check" : "pencil"} size={13} color={approved ? c.pastel.mint.ink : c.pastel.butter.ink} />
          <T v="kicker" color={approved ? c.pastel.mint.ink : c.pastel.butter.ink} style={{ fontSize: 10 }}>
            {approved ? "Excused" : "Waiting for review"}
          </T>
          {excuse?.submittedAt ? <T v="mono" color={c.ink3} style={{ marginLeft: "auto", fontSize: 10.5 }}>filed {monthDay(excuse.submittedAt.slice(0, 10))}</T> : null}
        </View>
        <T v="body" color={c.note.ink} style={{ lineHeight: PAD_LINE * 0.8 }}>“{excuse?.reason ?? ""}”</T>
        {absent && approved ? <T v="meta" color={c.ink3}>It doesn't count against you.</T> : null}
      </View>
    </View>
  );
  return <FiledNote state={filing ?? "shown"} onLanded={onLanded} onGone={onGone}>{note}</FiledNote>;
}

/* ── who came ─────────────────────────────────────────────────────────────────── */

function WhoCame({ data, group, setGroup, past }: { data: EventAttendance; group: Group | null; setGroup: (g: Group | null) => void; past: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const total = data.attended.length + data.excused.length + data.unexcused.length;
  if (total === 0) {
    return <T v="meta" color={c.ink3}>{data.checkInOpen ? "Check-in is open. Nobody's in yet." : past ? "No attendance recorded." : "No attendance yet."}</T>;
  }
  const people: { brotherId: number; brotherName: string }[] = group ? data[group] : [];
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.grid}>
        {GROUPS.map(g => {
          const on = group === g.key;
          const ink = c.pastel[g.tone].ink;
          return (
            <Pressable key={g.key} onPress={() => { haptics.select(); setGroup(on ? null : g.key); }} accessibilityRole="button"
              accessibilityState={{ selected: on }} accessibilityLabel={`${data[g.key].length} ${g.label}`}
              style={[styles.cell, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.card : c.paper }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={[styles.dot, { backgroundColor: ink }]} />
                <T v="label" color={ink} style={{ fontSize: 9.5 }}>{g.label}</T>
              </View>
              <T v="title" style={{ fontSize: 24 }}>{data[g.key].length}</T>
            </Pressable>
          );
        })}
      </View>
      {data.checkInOpen ? <T v="meta" color={c.ink3}>Check-in is open, so these are still filling.</T> : null}
      {group ? (
        <Animated.View key={group} entering={FadeIn.duration(m.t(180)).reduceMotion(ReduceMotion.Never)} style={styles.names}>
          {people.length ? people.slice(0, 18).map(p => (
            <View key={p.brotherId} style={[styles.name, { borderColor: c.line, backgroundColor: c.card }]}>
              <Avatar name={p.brotherName} size="sm" style={{ width: 22, height: 22 }} />
              <T v="pill" color={c.ink2}>{short(p.brotherName)}</T>
            </View>
          )) : <T v="meta" color={c.ink3}>No one.</T>}
          {people.length > 18 ? <View style={[styles.name, styles.more, { borderColor: c.line2 }]}><T v="pill" color={c.ink3}>+{people.length - 18} more</T></View> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const short = (name: string) => {
  const [a = name, b] = name.split(" ");
  return b ? `${a} ${b[0]}.` : a;
};

/* ── the excuse form ──────────────────────────────────────────────────────────── */

export function ExcuseSheet({ open, event, draft, setDraft, onClose, onSubmit, forName }: {
  open: boolean; event: CalendarEvent; draft: string; setDraft: (s: string) => void; onClose: () => void; onSubmit: (reason: string) => void;
  /** An officer filing for someone else (it's approved as it's filed). */
  forName?: string | null;
}) {
  const { c } = useTheme();
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    const r = reasonSchema.safeParse(draft);
    if (!r.success) { setErr(draft.trim() ? "Keep it under 1,000 characters." : "Say why, in a line or two."); return; }
    setErr(null);
    onSubmit(r.data);
  };
  return (
    <Sheet open={open} onClose={onClose} title={forName ? `Excuse ${forName.split(" ")[0]}` : "File an excuse"} kicker={`${event.title} · ${monthDay(event.date)}`} tone="butter" icon="clip"
      footer={<Button label={forName ? "Excuse them" : "File it"} icon={forName ? "check" : "send"} tone="butter" block onPress={submit} style={{ flex: 1 }} />}>
      <View style={[styles.pad, { backgroundColor: c.pastel.butter.soft, borderColor: c.pastel.butter.border }]}>
        <View style={[styles.padMargin, { backgroundColor: alpha(c.pastel.rose.ink, 0.45) }]} />
        <TextInput value={draft} onChangeText={t => { setDraft(t); if (err) setErr(null); }} multiline autoFocus maxLength={1000}
          placeholder={forName ? "Why they couldn't be there" : "Why you can't be there"} placeholderTextColor={c.ink3} accessibilityLabel="Reason"
          style={[styles.input, { color: c.note.ink }]} />
      </View>
      {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T>
        : <T v="meta" color={c.ink3}>{forName ? "You're filing it, so it's approved as it lands. They'll see it on their attendance." : "Only officers who take attendance see your reason. Everyone else just sees \"excused\"."}</T>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  slip: { gap: 8, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  note: { flexDirection: "row", gap: 10, paddingVertical: 12, paddingRight: 14, paddingLeft: 30, borderWidth: 1.5, borderTopLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 8, borderBottomLeftRadius: 12 },
  margin: { position: "absolute", left: 20, top: 0, bottom: 0, width: 1.5 },
  ask: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: 16, borderWidth: 1.5 },
  grid: { flexDirection: "row", gap: 8 },
  cell: { flex: 1, gap: 3, paddingVertical: 10, paddingHorizontal: 11, borderRadius: 14, borderWidth: 1.5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  names: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  name: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingLeft: 3, paddingRight: 10, borderRadius: 999, borderWidth: 1.5 },
  more: { paddingLeft: 10, borderStyle: "dashed" },
  pad: { minHeight: 140, borderWidth: 1.5, borderRadius: 12, paddingLeft: 40, paddingRight: 14, paddingVertical: 10 },
  padMargin: { position: "absolute", left: 28, top: 0, bottom: 0, width: 1.5 },
  input: { fontSize: 16, lineHeight: 26, minHeight: 120, textAlignVertical: "top" },
});
