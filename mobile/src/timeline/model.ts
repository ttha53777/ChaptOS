/**
 * Pure Timeline rules, matching the web timeline (app/org/[slug]/timeline/page.tsx):
 * calendar events plus every DATED task folded in as a deadline (an undated task is a
 * to-do and lives only in Tasks). Soonest first within a day; a day's deadlines sit
 * after its timed events ("due end of day"). Before today = Earlier.
 */
import type { CalEventType, CalendarEvent, Task } from "@/lib/api-types";
import type { Palette, Tone } from "~/theme/palette";
import { TONES } from "~/theme/palette";
import { clockLabel, daysFrom, dayStart, monthDay, parseClock, weekdayShort } from "~/today/time";

export type Row =
  | { kind: "event"; key: string; date: string; event: CalendarEvent }
  | { kind: "deadline"; key: string; date: string; task: Task };

export function buildRows(events: CalendarEvent[], tasks: Task[] | undefined): Row[] {
  const rows: Row[] = [
    ...events.map(e => ({ kind: "event" as const, key: `e${e.id}`, date: e.date, event: e })),
    ...(tasks ?? []).filter(t => t.dueDate != null).map(t => ({ kind: "deadline" as const, key: `t${t.id}`, date: t.dueDate!, task: t })),
  ];
  return rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : minutesOf(a) - minutesOf(b) || a.key.localeCompare(b.key));
}

function minutesOf(r: Row): number {
  if (r.kind === "deadline") return 24 * 60 + (parseClock(r.task.dueTime) ?? 0);
  return parseClock(r.event.time) ?? 23 * 60;
}

export interface Month { key: string; label: string; year: string; rows: Row[] }

export function byMonth(rows: Row[]): Month[] {
  const out: Month[] = [];
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    let m = out[out.length - 1];
    if (!m || m.key !== key) {
      const d = dayStart(`${key}-01`);
      m = { key, label: d.toLocaleDateString(undefined, { month: "long" }), year: String(d.getFullYear()), rows: [] };
      out.push(m);
    }
    m.rows.push(r);
  }
  return out;
}

/** "Tonight · 7:00 PM", "Tomorrow · 8:00 PM", "Fri · 8:00 PM", "Dec 8", "Due end of day". */
export function whenLabel(r: Row, today: string): string {
  const n = daysFrom(today, r.date);
  const clock = r.kind === "event" ? clockLabel(r.event.time) : clockLabel(r.task.dueTime);
  const mins = r.kind === "event" ? parseClock(r.event.time) : null;
  const day = n === 0 ? (mins != null && mins >= 17 * 60 ? "Tonight" : "Today")
    : n === 1 ? "Tomorrow" : n === -1 ? "Yesterday"
    : n > 1 && n < 7 ? weekdayShort(r.date) : monthDay(r.date);
  if (r.kind === "deadline") return clock ? `${day} · by ${clock}` : n === 0 ? "Due today" : day;
  return clock ? `${day} · ${clock}` : day;
}

/** "in 3 days", "today", "2 weeks ago" for the sheet's hero. */
export function relWords(date: string, today: string): string {
  const n = daysFrom(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return n < 14 ? `in ${n} days` : `in ${Math.round(n / 7)} weeks`;
  return -n < 14 ? `${-n} days ago` : `${Math.round(-n / 7)} weeks ago`;
}

/* ── category look ────────────────────────────────────────────────────────────── */

const SLUG_TONE: Record<string, Tone> = {
  chapter: "sky", social: "butter", party: "rose", deadline: "peach", service: "mint", fundraising: "butter", fundraiser: "mint", program: "lilac",
};

/** A pastel for any type slug: the built-ins have their own, custom types hash to one. */
export function toneOf(slug: string): Tone {
  const known = SLUG_TONE[slug];
  if (known) return known;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

/** The category ink: the palette's timeline inks where they exist, else the tone's ink. */
export function inkOf(slug: string, c: Palette): string {
  const cat = c.cat as Record<string, string>;
  return cat[slug] ?? c.pastel[toneOf(slug)].ink;
}

export function labelOf(slug: string, types: CalEventType[] | undefined): string {
  return types?.find(t => t.slug === slug)?.label ?? (slug === "deadline" ? "Deadline" : slug.replace(/-/g, " ").replace(/^\w/, ch => ch.toUpperCase()));
}

/** A required event I can still file an excuse for: anything required that I wasn't marked present at. */
export const isMeetingLike = (e: CalendarEvent) => e.mandatory;
