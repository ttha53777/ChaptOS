/**
 * Member standing and the chapter health score: pure, client- and server-safe.
 *
 * Moved out of app/data.ts (which re-exports these) and app/components/dashboard/
 * MembersCard.tsx so GET /api/dashboard, which the native app reads, judges standing
 * and scores health with the same code as the web dashboard.
 */
import type { Brother, Task } from "@/lib/api-types";
import { fmtUsd } from "@/lib/money";
import { DEFAULT_THRESHOLDS, isAttendanceExempt, type Thresholds } from "@/lib/thresholds";
import { ALL_TRACKED, type TrackedMetrics } from "@/lib/tracked-metrics";

export type BrotherStatus = "Good" | "Watch" | "At Risk";
const THRESHOLDS = DEFAULT_THRESHOLDS;

// ─── Health Score ─────────────────────────────────────────────────────────────

/**
 * Relative weight of each health component. Only components the org actually
 * tracks are scored; the weights of those that survive are renormalized to sum
 * to 1, so an org that tracks fewer metrics still spans a full 0–100 instead of
 * being capped at whatever its kept weights add up to.
 */
const HEALTH_WEIGHTS = {
  Attendance: 0.30,
  GPA:        0.25,
  Dues:       0.20,
  Service:    0.15,
  Deadlines:  0.10,
} as const;

type HealthComponent = keyof typeof HEALTH_WEIGHTS;

export function calcHealthScore(
  bList: Brother[],
  dList: Task[],
  thresholds: Thresholds = THRESHOLDS,
  today: string = new Date().toISOString().slice(0, 10),
  tracked: TrackedMetrics = ALL_TRACKED,
): { score: number; label: "Healthy" | "Needs Attention" | "Critical"; breakdown: Record<string, number> } {
  // Exempt members carry no attendance obligation, so they neither raise nor
  // lower the chapter's attendance component (the -1 sentinel would otherwise
  // be averaged in as a real percentage).
  const attendees = bList.filter(b => !isAttendanceExempt(b.attendance));
  const hasMembers = bList.length > 0;

  const parts: { key: HealthComponent; value: number }[] = [];
  if (tracked.attendance && attendees.length > 0)
    parts.push({ key: "Attendance", value: Math.min(100, avg(attendees.map(b => b.attendance))) });
  if (tracked.gpa && hasMembers)
    parts.push({ key: "GPA", value: Math.min(100, Math.max(0, ((avg(bList.map(b => b.gpa)) - 2.0) / 2.0) * 100)) });
  if (tracked.duesOwed && hasMembers)
    parts.push({ key: "Dues", value: (bList.filter(b => b.duesOwed === 0).length / bList.length) * 100 });
  if (tracked.serviceHours && hasMembers)
    parts.push({ key: "Service", value: (bList.filter(b => b.serviceHours >= thresholds.serviceHoursGoal).length / bList.length) * 100 });

  // Deadlines are task-derived rather than per-member, so they always count —
  // which also guarantees `parts` is never empty and the divisor never zero.
  // Penalize open, dated tasks that are overdue — the computed equivalent of the
  // old stored "Urgent" status.
  const overduePenalty = dList.filter(d => d.status !== "done" && d.dueDate != null && d.dueDate < today).length * 15;
  parts.push({ key: "Deadlines", value: Math.max(0, 100 - overduePenalty) });

  const totalWeight = parts.reduce((s, p) => s + HEALTH_WEIGHTS[p.key], 0);
  const score = Math.min(100, Math.max(0, Math.round(
    parts.reduce((s, p) => s + p.value * HEALTH_WEIGHTS[p.key], 0) / totalWeight,
  )));
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Needs Attention" : "Critical";

  // Only scored components appear, so the dial never shows a "GPA 0" row for an
  // org that doesn't track GPA.
  const breakdown: Record<string, number> = {};
  for (const p of parts) breakdown[p.key] = Math.round(p.value);

  return { score, label, breakdown };
}


export function getBrotherStatus(
  b: Brother,
  thresholds: Thresholds = THRESHOLDS,
  tracked: TrackedMetrics = ALL_TRACKED,
): BrotherStatus {
  // Two independent reasons a measure can't count against someone:
  //   - exempt members (attendance === ATTENDANCE_EXEMPT sentinel) carry no
  //     attendance obligation this semester;
  //   - a metric the org doesn't track is a stored 0, not a measurement, so it
  //     must never flag anyone (otherwise every member of an org that skipped
  //     GPA is permanently "At Risk" on a 0.0 nobody recorded).
  const att = tracked.attendance && !isAttendanceExempt(b.attendance);
  if (
    (att && b.attendance < thresholds.attendanceAtRisk) ||
    (tracked.gpa && b.gpa < thresholds.gpaAtRisk)
  )
    return "At Risk";
  if (
    (att && b.attendance < thresholds.attendanceWatch) ||
    (tracked.gpa && b.gpa < thresholds.gpaWatch) ||
    (tracked.duesOwed && b.duesOwed > 0) ||
    (tracked.serviceHours && b.serviceHours < thresholds.serviceHoursGoal)
  )
    return "Watch";
  return "Good";
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}


/* ── standing bands (the Members card / glance) ─────────────────────────────── */

export type Band = "good" | "watch" | "risk";
export const BAND_OF: Record<BrotherStatus, Band> = { "Good": "good", "Watch": "watch", "At Risk": "risk" };
const ALL_TRACKED_KEYS = Object.keys(ALL_TRACKED) as (keyof TrackedMetrics)[];

/** How many members sit in each standing band, or null while no tracked metric
 *  can decide a standing yet (the card then shows no bands either). */
export function standingCounts(brothers: Brother[], thresholds: Thresholds, standing: TrackedMetrics): Record<Band, number> | null {
  if (!ALL_TRACKED_KEYS.some(k => standing[k])) return null;
  const c: Record<Band, number> = { good: 0, watch: 0, risk: 0 };
  for (const b of brothers) c[BAND_OF[getBrotherStatus(b, thresholds, standing)]]++;
  return c;
}

/**
 * Why this member sits in their band, in the same order getBrotherStatus
 * checks — so the reason shown is the one that actually put them there.
 */
export function reasonFor(b: Brother, band: Band, t: Thresholds, m: TrackedMetrics, serviceWord: string): string {
  const att = m.attendance && !isAttendanceExempt(b.attendance);
  if (band === "risk") {
    if (att && b.attendance < t.attendanceAtRisk) return `${b.attendance}% attendance`;
    if (m.gpa && b.gpa < t.gpaAtRisk) return `GPA ${b.gpa.toFixed(2)}`;
  }
  if (band === "watch") {
    if (att && b.attendance < t.attendanceWatch) return `${b.attendance}% attendance`;
    if (m.gpa && b.gpa < t.gpaWatch) return `GPA ${b.gpa.toFixed(2)}`;
    if (m.duesOwed && b.duesOwed > 0) return `owes ${fmtUsd(b.duesOwed ?? 0)}`;
    if (m.serviceHours && b.serviceHours < t.serviceHoursGoal) return `${b.serviceHours}h of ${serviceWord.toLowerCase()}`;
  }
  return "on track";
}

/** "under 80% attendance, dues owed or GPA under 3.0" — only the measures this org records. */
export function ruleLine(t: Thresholds, m: TrackedMetrics, serviceWord: string, duesWord: string): string {
  const parts = [
    m.attendance && `under ${t.attendanceWatch}% attendance`,
    m.duesOwed && `${duesWord.toLowerCase()} owed`,
    m.gpa && `GPA under ${t.gpaWatch.toFixed(1)}`,
    m.serviceHours && `${serviceWord.toLowerCase()} under ${t.serviceHoursGoal}h`,
  ].filter(Boolean) as string[];
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

/* ── what the roster has actually measured ───────────────────────────────────── */

export interface RosterData {
  hasAttendanceData: boolean;
  hasGpaData: boolean;
  hasServiceData: boolean;
  hasDuesData: boolean;
  /** Any measure at all: the dashboard's `hasAnyData`. */
  hasAnyData: boolean;
  /** `tracked` narrowed to the metrics with at least one record org-wide. */
  measured: TrackedMetrics;
}

/**
 * The dashboard's has*Data / measured rules (see the comments where the web page
 * computes them): a stored 0 is not a measurement. `hasTreasuryData` is the books'
 * tiebreak for dues (trend or an opening balance on file).
 */
export function rosterData(brothers: Brother[], tracked: TrackedMetrics, hasTreasuryData: boolean): RosterData {
  const attendees = brothers.filter(b => !isAttendanceExempt(b.attendance));
  const hasAttendanceData = attendees.some(b => b.attendance > 0);
  const hasGpaData = brothers.some(b => b.gpa > 0);
  const hasServiceData = brothers.some(b => b.serviceHours > 0);
  const hasDuesData = brothers.some(b => b.duesOwed !== 0) || hasTreasuryData;
  return {
    hasAttendanceData, hasGpaData, hasServiceData, hasDuesData,
    hasAnyData: hasAttendanceData || hasGpaData || hasServiceData || hasDuesData,
    measured: {
      attendance: tracked.attendance && hasAttendanceData,
      gpa: tracked.gpa && hasGpaData,
      duesOwed: tracked.duesOwed && hasDuesData,
      serviceHours: tracked.serviceHours && hasServiceData,
    },
  };
}
