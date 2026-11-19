/**
 * Pure rules for Meetings, ported from the web's Chapter page (app/org/[slug]/chapter/
 * page.tsx) and lib/agenda-template.ts:
 *
 *   meetings      the calendar's "chapter" events
 *   on deck       the earliest one that isn't over (over = an earlier day, or today and an
 *                 hour and a half past its start); past = the rest, newest first
 *   has minutes   written beyond the agenda a template copied in (hasMinutes)
 *   preview       the summary's gist, else the minutes' first lines (notesPreview)
 *   low turnout   a taken roll under 70% (LOW_TURNOUT)
 *   digest        "Chapter meets Thursday at 7:00 PM in …. 6 meetings this term, turnout
 *                 averaging 84%, but Oct 2 still has no minutes."
 *
 * Plus the form's arithmetic: the usual weekday / time / room, and a wall-clock time in
 * the chapter's zone as the instant the server's schedule wants (no Temporal here, so the
 * zone offset comes from Intl, checked twice across a DST edge).
 */
import type { AttendanceSummaryRow, CalendarEvent, MeetingSummaryBody, MeResponse } from "@/lib/api-types";
import { daysFrom, parseClock } from "~/today/time";

export const MANAGE_EVENTS = 1 << 2;
export const MANAGE_ATTENDANCE = 1 << 6;
const LOW_TURNOUT = 0.7;
const OVER_AFTER_MIN = 90;

const hasBit = (me: MeResponse, bit: number) => me.isAdmin || (me.permissions & bit) !== 0;
export const canEvents = (me: MeResponse) => hasBit(me, MANAGE_EVENTS);
export const canAttendance = (me: MeResponse) => hasBit(me, MANAGE_ATTENDANCE);

export const isMeeting = (e: CalendarEvent) => e.category === "chapter";

const byWhen = (a: CalendarEvent, b: CalendarEvent) =>
  a.date.localeCompare(b.date) || (minutesOf(a) ?? -1) - (minutesOf(b) ?? -1) || a.id - b.id;

/** Minutes after midnight the event starts, from its "HH:MM" or "7:00 PM" time. */
export const minutesOf = (e: Pick<CalendarEvent, "time">): number | null => parseClock(e.time);

export function isOver(e: CalendarEvent, today: string, nowMin: number): boolean {
  if (e.date < today) return true;
  if (e.date > today) return false;
  const m = minutesOf(e);
  return m != null && nowMin > m + OVER_AFTER_MIN;
}

export function splitMeetings(events: CalendarEvent[], today: string, nowMin: number) {
  const meetings = events.filter(isMeeting);
  const upcoming = meetings.filter(e => !isOver(e, today, nowMin)).sort(byWhen);
  const past = meetings.filter(e => isOver(e, today, nowMin)).sort((a, b) => byWhen(b, a));
  return { next: upcoming[0] ?? null, later: upcoming.slice(1), past };
}

/* ── minutes ──────────────────────────────────────────────────────────────────── */

const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;

export function hasMinutes(e: Pick<CalendarEvent, "description" | "notesSeed">): boolean {
  const notes = (e.description ?? "").trim();
  if (!notes) return false;
  const seed = (e.notesSeed ?? "").trim();
  return !seed || notes !== seed;
}

export function minutesBeyondAgenda(e: Pick<CalendarEvent, "description" | "notesSeed">): string {
  const notes = e.description ?? "";
  const seed = e.notesSeed ?? "";
  if (!seed.trim()) return notes.trim();
  const untouched = new Set(seed.split("\n").map(l => l.trim()).filter(l => l && !HEADING.test(l)));
  return notes.split("\n").filter(l => !untouched.has(l.trim())).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** lib/meeting-summary.ts, as far as the ledger needs it: the gist, if the data has one. */
function gistOf(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const g = (data as Partial<MeetingSummaryBody>).gist;
  return typeof g === "string" && g.trim() ? g.trim() : null;
}

export function notesPreview(e: CalendarEvent): string {
  const gist = gistOf(e.notesSummaryData);
  if (gist) return gist;
  const summary = (e.notesSummary ?? "").split("\n").map(l => l.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim()).find(Boolean);
  if (summary) return summary;
  return minutesBeyondAgenda(e)
    .split("\n")
    .filter(l => !HEADING.test(l))
    .map(l => l.replace(/^[-*•]\s*/, "").replace(/^\[[ xX]\]\s*/, "").trim())
    .filter(l => l && !/^(opened|closed|agenda|action items)\b/i.test(l))
    .slice(0, 2)
    .join(" · ");
}

export const isSummarized = (e: CalendarEvent) => !!gistOf(e.notesSummaryData) || !!(e.notesSummary ?? "").trim();

/* ── the roll ─────────────────────────────────────────────────────────────────── */

export const taken = (r: AttendanceSummaryRow | undefined): r is AttendanceSummaryRow => !!r && r.eligible > 0;
export const isLow = (r: AttendanceSummaryRow | undefined) => taken(r) && r.present / r.eligible < LOW_TURNOUT;
export const LOW_PCT = LOW_TURNOUT * 100;

export type PastFilter = "all" | "missing" | "low";

export function filterPast(past: CalendarEvent[], rows: Map<number, AttendanceSummaryRow>, f: PastFilter): CalendarEvent[] {
  if (f === "missing") return past.filter(e => !hasMinutes(e));
  if (f === "low") return past.filter(e => isLow(rows.get(e.id)));
  return past;
}

/* ── the digest ───────────────────────────────────────────────────────────────── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const shortDate = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const weekdayOf = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).getDay();

function andList(items: string[]) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "7:00 PM" from minutes after midnight. */
export function clock12(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function whenPhrase(e: CalendarEvent, today: string): string {
  const n = daysFrom(today, e.date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n > 1 && n < 7) return DOWS_LONG[weekdayOf(e.date)]!;
  return shortDate(e.date);
}

export interface Digest { lead: string; strong: string; rest: string }

/** The briefing line, in three runs so the screen can ink the middle one. */
export function digest(next: CalendarEvent | null, past: CalendarEvent[], rows: Map<number, AttendanceSummaryRow>, today: string, term: { startDate: string; endDate: string } | null): Digest[] {
  const out: Digest[] = [];
  if (next) {
    const m = minutesOf(next);
    out.push({ lead: "Chapter meets ", strong: `${whenPhrase(next, today)}${m != null ? ` at ${clock12(m)}` : ""}`, rest: next.location ? ` in ${next.location}.` : "." });
  } else {
    out.push({ lead: "Nothing is on deck.", strong: "", rest: "" });
  }
  const held = past.filter(e => !term || (e.date >= term.startDate && e.date <= term.endDate));
  if (!held.length) { out.push({ lead: " This is the first one: its minutes start the book.", strong: "", rest: "" }); return out; }
  const counted = held.map(e => rows.get(e.id)).filter(taken);
  const present = counted.reduce((n, r) => n + r.present, 0);
  const eligible = counted.reduce((n, r) => n + r.eligible, 0);
  const missing = held.filter(e => !hasMinutes(e));
  const avg = eligible ? `, turnout averaging ${Math.round((present / eligible) * 100)}%` : "";
  out.push({ lead: " ", strong: `${held.length} ${held.length === 1 ? "meeting" : "meetings"}`, rest: ` this term${avg}` });
  if (!missing.length) out.push({ lead: ", every one with minutes.", strong: "", rest: "" });
  else if (missing.length <= 3) out.push({ lead: ", but ", strong: andList(missing.map(e => shortDate(e.date))), rest: ` still ${missing.length === 1 ? "has" : "have"} no minutes.` });
  else out.push({ lead: ", but ", strong: `${missing.length} of them`, rest: " still have no minutes." });
  return out;
}

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
