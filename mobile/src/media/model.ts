/**
 * Media's rules, ported from lib/instagram-planner.ts and the web page
 * (app/org/[slug]/media; mobile/ can't import web runtime). Calendar-date arithmetic in
 * UTC on YYYY-MM-DD strings, "today" in the org's zone (UTC when it has none), exactly
 * as the web does, so both clients file a post in the same lane:
 *
 *   overdue    open, its date has passed
 *   week       open, due today through 7 days out
 *   upcoming   open, later
 *   posted     marked posted (sorted by the day it went up)
 *
 * Writes are MANAGE_INSTAGRAM (1<<4), what the routes check.
 */
import type { InstagramPost, MeResponse } from "@/lib/api-types";
import type { IconName } from "~/icons/Icon";
import type { Tone } from "~/theme/palette";

const MANAGE_INSTAGRAM = 1 << 4;
export const canManage = (me: MeResponse) => me.isAdmin || (me.permissions & MANAGE_INSTAGRAM) !== 0;

export type Lane = "overdue" | "week" | "upcoming" | "posted";
export const FORMATS = ["Story", "Reel", "Carousel"] as const;
export type Format = (typeof FORMATS)[number];
export const isFormat = (t: string): t is Format => (FORMATS as readonly string[]).includes(t);
export const FORMAT_HINTS: Record<string, string> = { Story: "24 hours, then gone", Reel: "Short video", Carousel: "Up to 10 photos" };
/** Story rose · Reel lilac · Carousel sky; a retired format is grey (null). */
export const formatTone = (t: string): Tone | null => (t === "Story" ? "rose" : t === "Reel" ? "lilac" : t === "Carousel" ? "sky" : null);

export const LANES: readonly { id: Lane; label: string; note: string; tone: Tone | null }[] = [
  { id: "overdue", label: "Overdue", note: "past their date", tone: "peach" },
  { id: "week", label: "This week", note: "due in the next 7 days", tone: "butter" },
  { id: "upcoming", label: "Upcoming", note: "later this term", tone: null },
  { id: "posted", label: "Posted", note: "on the feed", tone: "mint" },
];
export const LANE_TOAST: Record<Lane, string> = { overdue: "it's already overdue", week: "lands this week", upcoming: "queued under Upcoming", posted: "on the feed" };
export const IDEAS: readonly { title: string; type: Format }[] = [
  { title: "Welcome to the chapter", type: "Carousel" }, { title: "Meet the founding officers", type: "Carousel" },
  { title: "Rush week is coming", type: "Reel" }, { title: "First chapter meeting tonight", type: "Story" },
];

/** The org's today; UTC as the deterministic fallback (instagramToday). */
export function mediaToday(timeZone?: string | null, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
export const days = (date: string, today: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const postedOn = (p: Pick<InstagramPost, "postedDate" | "dueDate">) => p.postedDate ?? p.dueDate;

export function laneOf(p: Pick<InstagramPost, "status" | "dueDate">, today: string): Lane {
  if (p.status === "posted") return "posted";
  const d = days(p.dueDate, today);
  return d < 0 ? "overdue" : d <= 7 ? "week" : "upcoming";
}

export function summary(posts: InstagramPost[], today: string) {
  const open = posts.filter(p => p.status !== "posted");
  const overdue = open.filter(p => days(p.dueDate, today) < 0);
  const week = open.filter(p => laneOf(p, today) === "week");
  const posted = posts.filter(p => p.status === "posted").sort((a, b) => postedOn(b).localeCompare(postedOn(a)));
  const sinceLast = posted.length ? Math.max(0, -days(postedOn(posted[0]!), today)) : null;
  return { queued: open.length, overdue: overdue.length, week: week.length, oldest: Math.max(0, ...overdue.map(p => -days(p.dueDate, today))), sinceLast };
}

/** Quiet stretches between posting days in a month: 5+ days are hatched (instagramGaps). */
export function gaps(dayNums: number[]) {
  const sorted = [...new Set(dayNums)].sort((a, b) => a - b);
  const hatched = new Set<number>();
  let longest = 0;
  for (let i = 1; i < sorted.length; i++) {
    const span = sorted[i]! - sorted[i - 1]! - 1;
    longest = Math.max(longest, span);
    if (span >= 5) for (let d = sorted[i - 1]! + 1; d < sorted[i]!; d++) hatched.add(d);
  }
  return { hatched, longest };
}

const fmt = (date: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(new Date(`${date}T12:00:00Z`));
/** "Nov 18" / "Wednesday, November 18". */
export const mediaDate = (date: string, full = false) => fmt(date, full ? { weekday: "long", month: "long", day: "numeric" } : { month: "short", day: "numeric" });
export const shortDay = (date: string) => fmt(date, { weekday: "short" });
export const monthTitle = (month: string) => fmt(`${month}-01`, { month: "long" });

export type PillKind = "late" | "soon" | "cool" | "ok";
export function duePill(p: InstagramPost, today: string): { kind: PillKind; label: string } {
  if (p.status === "posted") return { kind: "ok", label: "posted" };
  const d = days(p.dueDate, today);
  return d < 0 ? { kind: "late", label: `${-d}d late` } : d === 0 ? { kind: "soon", label: "today" } : { kind: d <= 7 ? "soon" : "cool", label: `in ${d}d` };
}
export const PILL_TONE: Record<PillKind, Tone | null> = { late: "peach", soon: "butter", cool: null, ok: "mint" };

export function timing(p: InstagramPost, today: string): string {
  if (p.status === "posted") return "Posted to the feed";
  const d = days(p.dueDate, today);
  return d < 0 ? `${-d} day${d < -1 ? "s" : ""} overdue` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`;
}

/** Lanes in order, each sorted as the web sorts it. */
export function lanes(posts: InstagramPost[], today: string): { lane: (typeof LANES)[number]; posts: InstagramPost[] }[] {
  return LANES.map(lane => ({
    lane,
    posts: posts.filter(p => laneOf(p, today) === lane.id)
      .sort((a, b) => (lane.id === "posted" ? postedOn(b).localeCompare(postedOn(a)) : a.dueDate.localeCompare(b.dueDate))),
  })).filter(l => l.posts.length);
}

/** The digest under the title, as the web writes it (bold = the overdue clause). */
export function digest(posts: InstagramPost[], today: string): { bold: string | null; rest: string } {
  if (!posts.length) return { bold: null, rest: "Nothing queued yet. Plan a post to start the calendar." };
  const s = summary(posts, today);
  if (!s.queued) return { bold: null, rest: "The queue is clear. Every planned post has gone out." };
  const bold = s.overdue > 0 ? `${s.overdue} post${s.overdue === 1 ? " is" : "s are"} overdue` : null;
  let rest = "";
  if (s.overdue > 0 && s.week > 0) rest += ", ";
  if (s.week > 0) rest += `${s.week} land${s.week === 1 ? "s" : ""} this week`;
  if (!s.overdue && !s.week) rest += `${s.queued} post${s.queued === 1 ? "" : "s"} queued`;
  rest += ".";
  if (s.sinceLast !== null) rest += ` Last post went up ${s.sinceLast === 0 ? "today" : `${s.sinceLast} day${s.sinceLast === 1 ? "" : "s"} ago`}.`;
  return { bold, rest };
}

export interface Measure { key: "queued" | "overdue" | "week" | "cadence"; label: string; icon: IconName; tone: Tone; value: string; unit?: string; note: string; warn?: boolean }
export function measures(posts: InstagramPost[], today: string): Measure[] {
  const s = summary(posts, today);
  return [
    { key: "queued", label: "Queued", icon: "camera", tone: "lilac", value: String(s.queued), note: "posts planned" },
    { key: "overdue", label: "Overdue", icon: "flag", tone: "peach", value: String(s.overdue), note: s.overdue ? `oldest ${s.oldest}d late` : "all caught up", warn: s.overdue > 0 },
    { key: "week", label: "This week", icon: "cal", tone: "butter", value: String(s.week), note: "due in 7 days" },
    { key: "cadence", label: "Cadence", icon: "clock", tone: "mint", value: s.sinceLast == null ? "–" : String(s.sinceLast), unit: s.sinceLast == null ? undefined : "d", note: "since last post" },
  ];
}

/** Events a post can promote: not deadlines, from two weeks back on, plus the current link. */
export function promotable<E extends { id: number; date: string; category: string }>(events: E[], today: string, current: number | null): E[] {
  return events.filter(e => e.id === current || (e.category !== "deadline" && days(e.date, today) >= -14))
    .sort((a, b) => a.date.localeCompare(b.date));
}
