import { createHash } from "node:crypto";
import { TaskStatus } from "@/lib/state/task-status";
import { scheduleSchema, legacySchedule, nextDate, validDate, endInstant, type Schedule } from "./schedule";

export interface PublishedItem {
  url?: string;
  title: string;
  location: string;
  category: string;
  schedule: Schedule;
  timeUnconfirmed: boolean;
  transparent: boolean;
  /** Present only when true, so rows published before this field existed keep
   *  their hash and only required events take a SEQUENCE bump on reconcile. */
  mandatory?: true;
}
/** `timeZone` is the org's: it places a typed time ("7:00 PM") on events saved without a schedule. */
export function calendarProjection(row: { title: string; date: string; time: string | null; location: string | null; category: string; mandatory: boolean; schedule: unknown }, stage?: string | null, timeZone?: string | null): PublishedItem | null {
  if (stage && stage !== "confirmed" && stage !== "done") return null;
  // Legacy deadline calendars must be reviewed, never exported alongside tasks.
  if (row.category === "deadline") return null;
  const parsed = scheduleSchema.safeParse(row.schedule);
  const legacy = legacySchedule(row.date, row.time, timeZone);
  const schedule = parsed.success ? parsed.data : legacy.schedule;
  if (!schedule) return null;
  return { title: row.title, location: row.location ?? "", category: row.category, schedule, timeUnconfirmed: !parsed.success && Boolean(legacy.issue), transparent: false, ...(row.mandatory ? { mandatory: true as const } : {}) };
}
export function taskProjection(row: { title: string; dueDate: string | null; status: string }): PublishedItem | null {
  // A finished deadline is noise on a calendar. Dropping it lets the worker cancel
  // it with retention; reopening the task republishes under the same UID.
  if (row.status === TaskStatus.Done) return null;
  if (!row.dueDate || !validDate(row.dueDate)) return null;
  return { title: `Deadline: ${row.title}`, location: "", category: "deadline", schedule: { kind: "allDay", start: row.dueDate, end: nextDate(row.dueDate) }, timeUnconfirmed: false, transparent: true };
}
export function contentHash(value: PublishedItem): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function cancellationRetention(value: PublishedItem, now: Date): Date {
  return new Date(Math.max(now.getTime(), endInstant(value.schedule).getTime()) + 90 * 86400_000);
}
