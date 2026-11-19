/**
 * The Chapter page's rules (app/org/[slug]/chapter/page.tsx), shared with the native app
 * (mobile/src/app/(tabs)/more/meetings.tsx, meeting/[id].tsx): which meeting is on deck,
 * the book of past ones and its filters, the briefing's digest, the On deck attendance
 * block, the ledger row's preview, and the minutes sheet's labels.
 *
 * Anything that needs a time zone (is this meeting over? which comes first? its clock
 * time? its start and end instants?) is passed in, because the web reads it with Temporal
 * (lib/event-time) and the app with its own port; the rules themselves live here once.
 *
 * Pure: no Node, Prisma, Temporal or React (scripts/lint-mobile-imports.py, SHARED).
 */
import type { AttendanceSummaryRow, CalendarEvent } from "@/lib/api-types";
import { hasMinutes, headingOf, minutesBeyondAgenda } from "@/lib/agenda-template";
import { notesSummaryStale } from "@/lib/collaboration/notes-protocol";
import { parseMeetingSummary } from "@/lib/meeting-summary";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOWS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A taken roll under this share of the room is "low turnout". */
export const LOW_TURNOUT = 0.7;
export const LOW_PCT = LOW_TURNOUT * 100;

/* ── dates ─────────────────────────────────────────────────────────────────────── */

export function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** "Nov 18" (app/data fmtDate). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}`;
}

/** Whole days from `today` to `iso` (negative when it's past). */
export function daysFrom(today: string, iso: string): number {
  const a = new Date(`${today}T12:00:00`), b = new Date(`${iso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** The ledger's date stub: "Wed / 18 / Nov". */
export function dateParts(iso: string): { dow: string; dnum: number; mon: string } {
  const dt = localDate(iso);
  return { dow: DOWS[dt.getDay()]!, dnum: dt.getDate(), mon: MONTHS[dt.getMonth()]! };
}

/** "Today" / "Tomorrow" / "In 6 days" / "Yesterday" / "3 days ago". */
export function relativeWhen(iso: string, today: string): string {
  const diff = daysFrom(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  if (diff === -1) return "Yesterday";
  return `${Math.abs(diff)} days ago`;
}

/** "tonight" / "today" / "tomorrow" / "on Wednesday" / "on Oct 14", for prose.
 *  `start` is the meeting's start clock ("7:00 PM"), or null. */
export function whenPhrase(e: Pick<CalendarEvent, "date">, today: string, start: string | null): string {
  const diff = daysFrom(today, e.date);
  if (diff === 0) return /PM/i.test(start ?? "") ? "tonight" : "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1 && diff < 7) return `on ${DOWS_LONG[localDate(e.date).getDay()]}`;
  return `on ${shortDate(e.date)}`;
}

export function andList(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Oct 10" from an action item's yyyy-mm-dd due date. */
export const dueLabel = (iso: string) => shortDate(iso);

/* ── minutes ──────────────────────────────────────────────────────────────────── */

/** "Has minutes" means written beyond the agenda a template copied in. */
export const hasNotes = (e: Pick<CalendarEvent, "description" | "notesSeed">) => hasMinutes(e);

export const isSummarized = (e: Pick<CalendarEvent, "notesSummary">) => !!(e.notesSummary ?? "").trim();

/** The ledger row's one line: the summary's gist, else the minutes' first lines. */
export function notesPreview(e: Pick<CalendarEvent, "description" | "notesSeed" | "notesSummary" | "notesSummaryData">): string {
  const data = parseMeetingSummary(e.notesSummaryData);
  if (data?.gist) return data.gist;
  const summary = (e.notesSummary ?? "").split("\n").map(l => l.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim()).find(Boolean);
  if (summary) return summary;
  return minutesBeyondAgenda(e)
    .split("\n")
    .filter(l => !headingOf(l))
    .map(l => l.replace(/^[-*•]\s*/, "").trim())
    .filter(l => l && !/^(opened|closed|agenda|action items)\b/i.test(l))
    .slice(0, 2)
    .join(" · ");
}

/* ── the roll ─────────────────────────────────────────────────────────────────── */

export const taken = (r: AttendanceSummaryRow | undefined): r is AttendanceSummaryRow => !!r && r.eligible > 0;
export const isLow = (r: AttendanceSummaryRow | undefined) => taken(r) && r.present / r.eligible < LOW_TURNOUT;

/* ── the book ─────────────────────────────────────────────────────────────────── */

/** On deck = the earliest meeting that isn't over; past = the rest, newest first.
 *  `later` (still ahead after the next one) lives on the Timeline. */
export function splitMeetings<E extends CalendarEvent>(events: E[], compare: (a: E, b: E) => number, isOver: (e: E) => boolean) {
  const upcoming = events.filter(e => !isOver(e)).sort(compare);
  const past = events.filter(e => isOver(e)).sort((a, b) => compare(b, a));
  return { next: upcoming[0] ?? null, later: upcoming.slice(1), past };
}

export type PastFilter = "all" | "missing" | "low";

/** The book's tabs: All, No minutes, Under 70%, each with its own list. */
export function bookTabs<E extends CalendarEvent>(past: E[], rows: ReadonlyMap<number, AttendanceSummaryRow>) {
  const missing = past.filter(e => !hasNotes(e));
  const low = past.filter(e => isLow(rows.get(e.id)));
  const lists: Record<PastFilter, E[]> = { all: past, missing, low };
  const tabs: { key: PastFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: past.length },
    { key: "missing", label: "No minutes", count: missing.length },
    { key: "low", label: `Under ${LOW_PCT}%`, count: low.length },
  ];
  return { lists, tabs };
}

/** What an empty tab says. */
export const emptyTabLine = (f: PastFilter) => (f === "missing" ? "Every past meeting has minutes." : `No meeting dipped under ${LOW_PCT}%.`);

/** "4 meetings · newest first". */
export const bookCount = (n: number) => `${n} meeting${n === 1 ? "" : "s"} · newest first`;

/** One ledger row, as the page draws it. */
export function ledgerRow(e: CalendarEvent, row: AttendanceSummaryRow | undefined) {
  const filed = hasNotes(e);
  return {
    parts: dateParts(e.date),
    filed,
    preview: filed ? notesPreview(e) : "",
    summarized: isSummarized(e),
    optional: !e.mandatory,
    tag: filed ? "Minutes" : "No minutes",
    stat: taken(row) ? `${row.present}/${row.eligible}` : "—",
    low: isLow(row),
    counted: taken(row),
  };
}
export const MISSING_LINE = "Minutes not filed — add notes before the next meeting.";

/** This term's books, for the digest: the meetings held, average turnout, the ones still missing minutes. */
export function termBooks<E extends CalendarEvent>(past: E[], rows: ReadonlyMap<number, AttendanceSummaryRow>, term: { startDate: string; endDate: string } | null) {
  const held = past.filter(e => !term || (e.date >= term.startDate && e.date <= term.endDate));
  const counted = held.map(e => rows.get(e.id)).filter(taken);
  const present = counted.reduce((n, r) => n + r.present, 0);
  const eligible = counted.reduce((n, r) => n + r.eligible, 0);
  return { held, avg: eligible ? Math.round((present / eligible) * 100) : null, missing: held.filter(e => !hasNotes(e)) };
}

/** A run of the digest; `b` runs are set in bold. */
export interface Run { text: string; b?: boolean }

/** The briefing's digest, as runs (the web wraps the bold ones in <b>, the app in a heavier weight).
 *  `start` reads a meeting's start clock ("7:00 PM"). Empty for an empty calendar (day one). */
export function digestRuns<E extends CalendarEvent>(args: {
  count: number; next: E | null; past: E[]; rows: ReadonlyMap<number, AttendanceSummaryRow>;
  term: { startDate: string; endDate: string } | null; today: string; start: (e: E) => string | null;
}): Run[] {
  const { next, today, start } = args;
  if (args.count === 0) return [{ text: "No meetings on the calendar yet. Schedule the first one and this page becomes the chapter’s minute book: what was said, who was there, and who owes what." }];
  const out: Run[] = [];
  if (next) {
    const at = start(next);
    out.push({ text: "Chapter meets " }, { text: `${whenPhrase(next, today, at)}${at ? ` at ${at}` : ""}`, b: true }, { text: `${next.location ? ` in ${next.location}` : ""}. ` });
  } else out.push({ text: "Nothing is on deck. " });
  const t = termBooks(args.past, args.rows, args.term);
  if (!t.held.length) { out.push({ text: "This is the first one — its minutes start the book." }); return out; }
  out.push({ text: `${t.held.length} meeting${t.held.length === 1 ? "" : "s"}`, b: true }, { text: " on the books this term" });
  if (t.avg != null) out.push({ text: ", turnout averaging " }, { text: `${t.avg}%`, b: true });
  if (!t.missing.length) out.push({ text: ", every one with minutes." });
  else if (t.missing.length <= 3) out.push({ text: " — but " }, { text: andList(t.missing.map(e => shortDate(e.date))), b: true }, { text: ` still ${t.missing.length === 1 ? "has" : "have"} no minutes.` });
  else out.push({ text: " — but " }, { text: `${t.missing.length} of them`, b: true }, { text: " still have no minutes." });
  return out;
}

/* ── On deck ──────────────────────────────────────────────────────────────────── */

export type LiveWindow = { presentCount: number; eligibleCount: number } | null;

/** The On deck card's attendance block: optional, check-in open, marked, or not yet taken. */
export function onDeckRoll(e: Pick<CalendarEvent, "mandatory" | "date">, row: AttendanceSummaryRow | undefined, live: LiveWindow, today: string) {
  const isToday = daysFrom(today, e.date) === 0;
  const pct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);
  if (!e.mandatory) return { kind: "optional" as const, label: "Attendance", msg: "Optional meeting — no roll is taken, and it doesn’t touch anyone’s standing." };
  if (live) return {
    kind: "live" as const, label: "Check-in open", present: live.presentCount, of: live.eligibleCount,
    presentPct: pct(live.presentCount, live.eligibleCount), msg: "Anyone who hasn’t checked in when it closes is marked absent.",
  };
  if (taken(row)) {
    const absent = Math.max(row.eligible - row.present, 0);
    return {
      kind: "taken" as const, label: "Attendance marked", present: row.present, of: row.eligible, absent, excused: row.excused,
      presentPct: pct(row.present, row.eligible), absentPct: pct(absent, row.eligible),
    };
  }
  return {
    kind: "pending" as const, label: "Attendance not taken yet", expected: (row as AttendanceSummaryRow | undefined)?.expected ?? 0,
    msg: isToday ? "Mark who’s there once the meeting starts." : "Opens on the day. Excuses filed before then are already counted.",
  };
}
export type OnDeckRoll = ReturnType<typeof onDeckRoll>;

/** "Next meeting" or "Today"/"Tonight", and "Wed · Nov 25 · in 6 days". */
export function onDeckHead(e: Pick<CalendarEvent, "date">, today: string, start: string | null) {
  const isToday = daysFrom(today, e.date) === 0;
  return {
    isToday,
    pill: isToday ? (whenPhrase(e, today, start) === "tonight" ? "Tonight" : "Today") : "Next meeting",
    when: `${dateParts(e.date).dow} · ${shortDate(e.date)}${isToday ? "" : ` · ${relativeWhen(e.date, today).toLowerCase()}`}`,
  };
}

/** "2 excuses waiting for review · Owen and Tariq". */
export const excuseLine = (names: string[]) =>
  `${names.length} excuse${names.length === 1 ? "" : "s"} waiting for review · ${andList(names.map(n => n.split(" ")[0]!))}`;

/* ── the minutes sheet ────────────────────────────────────────────────────────── */

/** The ticket's / chip's attendance words. */
export function attLabel(e: Pick<CalendarEvent, "mandatory">, row: AttendanceSummaryRow | undefined, canTake: boolean): string {
  if (!e.mandatory) return "Optional — no roll";
  if (taken(row)) return `${row.present} of ${row.eligible} present`;
  return canTake ? "Take attendance" : "Attendance";
}

/** How far into the meeting we are (the phone ticket's clock bar); null outside it. */
export function meetingProgress(start: Date | null, end: Date | null, now: Date): { mins: number; left: number; pct: number } | null {
  if (!start || !end) return null;
  const s = start.getTime(), en = end.getTime(), n = now.getTime();
  if (n < s || n >= en) return null;
  const mins = Math.floor((n - s) / 60_000);
  return { mins, left: Math.max(0, Math.ceil((en - n) / 60_000)), pct: Math.round(((n - s) / (en - s)) * 100) };
}
export const fmtMins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);

/** The `## ` section a position in the minutes falls under. */
export function sectionAt(text: string, pos: number): string {
  let section = "", at = 0;
  for (const line of text.split("\n")) {
    if (at > pos) break;
    const m = /^##\s+(.*)/.exec(line);
    if (m) section = m[1]!.trim();
    at += line.length + 1;
  }
  return section;
}

/** The Summary tab's badge: open action items, "!" when the minutes changed since, nothing before a summary. */
export function summaryBadge(e: Parameters<typeof notesSummaryStale>[0] & Pick<CalendarEvent, "notesSummaryData">, running: boolean): { text: string; warn: boolean } | null {
  if (running) return { text: "…", warn: false };
  const data = parseMeetingSummary(e.notesSummaryData);
  if (!data) return null;
  if (notesSummaryStale(e)) return { text: "!", warn: true };
  return { text: String(data.actions.filter(a => !a.done).length), warn: false };
}

export { notesSummaryStale };
