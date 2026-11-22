/**
 * The web's stacked ScheduleFields with `legacyReadOnly` (app/components/timeline/
 * ScheduleFields), on the phone, for the pages whose forms carry a "When" (Service,
 * Parties):
 *
 *   Set a time | All day   (+ "As written" while a free-text time is kept)
 *   Date / First day       the day strip
 *   Starts, Ends opt       clocks, stacked (the clock needs the full width)
 *   Last day opt           all day
 *   Time as written        read-only, with how calendars read it and "Set a time"
 *   the duration, the same-time and next-day warnings, the zone line
 *
 * Plus the label/field/chip the forms share. Not offered: the zone's "Change" picker and
 * the DST repeat/gap choosers; the zone is the org's (or this device's).
 */
import type { Party } from "@/lib/api-types";
import { parseLegacyTime, timeIsClear } from "@/lib/calendar-feed/legacy-time";
import { durationLabel, suspectLength } from "@/lib/timeline/schedule-length";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { localDay } from "~/data/home";
import { Clock, DayStrip } from "~/meetings/EventForm";
import { addDays, deviceZone, wallOf, wallToInstant, zoneName } from "~/meetings/model";
import { haptics } from "~/motion/haptics";
import { pressedDim } from "~/motion/press";
import type { Tone } from "~/theme/palette";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { resolveType } from "~/theme/type";
import { T } from "~/ui/T";

type Schedule = NonNullable<Party["schedule"]>;

/* ── the forms' shared bits ───────────────────────────────────────────────────── */

export function FormLabel({ text, opt, id }: { text: string; opt?: string; id?: string }) {
  const { c } = useTheme();
  return (
    <T v="callout" nativeID={id} style={{ fontWeight: "600", marginBottom: 6 }}>
      {text}{opt ? <T v="meta" color={c.ink3}>{`  ${opt}`}</T> : null}
    </T>
  );
}

export function FormField({ value, onChange, placeholder, label, multiline, autoFocus, readOnly, keyboardType }: {
  value: string; onChange?: (t: string) => void; placeholder?: string; label: string; multiline?: boolean; autoFocus?: boolean; readOnly?: boolean;
  keyboardType?: "decimal-pad";
}) {
  const { c } = useTheme();
  const scale = useFontScale();
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.faint} accessibilityLabel={label}
      multiline={multiline} autoFocus={autoFocus} editable={!readOnly} keyboardType={keyboardType}
      style={[resolveType("body", scale), styles.input, { color: readOnly ? c.ink2 : c.ink, borderColor: c.line2, backgroundColor: readOnly ? c.paper2 : c.card },
        multiline && { minHeight: 110, textAlignVertical: "top" }]} />
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? c.ink : c.line2, backgroundColor: on ? c.pastel.lilac.soft : c.card }]}>
      <T v="buttonSm" color={c.ink}>{label}</T>
    </Pressable>
  );
}

/* ── the value ────────────────────────────────────────────────────────────────── */

type Mode = "timed" | "allDay" | "legacy";
export interface When { mode: Mode; date: string; start: number | null; end: number | null; lastDay: string; legacy: string }

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** lib/event-time clock12, from minutes. */
const clock12 = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;

/** What a saved entry hands the form. */
export interface Timed { date: string; schedule?: Schedule | null; time?: string | null }

/**
 * ScheduleFields.initialSchedule: a new one is timed with no start on `newDate`; a saved
 * one opens as what it is (a free-text time is kept as written).
 */
export function initialWhen(saved: Timed | null, zone: string, newDate = ""): When {
  const base: When = { mode: "timed", date: saved?.date ?? newDate, start: null, end: null, lastDay: "", legacy: "" };
  const s = saved?.schedule;
  if (s?.kind === "timed") {
    const w = wallOf(s.start, s.timeZone || zone), we = s.end ? wallOf(s.end, s.timeZone || zone) : null;
    return { ...base, date: w?.date ?? base.date, start: w?.minutes ?? null, end: we?.minutes ?? null };
  }
  if (s?.kind === "allDay") {
    const last = addDays(s.end, -1);
    return { ...base, mode: "allDay", date: s.start, lastDay: last === s.start ? "" : last };
  }
  if (saved?.time?.trim()) return { ...base, mode: "legacy", legacy: saved.time.trim() };
  return saved ? { ...base, mode: "allDay" } : base;
}

/** ScheduleFields.scheduleFromValue. */
export function scheduleOf(w: When, zone: string): { schedule: Schedule | null } | { error: string } {
  if (!w.date) return { error: "Choose a date." };
  if (w.mode === "legacy") return { schedule: null };
  if (w.mode === "allDay") {
    if (w.lastDay && w.lastDay < w.date) return { error: "The last day can't be before the first." };
    return { schedule: { kind: "allDay", start: w.date, end: addDays(w.lastDay || w.date, 1) } };
  }
  if (w.start == null) return { error: "Add a start time, or make it an all-day event." };
  if (w.end != null && w.end === w.start) return { error: "The end time is the same as the start. Clear it or pick a later time." };
  const start = wallToInstant(w.date, w.start, zone);
  const end = w.end != null ? wallToInstant(w.end <= w.start ? addDays(w.date, 1) : w.date, w.end, zone) : undefined;
  return { schedule: { kind: "timed", start, ...(end ? { end } : {}), timeZone: zone } };
}

/**
 * The date and schedule a save sends (the pages' partyWhen / its Service twin): the date
 * follows the schedule; a free-text time is left as written (no schedule sent).
 */
export function timingOf(w: When, zone: string): { date: string; schedule?: Schedule } | { error: string } {
  const r = scheduleOf(w, zone);
  if ("error" in r) return r;
  return r.schedule ? { date: r.schedule.kind === "allDay" ? r.schedule.start : w.date, schedule: r.schedule } : { date: w.date };
}

/* ── the fields ───────────────────────────────────────────────────────────────── */

export function WhenFields({ value: when, onChange, label, err, open, editing, term, orgZone, tone }: {
  value: When; onChange: (w: When) => void; label: string; err: string; open: boolean; editing: boolean;
  term: { startDate: string; endDate: string } | null; orgZone: string | null; tone: Tone;
}) {
  const { c } = useTheme();
  const zone = orgZone || deviceZone();
  const set = (p: Partial<When>) => onChange({ ...when, ...p });
  const timed = when.mode === "timed";
  const hasEnd = timed && when.start != null && when.end != null;
  const sameAsStart = hasEnd && when.end === when.start;
  const overnight = hasEnd && when.end! <= when.start!;
  const suspect = hasEnd ? suspectLength(hhmm(when.start!), hhmm(when.end!)) : null;
  const legacyRead = when.mode === "legacy" ? parseLegacyTime(when.legacy).start : undefined;
  const convertLegacy = () => {
    const g = parseLegacyTime(when.legacy);
    set({ mode: "timed", start: g.start ? minutesOf(g.start) : null, end: g.end ? minutesOf(g.end) : null });
  };
  const link = (t: string, onPress: () => void) => <T v="meta" color={c.pastel.lilac.ink} style={styles.u} onPress={onPress} accessibilityRole="button">{t}</T>;
  const city = (zone.split("/").pop() ?? zone).replace(/_/g, " ");

  return (
    <View style={{ gap: 12 }}>
      <FormLabel text={label} />
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Schedule">
        {when.mode === "legacy" ? <Chip label="As written" on onPress={() => {}} /> : null}
        {(["timed", "allDay"] as const).map(mode => (
          <Chip key={mode} label={mode === "timed" ? "Set a time" : "All day"} on={when.mode === mode}
            onPress={() => { haptics.select(); if (mode === "timed" && when.mode === "legacy") convertLegacy(); else set({ mode }); }} />
        ))}
      </View>
      <View>
        <FormLabel text={when.mode === "allDay" && when.lastDay ? "First day" : "Date"} />
        <DayStrip value={when.date} onChange={date => set({ date })} today={localDay()} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
      </View>
      {timed ? (
        <View style={styles.times}>
          <View style={{ gap: 2 }}>
            <FormLabel text="Starts" />
            {when.start == null ? (
              <Pressable onPress={() => set({ start: 19 * 60 })} accessibilityRole="button" accessibilityLabel="Starts"
                style={({ pressed }) => [styles.pick, { borderColor: c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
                <T v="mono" color={c.faint}>--:-- --</T>
              </Pressable>
            ) : <View accessibilityLabel="Starts"><Clock minutes={when.start} onChange={m => set(m == null ? { start: null, end: null } : { start: m })} tone={tone} /></View>}
          </View>
          {when.start != null || when.end != null ? (
            <View style={{ gap: 2 }}>
              <FormLabel text="Ends" opt="opt" />
              {when.end == null ? (
                <Pressable onPress={() => set({ end: ((when.start ?? 1140) + 120) % 1440 })} accessibilityRole="button" accessibilityLabel="Ends (optional)"
                  style={({ pressed }) => [styles.pick, { borderColor: c.line2, backgroundColor: c.card }, pressed && pressedDim]}>
                  <T v="mono" color={c.faint}>--:-- --</T>
                </Pressable>
              ) : <View accessibilityLabel="Ends (optional)"><Clock minutes={when.end} onChange={m => set({ end: m })} tone={tone} /></View>}
            </View>
          ) : null}
        </View>
      ) : null}
      {when.mode === "allDay" ? (
        <View>
          <FormLabel text="Last day" opt="opt" />
          <DayStrip value={when.lastDay} onChange={lastDay => set({ lastDay })} today={when.date || localDay()} term={term} usualDow={null} taken={new Set()} editing={editing} open={open} />
        </View>
      ) : null}
      {when.mode === "legacy" ? (
        <View>
          <FormLabel text="Time" opt="as written" />
          <FormField value={when.legacy} label="Time" readOnly />
        </View>
      ) : null}
      {when.mode === "legacy" ? (
        <T v="meta" color={c.ink3}>
          {legacyRead
            ? `Calendars show this at ${clock12(minutesOf(legacyRead))}${timeIsClear(when.legacy) ? "" : " (no AM/PM was typed, so it's read as PM)"}. `
            : "Calendar subscriptions show this as an all-day event until it has a start time. "}
          {link("Set a time", convertLegacy)}
        </T>
      ) : null}
      {timed ? (
        <>
          {hasEnd && !sameAsStart && !suspect ? <T v="meta" color={c.ink3}>{`${durationLabel(hhmm(when.start!), hhmm(when.end!))}${overnight ? " · ends the next day" : ""}`}</T> : null}
          {sameAsStart ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">The end is the same as the start. Clear it or pick a later time.</T> : null}
          {suspect && when.end != null ? (
            <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">
              {`This runs ${suspect.hours} hours, ending the next day at ${clock12(when.end)}. `}
              {suspect.suggest ? link(`Change to ${clock12(minutesOf(suspect.suggest))}`, () => set({ end: minutesOf(suspect.suggest!) })) : null}
            </T>
          ) : null}
          <T v="meta" color={c.ink3}>{`Times in ${city} (${zoneName(zone)})${!orgZone && zone === deviceZone() ? " · this device's zone" : ""}.`}</T>
        </>
      ) : null}
      {err ? <T v="meta" color={c.pastel.rose.ink} accessibilityRole="alert">{err}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 13, minHeight: 34, justifyContent: "center" },
  times: { gap: 12 },
  pick: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
  u: { textDecorationLine: "underline" },
});
