/**
 * The Timeline's rules (app/org/[slug]/timeline/page.tsx), shared with the native app
 * (mobile/src/timeline): which rows the line holds, how the filter cuts them, how they
 * fall into months either side of Today, and the briefing's digest line.
 *
 * Everything that needs a time zone (is this event over? when does it start? what's
 * its clock time?) is passed in, because the web reads it with Temporal
 * (lib/event-time) and the app with its own port; the rules themselves are here once.
 *
 * Pure: no Node, Prisma, Temporal or React (scripts/lint-mobile-imports.py, SHARED).
 */
import type { CalendarEvent, Task } from "@/lib/api-types";
import { taskAssigneeLabel } from "@/lib/dashboard/plate";

/* ── the rows ─────────────────────────────────────────────────────────────────── */

/** Live tasks and Instagram posts fold in with offset ids so they can't collide with
 *  a real CalendarEvent id; subtract the base to get the source row back. */
export const DEADLINE_ID_BASE = 10000;
export const IG_ID_BASE = 30000;

export interface TimelinePost { id: number; title: string; dueDate: string; type: string; status: string }

export interface TimelineRows {
  /** Every row on the line: calendar events, then dated tasks and posts as deadlines. */
  all: CalendarEvent[];
  /** Completion for the folded task and post rows; plain events have no entry. */
  doneById: Map<number, boolean>;
  /** Who a dated task is on ("Treasurer", "Everyone"), by row id. */
  ownerById: Map<number, string>;
  /** Ids that are real calendar events (editable, exportable, excusable). */
  eventIds: Set<number>;
}

/**
 * The line: calendar events plus every DATED task (a dated task is a deadline; undated
 * to-dos live on Tasks) and every Instagram post. A legacy "deadline" calendar row
 * whose title matches a live task or post is the same thing twice, so it drops out.
 * `hidden` = ids mid-delete, gone everywhere while the delete settles.
 */
export function timelineRows(events: CalendarEvent[], tasks: Task[], posts: TimelinePost[], hidden: ReadonlySet<number> = new Set()): TimelineRows {
  const dated = tasks.filter(t => t.dueDate != null);
  const live: CalendarEvent[] = [
    ...dated.map(t => ({
      id: DEADLINE_ID_BASE + t.id, title: t.title, date: t.dueDate as string, category: "deadline", mandatory: false,
      description: `${taskAssigneeLabel(t)} · ${t.status === "done" ? "Done" : "Open"}`,
    })),
    ...posts.map(p => ({
      id: IG_ID_BASE + p.id, title: p.title, date: p.dueDate, category: "deadline", mandatory: false,
      description: `Instagram ${p.type} · Status: ${p.status}`,
    })),
  ];
  const liveTitles = new Set([...tasks.map(t => t.title), ...posts.map(p => p.title)]);
  const kept = events.filter(e => !hidden.has(e.id) && (e.category !== "deadline" || !liveTitles.has(e.title)));

  const doneById = new Map<number, boolean>();
  for (const t of dated) doneById.set(DEADLINE_ID_BASE + t.id, t.status === "done");
  for (const p of posts) doneById.set(IG_ID_BASE + p.id, p.status === "posted");
  const ownerById = new Map(dated.map(t => [DEADLINE_ID_BASE + t.id, taskAssigneeLabel(t)] as const));
  return { all: [...kept, ...live], doneById, ownerById, eventIds: new Set(events.map(e => e.id)) };
}

/** The source task id behind a folded deadline row, or null. */
export function taskIdOf(row: { id: number; category: string }): number | null {
  if (row.category !== "deadline") return null;
  const id = row.id - DEADLINE_ID_BASE;
  return id > 0 && id < DEADLINE_ID_BASE ? id : null;
}

/** The source post id behind a folded Instagram row, or null. */
export function postIdOf(row: { id: number; category: string }): number | null {
  return row.category === "deadline" && row.id >= IG_ID_BASE ? row.id - IG_ID_BASE : null;
}

/* ── the filter ───────────────────────────────────────────────────────────────── */

export type CalLayer = "all" | "mandatory" | "deadlines" | "parties" | "service";

/** The segmented filter, in order. `mandatory` reads as "Required". */
export const LAYERS: { id: CalLayer; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mandatory", label: "Required" },
  { id: "deadlines", label: "Deadlines" },
  { id: "parties", label: "Parties" },
  { id: "service", label: "Service" },
];

export function filterByLayer<E extends { mandatory: boolean; category: string }>(events: E[], layer: CalLayer): E[] {
  switch (layer) {
    case "all": return events;
    case "mandatory": return events.filter(e => e.mandatory);
    case "deadlines": return events.filter(e => e.category === "deadline");
    case "parties": return events.filter(e => e.category === "party");
    case "service": return events.filter(e => e.category === "service");
  }
}

export function layerCounts(events: { mandatory: boolean; category: string }[]): Record<CalLayer, number> {
  return Object.fromEntries(LAYERS.map(l => [l.id, filterByLayer(events, l.id).length])) as Record<CalLayer, number>;
}

/* ── months either side of Today ──────────────────────────────────────────────── */

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface MonthGroup<E = CalendarEvent> {
  id: string;
  monthLabel: string;
  year: number;
  isCurrentMonth: boolean;
  events: E[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Buckets already-sorted events into months, oldest first. `fileDate` picks the date an event files under. */
export function groupByMonth<E extends { date: string }>(sorted: E[], today: string, fileDate: (e: E) => string = e => e.date): MonthGroup<E>[] {
  const [ty, tm] = today.split("-").map(Number);
  const groups: MonthGroup<E>[] = [];
  for (const e of sorted) {
    const [yr, mo] = fileDate(e).split("-").map(Number) as [number, number];
    const key = `${yr}-${pad(mo)}`;
    let g = groups[groups.length - 1];
    if (!g || g.id !== key) {
      g = { id: key, monthLabel: MONTH_NAMES[mo - 1]!, year: yr, isCurrentMonth: yr === ty && mo === tm, events: [] };
      groups.push(g);
    }
    g.events.push(e);
  }
  return groups;
}

/** Upcoming months whose first event is further out than this start folded. */
export const OPEN_HORIZON_DAYS = 42;

export interface TimelineSections<E = CalendarEvent> {
  /** Finished events by month, shown only when the Earlier bar is open. */
  past: MonthGroup<E>[];
  pastCount: number;
  /** Everything not yet over, soonest first, read straight down from Today. */
  upcoming: MonthGroup<E>[];
  /** Upcoming months that start folded (beyond the horizon, never the first). */
  defaultCollapsed: Set<string>;
}

/**
 * One reading direction, split at now: the finished past folds into one bar above the
 * Today marker, everything still ahead runs soonest-first below it. Split on "is it
 * over", not on the date, so a 9am meeting has moved above the line by the afternoon,
 * and a multi-day event that began last month but is still running files under this
 * month.
 */
export function buildTimeline<E extends { date: string }>(events: E[], today: string, compare: (a: E, b: E) => number, isOver: (e: E) => boolean): TimelineSections<E> {
  const sorted = [...events].sort(compare);
  const past = sorted.filter(isOver);
  const upcoming = sorted.filter(e => !isOver(e));
  const upcomingGroups = groupByMonth(upcoming, today, e => (e.date < today ? today : e.date));
  const defaultCollapsed = new Set(
    upcomingGroups.filter((g, i) => i > 0 && daysBetween(today, g.events[0]!.date) > OPEN_HORIZON_DAYS).map(g => g.id),
  );
  return { past: groupByMonth(past, today), pastCount: past.length, upcoming: upcomingGroups, defaultCollapsed };
}

/** The finished deadlines nobody ticked: the Earlier bar's "N overdue". */
export function overdueInPast<E extends { id: number }>(s: TimelineSections<E>, doneById: ReadonlyMap<number, boolean>): number {
  return s.past.reduce((n, g) => n + g.events.filter(e => doneById.get(e.id) === false).length, 0);
}

/** "Today", "Tomorrow", "Yesterday", "In 3 days", "2 days ago". */
export function relWhen(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0) return `In ${diff} days`;
  return `${-diff} days ago`;
}

/** "THU" for a date. */
export const dowOf = (date: string) => DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()]!.toUpperCase();

/** "Nov 19". */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${MONTH_NAMES[m - 1]!.slice(0, 3)} ${d}`;
}

/* ── the digest ───────────────────────────────────────────────────────────────── */

/** A run of the digest line; `bold` runs are the web's <b>. */
export interface DigestPart { text: string; bold?: boolean }

/**
 * The briefing line, read off the calendar (no model): what's left this week with its
 * day, then anything overdue. "3 things left this week — Chapter meeting tonight at
 * 7:30, Risk forms due Thursday and …". `start` is an event's start clock ("7:00 PM"),
 * null when it has none; `overdue` counts open tasks past due.
 */
export function timelineDigest<E extends CalendarEvent>(i: {
  all: E[]; today: string; weekStart: string; weekEnd: string; overdue: number;
  compare: (a: E, b: E) => number; isOver: (e: E) => boolean; start: (e: E) => string | null;
}): DigestPart[] | null {
  if (i.all.length === 0) return null;
  const sorted = [...i.all].sort(i.compare);
  const left = sorted.filter(e => e.date >= i.weekStart && e.date <= i.weekEnd && !i.isOver(e));
  const upNext = sorted.find(e => !i.isOver(e)) ?? null;
  const last = sorted[sorted.length - 1] ?? null;
  const dayOf = (e: E) => {
    const diff = daysBetween(i.today, e.date);
    const start = i.start(e);
    const evening = start != null && / PM$/.test(start) && Number(start.split(":")[0]) % 12 >= 5;
    const day = diff <= 0 ? (evening ? "tonight" : "today") : diff === 1 ? "tomorrow" : DAY_NAMES_LONG[new Date(`${e.date}T12:00:00Z`).getUTCDay()]!;
    return diff <= 1 && start ? `${day} at ${start.replace(/ (AM|PM)$/, "")}` : day;
  };
  const overdue: DigestPart[] = i.overdue > 0 ? [{ text: " " }, { text: `${i.overdue} deadline${i.overdue === 1 ? " is" : "s are"} overdue.`, bold: true }] : [];
  if (left.length > 0) {
    const shown = left.slice(0, 4);
    const out: DigestPart[] = [{ text: `${left.length} thing${left.length === 1 ? "" : "s"} left this week — ` }];
    shown.forEach((e, k) => {
      if (k > 0) out.push({ text: k === shown.length - 1 ? " and " : ", " });
      out.push({ text: `${e.title}${e.category === "deadline" ? " due " : " "}` }, { text: dayOf(e), bold: true });
    });
    out.push({ text: `${left.length > 4 ? `, plus ${left.length - 4} more` : ""}.` }, ...overdue);
    return out;
  }
  if (upNext) return [{ text: `Nothing else this week — next up is ${upNext.title} on ` }, { text: shortDate(upNext.date), bold: true }, { text: "." }, ...overdue];
  return [{ text: last ? `Nothing’s on the books past ${shortDate(last.date)}.` : "Nothing coming up." }, ...overdue];
}
