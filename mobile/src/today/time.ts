/**
 * Dates and times as Today shows them. Event `time` is free text on the server: real
 * rows hold both "7:00 PM" and "19:00", so it's parsed leniently, and anything that
 * doesn't parse is shown as written and simply gets no countdown.
 */

/** Minutes after midnight from "7:00 PM", "19:00", "7pm"; null when there's no clock time in it. */
export function parseClock(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?/i.exec(time) ?? /(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Local midnight of a YYYY-MM-DD. */
export function dayStart(date: string): Date {
  const [y = 1970, mo = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, mo - 1, d);
}

/** When the event starts on this phone's clock, or null when it has no parseable time. */
export function startOf(date: string, time: string | null | undefined): Date | null {
  const mins = parseClock(time);
  if (mins == null) return null;
  const d = dayStart(date);
  d.setMinutes(mins);
  return d;
}

/** "7:00 PM" in the phone's own style, from whatever the server held. */
export function clockLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  const mins = parseClock(time);
  if (mins == null) return time;
  const d = new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Whole days from today to `date` (negative = past). */
export function daysFrom(today: string, date: string): number {
  return Math.round((dayStart(date).getTime() - dayStart(today).getTime()) / 86_400_000);
}

export const weekdayShort = (date: string) => dayStart(date).toLocaleDateString(undefined, { weekday: "short" });
export const monthDay = (date: string) => dayStart(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** "Today", "Tomorrow", "Fri", or "Nov 28" past a week. */
export function relDay(today: string, date: string): string {
  const n = daysFrom(today, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return dayStart(date).toLocaleDateString(undefined, { weekday: "long" });
  return monthDay(date);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The countdown face: "42:07" under an hour, "3:42:07" under a day (both tick every
 * second), "2d 04h" beyond (ticks by the minute). null once it has started.
 */
export function countdown(ms: number): { face: string; unit: string; everySecond: boolean } | null {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return { face: `${d}d ${pad(h)}h`, unit: "to go", everySecond: false };
  if (h > 0) return { face: `${h}:${pad(m)}:${pad(sec)}`, unit: "hrs to go", everySecond: true };
  return { face: `${pad(m)}:${pad(sec)}`, unit: "min to go", everySecond: true };
}

/** "4:12" for a closing window. */
export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
