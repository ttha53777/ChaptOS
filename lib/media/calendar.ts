/**
 * Media (the content calendar) rules, shared by the web page (app/org/[slug]/media) and
 * the app (mobile/src/media). Pure: calendar-date arithmetic in UTC on YYYY-MM-DD
 * strings, with "today" passed in (todayIn takes the clock as an argument), and every
 * word the page says about a post. No server, React or Temporal imports.
 *
 *   overdue    open, its date has passed
 *   week       open, due today through 7 days out
 *   upcoming   open, later
 *   posted     marked posted (sorted by the day it went up)
 */

/** Canonical post formats, the single source of truth (lib/validation/instagram re-exports it). */
export const INSTAGRAM_TYPES = ["Story", "Reel", "Carousel"] as const;
export type InstagramType = (typeof INSTAGRAM_TYPES)[number];
export type InstagramLane = "overdue" | "week" | "upcoming" | "posted";
export type PlannedPost = { dueDate: string; postedDate?: string | null; status: string };
type Post = PlannedPost & { id: number; title: string; type: string; calendarEventId?: number | null };
export type CalEvent = { id: number; title: string; date: string; category?: string };

/** The org's today in its confirmed zone, with UTC as a deterministic fallback. */
export function todayIn(timeZone: string | null | undefined, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function instagramDays(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
export function instagramAddDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
export function postedOn(post: PlannedPost): string { return post.postedDate ?? post.dueDate; }
export function instagramLane(post: PlannedPost, today: string): InstagramLane {
  if (post.status === "posted") return "posted";
  const days = instagramDays(post.dueDate, today);
  return days < 0 ? "overdue" : days <= 7 ? "week" : "upcoming";
}
export function instagramSummary(posts: PlannedPost[], today: string) {
  const open = posts.filter(p => p.status !== "posted");
  const overdue = open.filter(p => instagramDays(p.dueDate, today) < 0);
  const week = open.filter(p => instagramLane(p, today) === "week");
  const latest = posts.filter(p => p.status === "posted").sort((a, b) => postedOn(b).localeCompare(postedOn(a)))[0];
  const sinceLast = latest ? Math.max(0, -instagramDays(postedOn(latest), today)) : null;
  return { queued: open.length, overdue: overdue.length, week: week.length, oldest: Math.max(0, ...overdue.map(p => -instagramDays(p.dueDate, today))), sinceLast };
}
/** Internal gaps only, as in the mock; boundary days aren't inferred as quiet. */
export function instagramGaps(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const hatched = new Set<number>(); let longest = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] ?? 0, cur = sorted[i] ?? 0;
    const span = cur - prev - 1;
    longest = Math.max(longest, span);
    if (span >= 5) for (let d = prev + 1; d < cur; d++) hatched.add(d);
  }
  return { hatched, longest };
}
export function instagramDate(date: string, full = false): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: full ? "long" : "short", day: "numeric", ...(full ? { weekday: "long" as const } : {}) }).format(new Date(`${date}T12:00:00Z`));
}
/** "Fri". */
export const shortDay = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });

/* ── Formats ──────────────────────────────────────────────────────────────────── */

/** "story" | "reel" | "carousel", or "legacy" for a retired format. */
export function formatKey(type: string) {
  return (INSTAGRAM_TYPES as readonly string[]).includes(type) ? type.toLowerCase() : "legacy";
}
export const isFormat = (type: string): type is InstagramType => (INSTAGRAM_TYPES as readonly string[]).includes(type);
export const FORMAT_HINTS: Record<string, string> = { Story: "24 hours, then gone", Reel: "Short video", Carousel: "Up to 10 photos" };

/* ── Lanes ────────────────────────────────────────────────────────────────────── */

export const LANES: readonly { id: InstagramLane; label: string; note: string }[] = [
  { id: "overdue", label: "Overdue", note: "past their date" }, { id: "week", label: "This week", note: "due in the next 7 days" },
  { id: "upcoming", label: "Upcoming", note: "later this term" }, { id: "posted", label: "Posted", note: "on the feed" },
];
export const IDEAS: readonly { title: string; type: InstagramType }[] = [
  { title: "Welcome to the chapter", type: "Carousel" }, { title: "Meet the founding officers", type: "Carousel" },
  { title: "Rush week is coming", type: "Reel" }, { title: "First chapter meeting tonight", type: "Story" },
];
export const ASK_NEXT = "What should we post on Instagram next? Consider our upcoming events and content calendar.";

/** Search looks at titles and formats. */
export function filterPosts<P extends { title: string; type: string }>(posts: P[], query: string): P[] {
  const q = query.trim().toLowerCase();
  return posts.filter(p => `${p.title} ${p.type}`.toLowerCase().includes(q));
}
/** One lane's posts: posted newest-first by the day it went up, the rest by due date. */
export function lanePosts<P extends PlannedPost>(posts: P[], lane: InstagramLane, today: string): P[] {
  return posts.filter(p => instagramLane(p, today) === lane)
    .sort((a, b) => lane === "posted" ? postedOn(b).localeCompare(postedOn(a)) : a.dueDate.localeCompare(b.dueDate));
}
export const postCount = (n: number) => `${n} post${n === 1 ? "" : "s"}`;

export type DuePillKind = "late" | "soon" | "cool" | "ok";
export function duePill(task: PlannedPost, today: string): { cls: DuePillKind; label: string } {
  if (task.status === "posted") return { cls: "ok", label: "posted" };
  const diff = instagramDays(task.dueDate, today);
  return diff < 0 ? { cls: "late", label: `${-diff}d late` } : diff === 0 ? { cls: "soon", label: "today" } : { cls: diff <= 7 ? "soon" : "cool", label: `in ${diff}d` };
}
/** A row's date: "Posted Nov 18" / "Due Fri, Nov 20". */
export function rowDate(task: PlannedPost): string {
  return task.status === "posted" ? `Posted ${instagramDate(postedOn(task))}` : `Due ${shortDay(task.dueDate)}, ${instagramDate(task.dueDate)}`;
}
/** The detail's Timing line. */
export function timingLine(task: PlannedPost, today: string): string {
  if (task.status === "posted") return "Posted to the feed";
  const days = instagramDays(task.dueDate, today);
  return days < 0 ? `${-days} day${days < -1 ? "s" : ""} overdue` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

/* ── The brief ────────────────────────────────────────────────────────────────── */

/**
 * The digest under the title, as text runs: `bold` is the overdue clause. The runs are
 * the web's own text nodes (it renders them as they are, so the page's DOM doesn't
 * change); join them for a single string.
 */
export function digestParts(posts: PlannedPost[], today: string): { bold: string[] | null; rest: string[] } {
  if (!posts.length) return { bold: null, rest: ["Nothing queued yet — plan a post to start the calendar."] };
  const s = instagramSummary(posts, today);
  if (!s.queued) return { bold: null, rest: ["The queue is clear — every planned post has gone out."] };
  const bold = s.overdue > 0 ? [String(s.overdue), " post", s.overdue === 1 ? " is" : "s are", " overdue"] : null;
  const rest: string[] = [];
  if (s.overdue > 0 && s.week > 0) rest.push(", ");
  if (s.week > 0) rest.push(String(s.week), " land", s.week === 1 ? "s" : "", " this week");
  if (!s.overdue && !s.week) rest.push(String(s.queued), " post", s.queued === 1 ? "" : "s", " queued");
  rest.push(".");
  if (s.sinceLast !== null) rest.push(" Last post went up ", s.sinceLast === 0 ? "today" : `${s.sinceLast} day${s.sinceLast === 1 ? "" : "s"} ago`, ".");
  return { bold, rest };
}
/** "Fri · Nov 20" (the kicker's chip). */
export const kickerChip = (today: string) => `${shortDay(today)} · ${instagramDate(today)}`;

export type MetricKey = "queued" | "overdue" | "week" | "cadence";
export type MetricIcon = "camera" | "flag" | "cal" | "clock";
export type MetricTone = "lilac" | "peach" | "butter" | "mint";
export interface Metric { key: MetricKey; label: string; icon: MetricIcon; tone: MetricTone; value: number | string; unit: string | null; note: string; warn: boolean }
export function metrics(posts: PlannedPost[], today: string): Metric[] {
  const s = instagramSummary(posts, today);
  return [
    { key: "queued", label: "Queued", icon: "camera", tone: "lilac", value: s.queued, unit: null, note: "posts planned", warn: false },
    { key: "overdue", label: "Overdue", icon: "flag", tone: "peach", value: s.overdue, unit: null, note: s.overdue ? `oldest ${s.oldest}d late` : "all caught up", warn: s.overdue > 0 },
    { key: "week", label: "This week", icon: "cal", tone: "butter", value: s.week, unit: null, note: "due in 7 days", warn: false },
    { key: "cadence", label: "Cadence", icon: "clock", tone: "mint", value: s.sinceLast ?? "—", unit: s.sinceLast !== null ? "d" : null, note: "since last post", warn: false },
  ];
}
/** Where a measure goes: Cadence opens this month; the rest jump to their lane, or say it's empty. */
export function metricTarget(key: MetricKey, posts: PlannedPost[], today: string): { kind: "month" } | { kind: "lane"; lane: InstagramLane } | { kind: "none"; say: string } {
  if (key === "cadence") return { kind: "month" };
  const has = (l: InstagramLane) => posts.some(p => instagramLane(p, today) === l);
  const lane: InstagramLane = key === "queued" ? (instagramSummary(posts, today).week ? "week" : has("upcoming") ? "upcoming" : "overdue") : key;
  if (has(lane)) return { kind: "lane", lane };
  return { kind: "none", say: key === "overdue" ? "Nothing is overdue" : key === "queued" ? "The queue is clear" : "Nothing due this week" };
}

/* ── Month ────────────────────────────────────────────────────────────────────── */

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export function moveMonth(month: string, delta: number): string {
  const [year = 1970, mo = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mo - 1 + delta, 1)).toISOString().slice(0, 7);
}
/** The month grid: blanks before day 1 and after the last, posts and linked events by day, quiet stretches. */
export function monthGrid<P extends Post, E extends CalEvent>(month: string, tasks: P[], events: E[]) {
  const [year = 1970, mo = 1] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, mo - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, mo, 0)).getUTCDate();
  const byDay = new Map<number, P[]>();
  tasks.filter(p => p.dueDate.startsWith(month)).forEach(p => { const d = Number(p.dueDate.slice(8)); byDay.set(d, [...(byDay.get(d) ?? []), p]); });
  const linked = new Set(tasks.map(p => p.calendarEventId));
  const evByDay = new Map<number, E[]>();
  events.filter(e => linked.has(e.id) && e.date.startsWith(month)).forEach(e => { const d = Number(e.date.slice(8)); evByDay.set(d, [...(evByDay.get(d) ?? []), e]); });
  const { hatched, longest } = instagramGaps([...byDay.keys()]);
  const cells = Array.from({ length: Math.ceil((first + length) / 7) * 7 }, (_, i) => i < first || i >= first + length ? null : i - first + 1);
  const title = new Date(Date.UTC(year, mo - 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return { year, title, cells, byDay, evByDay, hatched, longest };
}
export const dayKey = (month: string, day: number) => `${month}-${String(day).padStart(2, "0")}`;
/** "Longest quiet stretch this month: N days — hatched" (null when there's no gap). */
export function quietNote(longest: number): { lead: string; bold: string; tail: string } | null {
  return longest > 0 ? { lead: "Longest quiet stretch this month: ", bold: `${longest} day${longest === 1 ? "" : "s"}`, tail: longest >= 5 ? " — hatched" : "" } : null;
}
/** A month marker's accessible name. */
export const markerLabel = (p: Post) => `${p.title}, ${p.type}, ${p.dueDate}${p.status === "posted" ? ", posted" : ""}`;

/* ── The form ─────────────────────────────────────────────────────────────────── */

/** Events a post can promote: not deadlines, from two weeks back on, plus the current link (in the feed's order). */
export function promotable<E extends CalEvent>(events: E[], today: string, current: number | null): E[] {
  return events.filter(e => e.id === current || (e.category !== "deadline" && instagramDays(e.date, today) >= -14));
}
/** A new post's draft: three days out, a Story unless an idea says otherwise. */
export function newDraft(today: string, preset?: { title: string; type: string }) {
  return { title: preset?.title ?? "", type: preset?.type ?? "Story", dueDate: instagramAddDays(today, 3), postedDate: null as string | null, calendarEventId: null as number | null };
}
export const eventOption = (e: CalEvent) => `${e.title} · ${instagramDate(e.date)}`;

/* ── Words ────────────────────────────────────────────────────────────────────── */

const LANE_TOAST: Record<InstagramLane, string> = { overdue: "it’s already overdue", week: "lands this week", upcoming: "queued under Upcoming", posted: "on the feed" };
export const SAY = {
  added: (lane: InstagramLane) => `Added — ${LANE_TOAST[lane]}`,
  saved: "Post saved",
  moved: (date: string) => `Moved to ${shortDay(date)}, ${instagramDate(date)}`,
  postedDate: "Posting date changed",
  posted: "Marked posted — cadence resets to today",
  deleted: (title: string) => `Deleted “${title}”`,
  fail: "Couldn't save. Please try again.",
  loadFail: "Couldn’t load posts. Try again.",
  retryFail: "Couldn't load posts. Please try again.",
};
/** "Delete “title” (due Nov 20)? This can’t be undone." */
export function deleteMessage(task: { title: string; dueDate: string }) {
  return { lead: "Delete ", title: `“${task.title}”`, tail: ` (due ${instagramDate(task.dueDate)})? This can’t be undone.` };
}
