import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; }
}
export function validZone(value: string): boolean {
  if (/^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
export const dateSchema = z.string().refine(validDate, "Use a valid YYYY-MM-DD date");
export const zoneSchema = z.string().max(100).refine(validZone, "Use an IANA time zone, such as America/New_York");
export const scheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allDay"), start: dateSchema, end: dateSchema }).strict(),
  // A timed event's end is optional: officers often only know when it starts.
  z.object({ kind: z.literal("timed"), start: z.iso.datetime(), end: z.iso.datetime().optional(), timeZone: zoneSchema }).strict(),
]).refine(v => v.kind === "allDay" ? v.end > v.start : v.end === undefined || Temporal.Instant.compare(v.end, v.start) > 0, { message: "End must be after start", path: ["end"] });
export type Schedule = z.infer<typeof scheduleSchema>;
/** How long a start-only event lasts where a calendar needs an end (feeds, copies, links). */
export const DEFAULT_TIMED_MINUTES = 60;
/** A timed event's end, or its start plus the default length when none was entered. */
export function timedEnd(schedule: Extract<Schedule, { kind: "timed" }>): string {
  return schedule.end ?? Temporal.Instant.from(schedule.start).add({ minutes: DEFAULT_TIMED_MINUTES }).toString();
}
export function nextDate(value: string): string { return Temporal.PlainDate.from(value).add({ days: 1 }).toString(); }

/** Reject both nonexistent and repeated wall times. An officer must explicitly choose an offset for the latter. */
export function wallTimeToInstant(local: string, timeZone: string, offset?: string): string {
  if (!validZone(timeZone)) throw new Error("Choose a valid IANA time zone");
  const plain = Temporal.PlainDateTime.from(local);
  const zoned = offset
    ? Temporal.ZonedDateTime.from(`${plain.toString()}${offset}[${timeZone}]`, { offset: "reject", disambiguation: "reject" })
    : plain.toZonedDateTime(timeZone, { disambiguation: "reject" });
  return zoned.toInstant().toString();
}
export type WallTime = { kind: "ok"; instant: string } | { kind: "gap" } | { kind: "ambiguous"; offsets: [string, string] };
/** Classify a local wall time so an editor can ask about a repeated hour instead of failing. */
export function resolveWallTime(local: string, timeZone: string, offset?: string): WallTime {
  if (offset) { try { return { kind: "ok", instant: wallTimeToInstant(local, timeZone, offset) }; } catch { /* stale offset: re-classify */ } }
  const plain = Temporal.PlainDateTime.from(local);
  try { return { kind: "ok", instant: plain.toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant().toString() }; } catch { /* gap or repeat */ }
  const earlier = plain.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  const later = plain.toZonedDateTime(timeZone, { disambiguation: "later" });
  // Inside a skipped hour both resolutions land on a different wall time.
  if (!earlier.toPlainDateTime().equals(plain)) return { kind: "gap" };
  return { kind: "ambiguous", offsets: [earlier.offset, later.offset] };
}
/** Move a schedule to a new start date, keeping its local wall times and length.
 *  Null when a timed wall time is skipped or repeated on the new date. */
export function moveSchedule(schedule: Schedule, date: string): Schedule | null {
  const days = Temporal.PlainDate.from(scheduleDate(schedule)).until(Temporal.PlainDate.from(date), { largestUnit: "days" }).days;
  if (days === 0) return schedule;
  if (schedule.kind === "allDay") {
    const shift = (value: string) => Temporal.PlainDate.from(value).add({ days }).toString();
    return { kind: "allDay", start: shift(schedule.start), end: shift(schedule.end) };
  }
  const shift = (value: string) => Temporal.Instant.from(value).toZonedDateTimeISO(schedule.timeZone).toPlainDateTime().add({ days })
    .toZonedDateTime(schedule.timeZone, { disambiguation: "reject" }).toInstant().toString();
  try {
    const moved = scheduleSchema.safeParse({ ...schedule, start: shift(schedule.start), ...(schedule.end && { end: shift(schedule.end) }) });
    return moved.success ? moved.data : null;
  } catch { return null; }
}
export function scheduleDate(schedule: Schedule): string {
  return schedule.kind === "allDay" ? schedule.start : Temporal.Instant.from(schedule.start).toZonedDateTimeISO(schedule.timeZone).toPlainDate().toString();
}
export function scheduleTime(schedule: Schedule): string | null {
  return schedule.kind === "allDay" ? null : Temporal.Instant.from(schedule.start).toZonedDateTimeISO(schedule.timeZone).toPlainTime().toString({ smallestUnit: "minute" });
}
export function endInstant(schedule: Schedule): Date {
  return new Date(schedule.kind === "allDay" ? `${schedule.end}T00:00:00Z` : timedEnd(schedule));
}
/**
 * An event without a saved schedule, read from its date and typed time. No time
 * means all-day. A readable time ("7:00 PM", "7-9pm") is published as that time
 * in the org's zone, with the default length when no end was typed. Only text
 * nothing can read ("7ish", a bare "8") stays all-day, marked to be confirmed.
 */
export function legacySchedule(date: string | null, time: string | null, timeZone?: string | null): { schedule: Schedule | null; issue: string | null } {
  if (!date || !validDate(date)) return { schedule: null, issue: "Invalid or missing date" };
  const allDay: Schedule = { kind: "allDay", start: date, end: nextDate(date) };
  if (!time?.trim() || /^all[\s-]?day$/i.test(time.trim())) return { schedule: allDay, issue: null };
  const timed = timeZone ? legacyTimed(date, time, timeZone) : null;
  return timed ? { schedule: timed, issue: null } : { schedule: allDay, issue: "Time to be confirmed in ChaptOS" };
}
function legacyTimed(date: string, time: string, timeZone: string): Schedule | null {
  const { start, end } = parseLegacyTime(time);
  if (!start || !validZone(timeZone)) return null;
  // A skipped or repeated wall time has no single answer: leave it all-day.
  const at = (day: string, hhmm: string) => { const r = resolveWallTime(`${day}T${hhmm}`, timeZone); return r.kind === "ok" ? r.instant : undefined; };
  const startAt = at(date, start);
  if (!startAt) return null;
  // "9pm-1am" ends the next morning.
  const endAt = end ? at(end > start ? date : nextDate(date), end) : undefined;
  const parsed = scheduleSchema.safeParse({ kind: "timed", start: startAt, ...(endAt && { end: endAt }), timeZone });
  return parsed.success ? parsed.data : null;
}
/** Read a clock time out of legacy free text ("7:30 PM", "19:00", "7-9pm").
 *  A time typed alone with no AM/PM ("7:30", "8") is read as PM: chapter events
 *  are evenings, and older forms didn't ask. New times must say (`timeIsClear`).
 *  The feed publishes what this reads; anything else unclear yields nothing. */
export function parseLegacyTime(text: string): { start?: string; end?: string } {
  const bare = /^\s*([1-9]|1[0-2])(?::([0-5]\d))?\s*$/.exec(text);
  if (bare) return { start: `${String(Number(bare[1]) % 12 + 12).padStart(2, "0")}:${bare[2] ?? "00"}` };
  return readClock(text);
}
export const UNCLEAR_TIME = "Add AM or PM to the time, e.g. 7:30 PM.";
/** Whether a newly typed time says AM or PM, or is 24-hour ("19:00", "07:30").
 *  "7:30" alone is refused so no new event depends on the PM reading above. */
export function timeIsClear(text: string): boolean {
  const t = text.trim();
  return !t || /^all[\s-]?day$/i.test(t) || readClock(t).start !== undefined;
}
function readClock(text: string): { start?: string; end?: string } {
  // Whole numbers only ("204" is not 8pm); a/p only as a suffix ("7 at" is not 7am).
  const token = /(?<!\d)(\d{1,2})(?::(\d{2}))?(?!\d)\s*(?:(a|p)(?:\.?\s*m\.?)?(?![a-z]))?/gi;
  const found = [...text.toLowerCase().matchAll(token)].slice(0, 2).map(m => ({ h: Number(m[1]), m: Number(m[2] ?? 0), mer: m[3] as "a" | "p" | undefined, raw: m[0] }));
  const clock = (t: typeof found[number], mer = t.mer) => {
    if (t.m > 59 || t.h > 23) return undefined;
    let h = t.h;
    if (mer) { if (h < 1 || h > 12) return undefined; h = (h % 12) + (mer === "p" ? 12 : 0); }
    else if (!(h >= 13 || /^0\d/.test(t.raw))) return undefined; // bare "7" could be either
    return `${String(h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
  };
  const [a, b] = found;
  if (!a) return {};
  const end = b ? clock(b) : undefined;
  // "7-9pm": the start borrows the end's meridiem when that keeps it before the end.
  const start = clock(a) ?? (b?.mer && end ? [clock(a, b.mer), clock(a, b.mer === "p" ? "a" : "p")].find(v => v && v < end) : undefined);
  return { start, end };
}
