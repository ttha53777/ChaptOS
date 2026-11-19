/**
 * More → Attendance: my record as a punch strip (motion plan U7). One slot per required
 * event, oldest first: punched where I was there, outlined in rose where I missed it,
 * taped over where it was excused, a "?" while an excuse waits, faint for ones ahead.
 * Above it, the chapter's own figure for me (my roster row's attendance %, which the
 * server works out for the term; "Exempt" when an officer exempted me). Below, the same
 * events as a list; a missed one with no excuse can still get a late one.
 *
 * Reads GET /api/calendar, /api/attendance/mine, /api/excuses/mine and my roster row.
 */
import type { CalendarEvent } from "@/lib/api-types";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useCalendar, useMyAttendance, useMyExcuses } from "~/data/calendar";
import { localDay } from "~/data/home";
import { useRoster } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { NO_TERM_LINE, useNoTerm } from "~/entry/term";
import { attLevel, isExempt, LEVEL_TONE } from "~/members/model";
import { myMeetings, type Mark, type Meeting } from "~/more/model";
import { Button } from "~/paper/Button";
import { Tape } from "~/paper/bits";
import { Screen } from "~/shell/Screen";
import { EmptyState, ErrorState, SkeletonCard, StaleNote } from "~/shell/states";
import { alpha } from "~/theme/palette";
import { useTheme } from "~/theme/PaperProvider";
import { ExcuseSheet, fileExcuse } from "~/timeline/Attendance";
import { monthDay, weekdayShort } from "~/today/time";
import { T } from "~/ui/T";

const LABEL: Record<Mark, string> = { here: "Here", excused: "Excused", missed: "Missed", pending: "Excuse waiting", ahead: "Coming up" };

export default function AttendancePage() {
  const { c } = useTheme();
  const entry = useEntryOf("ready");
  const cal = useCalendar();
  const att = useMyAttendance();
  const excuses = useMyExcuses();
  const roster = useRoster();
  const [late, setLate] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState("");
  const noTerm = useNoTerm();
  if (!entry) return null;
  const me = entry.me;
  const today = localDay();
  const ready = cal.data && att.data && excuses.data;
  const ms = ready ? myMeetings(cal.data!, att.data!.attendedEventIds, excuses.data!, today) : null;
  const row = roster.data?.find(b => b.id === me.id);
  const t = me.org?.thresholds;
  const refresh = () => Promise.all([cal.refetch(), att.refetch(), excuses.refetch(), roster.refetch()]);
  const hasExcuse = new Set((excuses.data ?? []).map(x => x.calendarEventId));

  return (
    <Screen title="Attendance" back="More" onRefresh={refresh}>
      {ms ? <StaleNote updatedAt={cal.dataUpdatedAt} failed={cal.isError || att.isError} onRetry={() => void refresh()} /> : null}
      {!ms ? (cal.isError || att.isError ? <ErrorState title="Couldn't load your attendance." error={cal.error ?? att.error} onRetry={() => void refresh()} /> : <SkeletonCard height={200} />)
        : ms.length === 0 ? (
          <EmptyState pictures={[{ icon: "clip", tone: "sky", label: "Required meetings" }, { icon: "check", tone: "mint", label: "A punch when you're there" }, { icon: "note", tone: "butter", label: "Tape when you're excused" }]}
            title="No required meetings yet." line="When an officer marks a meeting as required, it gets a slot here and a punch when you check in." />
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <T v="title" accessibilityRole="header">Your record</T>
              {noTerm ? <T v="body" color={c.ink2}>{NO_TERM_LINE}</T> : row && t ? (
                <T v="body" color={c.ink2}>
                  {isExempt(row.attendance) ? "You're exempt from attendance this term."
                    : row.attendance > 0 || ms.some(m => m.mark === "here")
                      ? <>The chapter has you at <T v="body" color={c.pastel[LEVEL_TONE[attLevel(row.attendance, t)]!].ink} style={{ fontWeight: "700" }}>{row.attendance}%</T>. The goal is {t.attendanceWatch}%.</>
                      : "Nothing's been recorded for you yet."}
                </T>
              ) : null}
            </View>
            <Strip meetings={ms} />
            <View style={[styles.list, { borderColor: c.line, backgroundColor: c.card }]}>
              {[...ms].reverse().map((m, i) => (
                <View key={m.event.id} style={[styles.row, i > 0 && { borderTopColor: c.line, borderTopWidth: 1 }]}>
                  <View style={{ width: 44 }}>
                    <T v="mono" color={c.ink3} style={{ fontSize: 10 }}>{weekdayShort(m.event.date).toUpperCase()}</T>
                    <T v="callout">{monthDay(m.event.date)}</T>
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="callout" numberOfLines={1}>{m.event.title}</T>
                    <T v="meta" color={markInk(m.mark, c)}>{LABEL[m.mark]}</T>
                  </View>
                  {m.mark === "missed" && !hasExcuse.has(m.event.id) && !noTerm
                    ? <Button label="Late excuse" size="sm" variant="ghost" tone="butter" onPress={() => { setDraft(""); setLate(m.event); }} /> : null}
                </View>
              ))}
            </View>
          </>
        )}
      {late ? (
        <ExcuseSheet open event={late} draft={draft} setDraft={setDraft} onClose={() => setLate(null)}
          onSubmit={reason => {
            const ev = late;
            setLate(null);
            fileExcuse(ev, reason, { ok: () => setDraft("") });
          }} />
      ) : null}
    </Screen>
  );
}

function markInk(mark: Mark, c: ReturnType<typeof useTheme>["c"]): string {
  return mark === "here" ? c.pastel.mint.ink : mark === "missed" ? c.pastel.rose.ink : mark === "excused" ? c.pastel.butter.ink : mark === "pending" ? c.pastel.sky.ink : c.ink3;
}

/* ── the punch strip ──────────────────────────────────────────────────────────── */

const SLOT = 26;

function Strip({ meetings }: { meetings: Meeting[] }) {
  const { c } = useTheme();
  const print = c.pastel.sky.ink;
  const here = meetings.filter(m => m.mark === "here").length;
  return (
    <View style={[styles.strip, { backgroundColor: c.pastel.sky.soft, borderColor: c.ink, boxShadow: `4px 4px 0 ${c.pastel.sky.fill}` }]}
      accessible accessibilityLabel={`Punch strip: ${here} punched of ${meetings.length} required meetings`}>
      <View style={[styles.stripHead, { borderBottomColor: alpha(print, 0.38) }]}>
        <T v="label" color={print} style={{ fontSize: 9.5 }}>Attendance strip</T>
        <T v="mono" color={print} style={{ fontSize: 10 }}>{here} punched</T>
      </View>
      <View style={styles.slots}>
        {meetings.map(m => (
          <View key={m.event.id} accessible accessibilityLabel={`${m.event.title}, ${monthDay(m.event.date)}: ${LABEL[m.mark]}`} style={styles.slotWrap}>
            <Slot mark={m.mark} print={print} />
            <T v="mono" color={alpha(print, 0.8)} style={{ fontSize: 8.5 }}>{monthDay(m.event.date).replace(/^(\w{3}) /, "$1 ")}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

function Slot({ mark, print }: { mark: Mark; print: string }) {
  const { c } = useTheme();
  if (mark === "here") {
    return <View style={[styles.slot, { borderColor: "transparent", backgroundColor: c.paper, boxShadow: `inset 1.5px 2.5px 3px ${alpha(c.ink, 0.32)}` }]} />;
  }
  if (mark === "missed") return <View style={[styles.slot, { borderColor: c.pastel.rose.ink, borderWidth: 2 }]} />;
  if (mark === "excused") {
    return (
      <View style={[styles.slot, { borderColor: alpha(print, 0.5) }]}>
        <Tape width={30} rotate={-14} style={{ position: "absolute", top: 7 }} />
      </View>
    );
  }
  if (mark === "pending") return <View style={[styles.slot, { borderColor: alpha(print, 0.6), borderStyle: "dashed" }]}><T v="mono" color={print} style={{ fontSize: 11 }}>?</T></View>;
  return <View style={[styles.slot, { borderColor: alpha(print, 0.3), borderStyle: "dotted" }]} />;
}

const styles = StyleSheet.create({
  strip: { borderWidth: 1.5, borderRadius: 14, paddingBottom: 14, transform: [{ rotate: "-0.5deg" }] },
  stripHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 3, borderStyle: "solid" },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  slotWrap: { alignItems: "center", gap: 4, width: 40 },
  slot: { width: SLOT, height: SLOT, borderRadius: SLOT / 2, borderWidth: 1.2, alignItems: "center", justifyContent: "center" },
  list: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
});
