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
  z.object({ kind: z.literal("timed"), start: z.iso.datetime(), end: z.iso.datetime(), timeZone: zoneSchema }).strict(),
]).refine(v => v.kind === "allDay" ? v.end > v.start : Temporal.Instant.compare(v.end, v.start) > 0, { message: "End must be after start", path: ["end"] });
export type Schedule = z.infer<typeof scheduleSchema>;
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
    const moved = scheduleSchema.safeParse({ ...schedule, start: shift(schedule.start), end: shift(schedule.end) });
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
  return new Date(schedule.kind === "allDay" ? `${schedule.end}T00:00:00Z` : schedule.end);
}
export function legacySchedule(date: string | null, time: string | null): { schedule: Schedule | null; issue: string | null } {
  if (!date || !validDate(date)) return { schedule: null, issue: "Invalid or missing date" };
  // Free text has no trustworthy end. Even a recognizable start is insufficient.
  return { schedule: { kind: "allDay", start: date, end: nextDate(date) }, issue: time?.trim() ? "Time to be confirmed in ChaptOS" : null };
}
/** Read an unambiguous clock time out of legacy free text ("7:30 PM", "19:00", "7-9pm").
 *  Only a prefill the officer confirms; anything unclear yields nothing. */
export function parseLegacyTime(text: string): { start?: string; end?: string } {
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
