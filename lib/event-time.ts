import { Temporal } from "@js-temporal/polyfill";
import { endInstant, parseLegacyTime, scheduleSchema } from "./calendar-feed/schedule";
import { todayISO } from "./dates";

/**
 * How an event's time reads anywhere in the app: 12-hour, with the end when one
 * was entered ("7:00 – 9:00 PM", "11:00 AM – 1:00 AM"). Times are the wall
 * clock the officer entered, in the event's own zone. Pure and client-safe.
 */

/** "19:00" → "7:00 PM". Anything that isn't a bare HH:MM clock comes back as null. */
export function clock12(hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function range(start: string, end: string): string {
  const [s, sMer] = start.split(" "), [e, eMer] = end.split(" ");
  // One meridiem when both share it; the pair reads as a single span.
  return sMer === eMer ? `${s} – ${e} ${eMer}` : `${start} – ${end}`;
}

/**
 * The display time for an event, or null for an all-day one / no time at all.
 * A saved schedule wins; otherwise the legacy `time` column, converted when it
 * is a plain clock ("19:00") and shown as written when it's free text ("7ish").
 */
export function formatEventTime(time: string | null | undefined, schedule?: unknown): string | null {
  const parsed = schedule == null ? null : scheduleSchema.safeParse(schedule);
  if (parsed?.success) {
    const s = parsed.data;
    if (s.kind === "allDay") return null;
    const wall = (instant: string) => clock12(Temporal.Instant.from(instant).toZonedDateTimeISO(s.timeZone).toPlainTime().toString({ smallestUnit: "minute" }))!;
    return s.end ? range(wall(s.start), wall(s.end)) : wall(s.start);
  }
  const text = time?.trim();
  if (!text) return null;
  // "7:30" with no AM/PM reads as PM, the same as the calendar feed publishes it.
  const bare = /^\d{1,2}(:\d{2})?$/.test(text) && !/^0/.test(text) ? parseLegacyTime(text).start : undefined;
  return clock12(bare ?? text) ?? text;
}

type Dated = { id?: number; date: string; time?: string | null; schedule?: unknown };

/** Minutes past midnight an event starts on its own date; -1 for all-day or
 *  untimed, so those lead the day the way calendar apps pin them to the top. */
function startMinute(e: Dated): number {
  const parsed = e.schedule == null ? null : scheduleSchema.safeParse(e.schedule);
  if (parsed?.success) {
    const s = parsed.data;
    if (s.kind === "allDay") return -1;
    const t = Temporal.Instant.from(s.start).toZonedDateTimeISO(s.timeZone);
    return t.hour * 60 + t.minute;
  }
  const legacy = e.time ? parseLegacyTime(e.time).start : undefined;
  return legacy ? Number(legacy.slice(0, 2)) * 60 + Number(legacy.slice(3)) : -1;
}

/** Chronological order: date, then start time within the day, then id for stability. */
export function compareEvents(a: Dated, b: Dated): number {
  return a.date.localeCompare(b.date) || startMinute(a) - startMinute(b) || (a.id ?? 0) - (b.id ?? 0);
}

/**
 * Whether an event has finished. A timed event is over once its end passes (a
 * start-only one after the default length, matching what calendars show); an
 * all-day one once its last day ends in the viewer's local date. Legacy rows
 * without a schedule fall back to the date alone.
 */
export function isEventOver(e: Dated, now: Date = new Date()): boolean {
  const parsed = e.schedule == null ? null : scheduleSchema.safeParse(e.schedule);
  if (parsed?.success) {
    const s = parsed.data;
    return s.kind === "allDay" ? s.end <= todayISO(now) : endInstant(s).getTime() <= now.getTime();
  }
  return e.date < todayISO(now);
}
