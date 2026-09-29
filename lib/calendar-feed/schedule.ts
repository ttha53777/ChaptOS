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
