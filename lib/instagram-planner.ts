/** Calendar-date arithmetic for the content planner. No server or React dependencies. */
export type InstagramLane = "overdue" | "week" | "upcoming" | "posted";
type PlannedPost = { dueDate: string; postedDate?: string | null; status: string };

/** Use the org's confirmed zone, with UTC as a deterministic fallback. */
export function instagramToday(timeZone?: string | null, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
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
  const posted = posts.filter(p => p.status === "posted").sort((a, b) => postedOn(b).localeCompare(postedOn(a)));
  const sinceLast = posted.length ? Math.max(0, -instagramDays(postedOn(posted[0]), today)) : null;
  return { queued: open.length, overdue: overdue.length, week: week.length, oldest: Math.max(0, ...overdue.map(p => -instagramDays(p.dueDate, today))), sinceLast };
}
/** Internal gaps only, as in the mock; boundary days aren't inferred as quiet. */
export function instagramGaps(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const hatched = new Set<number>(); let longest = 0;
  for (let i = 1; i < sorted.length; i++) {
    const span = sorted[i] - sorted[i - 1] - 1;
    longest = Math.max(longest, span);
    if (span >= 5) for (let d = sorted[i - 1] + 1; d < sorted[i]; d++) hatched.add(d);
  }
  return { hatched, longest };
}
export function instagramDate(date: string, full = false): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: full ? "long" : "short", day: "numeric", ...(full ? { weekday: "long" as const } : {}) }).format(new Date(`${date}T12:00:00Z`));
}
