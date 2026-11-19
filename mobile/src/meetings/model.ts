/**
 * Meetings, the app's own half: permission bits and the meeting form's arithmetic (the
 * usual weekday / time / room, and a wall-clock time in the chapter's zone as the instant
 * the server's schedule wants; no Temporal here, so the zone offset comes from Intl,
 * checked twice across a DST edge). The Chapter page's rules live in @/lib/meetings/book.
 */
import type { CalendarEvent, MeResponse } from "@/lib/api-types";
import { parseClock } from "~/today/time";

export const MANAGE_EVENTS = 1 << 2;
export const MANAGE_ATTENDANCE = 1 << 6;

const hasBit = (me: MeResponse, bit: number) => me.isAdmin || (me.permissions & bit) !== 0;
export const canEvents = (me: MeResponse) => hasBit(me, MANAGE_EVENTS);
export const canAttendance = (me: MeResponse) => hasBit(me, MANAGE_ATTENDANCE);

export const isMeeting = (e: CalendarEvent) => e.category === "chapter";

/** Minutes after midnight the event starts, from its "HH:MM" or "7:00 PM" time. */
export const minutesOf = (e: Pick<CalendarEvent, "time">): number | null => parseClock(e.time);

/* The page's rules (on deck, the book, previews, the digest, the roll) are shared with the
 * web: @/lib/meetings/book. What stays here is the app's own: permission bits and the form. */

const weekdayOf = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay();

/** "7:00 PM" from minutes after midnight. */
export function clock12(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export { LOW_PCT, shortDate } from "@/lib/meetings/book";

/* ── the form ─────────────────────────────────────────────────────────────────── */

const mode = <T,>(xs: T[]): T | null => {
  const n = new Map<T, number>();
  let best: T | null = null, top = 0;
  for (const x of xs) { const k = (n.get(x) ?? 0) + 1; n.set(x, k); if (k > top) { top = k; best = x; } }
  return best;
};

export function addDays(iso: string, n: number): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface Draft { title: string; date: string; minutes: number | null; location: string; mandatory: boolean }

/** A new meeting: the usual weekday, time and room from the ones already held. */
export function meetingDraft(events: CalendarEvent[], today: string, term: { startDate: string; endDate: string } | null): Draft {
  const meetings = events.filter(isMeeting);
  const dow = mode(meetings.map(e => weekdayOf(e.date)));
  const min = mode(meetings.map(minutesOf).filter((m): m is number => m != null));
  const room = mode(meetings.map(e => (e.location ?? "").trim()).filter(Boolean));
  const taken = new Set(meetings.map(e => e.date));
  let date = term && today < term.startDate ? term.startDate : today;
  if (dow != null) {
    for (let i = 0; i < 14; i++) {
      const d = addDays(date, i);
      if (weekdayOf(d) === dow && !taken.has(d)) { date = d; break; }
    }
  }
  if (term && date > term.endDate) date = term.endDate;
  return { title: "Chapter Meeting", date, minutes: min ?? 19 * 60, location: room ?? "", mandatory: true };
}

export function eventDraft(today: string): Draft {
  return { title: "", date: today, minutes: 19 * 60, location: "", mandatory: false };
}

/** The draft an existing event edits from (its wall time read in the chapter's zone). */
export function draftOf(e: CalendarEvent, zone: string): Draft {
  let minutes = minutesOf(e);
  if (e.schedule?.kind === "timed") {
    const w = wallOf(e.schedule.start, e.schedule.timeZone || zone);
    if (w) minutes = w.minutes;
  }
  return { title: e.title, date: e.date, minutes, location: e.location ?? "", mandatory: e.mandatory };
}

/** Every date from `start` stepping `every` weeks through `until` (lib/event-repeat). */
export function repeatDates(start: string, every: 1 | 2, until: string, cap = 60): string[] {
  const out: string[] = [];
  for (let d = start; d <= until && out.length < cap; d = addDays(d, 7 * every)) out.push(d);
  return out;
}

/* ── zones ────────────────────────────────────────────────────────────────────── */

export const deviceZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function fmtFor(zone: string) {
  let f = partsFmt.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    partsFmt.set(zone, f);
  }
  return f;
}

/** The wall clock in `zone` at a UTC instant. */
function wallParts(ms: number, zone: string) {
  const p: Record<string, number> = {};
  for (const x of fmtFor(zone).formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year!, mo: p.month!, d: p.day!, h: p.hour! % 24, mi: p.minute!, s: p.second! };
}

const offsetAt = (ms: number, zone: string) => {
  const w = wallParts(ms, zone);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
};

/** "2026-11-20" + 19:00 in America/New_York → "2026-11-21T00:00:00Z". */
export function wallToInstant(date: string, minutes: number, zone: string): string {
  const guess = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Math.floor(minutes / 60), minutes % 60);
  let t = guess - offsetAt(guess, zone);
  const second = offsetAt(t, zone);
  t = guess - second;
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function wallOf(instant: string, zone: string): { date: string; minutes: number } | null {
  const ms = Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  try {
    const w = wallParts(ms, zone);
    return { date: `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`, minutes: w.h * 60 + w.mi };
  } catch { return null; }
}

/** "Eastern", "PST": a short name for a zone, for the form's footnote. */
export function zoneName(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? zone;
  } catch { return zone; }
}
