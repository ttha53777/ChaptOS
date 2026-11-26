/**
 * Settings → Activity log: the filters and every sentence, shared by the web section
 * (sections/ActivityLogSection.tsx) and the app (mobile/src/settings/ActivityLog.tsx).
 * Pure: no React, Node or Prisma. GET /api/activity/full is platform-admin only; a
 * 403 shows the officer-access card.
 */
export type ActivityType = "success" | "warning" | "info";
export type ActivityFilter = "all" | ActivityType;

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "info",    label: "Info" },
  { id: "success", label: "Success" },
  { id: "warning", label: "Warning" },
];

export const activityPath = (f: ActivityFilter) => (f === "all" ? "/api/activity/full" : `/api/activity/full?type=${f}`);

export function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export const ACTIVITY_LOG_COPY = {
  forbiddenTitle: "Officer access required",
  forbiddenHint: "The activity log is restricted to chapter officers.",
  loading: "Loading…",
  empty: "No activity recorded yet",
  failed: (status: number) => `Request failed (${status})`,
} as const;
