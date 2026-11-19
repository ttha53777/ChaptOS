/**
 * The Members roster's rules (app/org/[slug]/brothers/page.tsx), shared with the native
 * app (mobile/src/app/(tabs)/members): the role line under a name, the counts per band,
 * the measures strip, the "who needs attention" summary sentence, the standing hint, the
 * search and band filter, and the CSV export.
 *
 * Standing is judged on `measured` (a tracked metric nobody has a record for yet is a
 * stored 0, not a measurement), as getBrotherStatus is everywhere.
 *
 * Pure: no Node, Prisma, Temporal or React (scripts/lint-mobile-imports.py, SHARED).
 */
import type { Brother } from "@/lib/api-types";
import type { Thresholds } from "@/lib/thresholds";
import type { TrackedMetrics } from "@/lib/tracked-metrics";
import { fmtUsd } from "@/lib/money";
import { avg, getBrotherStatus, type BrotherStatus } from "./standing";

/** Every role a member holds, "Treasurer · Social Chair"; else their free-text role. */
export function roleTitle(b: Pick<Brother, "role" | "roles">): string {
  if (b.roles && b.roles.length > 0) return b.roles.map(r => r.name).join(" · ");
  return b.role;
}

export type StatusFilter = BrotherStatus | "All";

export function statusCounts(brothers: Brother[], t: Thresholds, measured: TrackedMetrics): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { All: brothers.length, Good: 0, Watch: 0, "At Risk": 0 };
  for (const b of brothers) counts[getBrotherStatus(b, t, measured)]++;
  return counts;
}

export interface RosterKpis {
  total: number;
  avgAtt: number;
  avgGpa: number;
  attRisk: number;
  watching: number;
  duesTotal: number;
  /** Members at or over the service goal. */
  svcMet: number;
  serviceTotal: number;
  /** Members owing anything (0 when dues aren't tracked). */
  duesOwing: number;
  /** Owing with a charge past due (needs the dues board's lateness). */
  duesOverdue: number;
  /** Below the attendance watch line (0 until attendance is measured). */
  belowAttend: number;
  belowGpa: number;
}

/** The measures strip and the summary's counts. `lateDays` comes from GET /api/dues. */
export function rosterKpis(brothers: Brother[], t: Thresholds, tracked: TrackedMetrics, measured: TrackedMetrics, lateDays?: (id: number) => number): RosterKpis | null {
  if (!brothers.length) return null;
  const owing = tracked.duesOwed ? brothers.filter(b => b.duesOwed > 0) : [];
  return {
    total: brothers.length,
    avgAtt: avg(brothers.map(b => b.attendance)),
    avgGpa: avg(brothers.map(b => b.gpa)),
    attRisk: brothers.filter(b => getBrotherStatus(b, t, measured) === "At Risk").length,
    watching: brothers.filter(b => getBrotherStatus(b, t, measured) === "Watch").length,
    duesTotal: brothers.reduce((s, b) => s + b.duesOwed, 0),
    svcMet: brothers.filter(b => b.serviceHours >= t.serviceHoursGoal).length,
    serviceTotal: brothers.reduce((s, b) => s + b.serviceHours, 0),
    duesOwing: owing.length,
    duesOverdue: lateDays ? owing.filter(b => lateDays(b.id) > 0).length : 0,
    belowAttend: measured.attendance ? brothers.filter(b => b.attendance < t.attendanceWatch).length : 0,
    belowGpa: brothers.filter(b => b.gpa < t.gpaWatch).length,
  };
}

/** A run of a sentence; `bold` runs are the web's <b>. */
export interface Run { text: string; bold?: boolean }

/**
 * "13 members active. 7 at risk and 2 on watch — 3 owe $420 in dues and 8 sit below
 * the 80% attendance line." `members` and `dues` are the org's words, lowercased here.
 */
export function rosterSummary(k: RosterKpis, counts: Record<StatusFilter, number>, nothingMeasured: boolean, t: Thresholds, words: { members: string; dues: string }): Run[] {
  const out: Run[] = [{ text: `${k.total} ${words.members.toLowerCase()} active. ` }];
  if (nothingMeasured) out.push({ text: "Nothing’s been recorded yet, so nobody has a standing" });
  else out.push({ text: `${counts["At Risk"]} at risk`, bold: true }, { text: " and " }, { text: `${counts.Watch} on watch`, bold: true });
  if (k.duesOwing > 0 || k.belowAttend > 0) {
    out.push({ text: " — " });
    if (k.duesOwing > 0) out.push({ text: `${k.duesOwing} owe ${fmtUsd(k.duesTotal)} in ${words.dues.toLowerCase()}` });
    if (k.duesOwing > 0 && k.belowAttend > 0) out.push({ text: " and " });
    if (k.belowAttend > 0) out.push({ text: `${k.belowAttend} sit below the ${t.attendanceWatch}% attendance line` });
  }
  out.push({ text: "." });
  return out;
}

/** "Click a band or a face — attendance under 80%, GPA under 3.00, dues owed or service under 10h puts someone on watch." */
export function standingHint(t: Thresholds, tracked: TrackedMetrics, words: { dues: string; service: string }): string {
  const parts = [
    tracked.attendance && `attendance under ${t.attendanceWatch}%`,
    tracked.gpa && `GPA under ${t.gpaWatch.toFixed(2)}`,
    tracked.duesOwed && `${words.dues.toLowerCase()} owed`,
    tracked.serviceHours && `${words.service.toLowerCase()} under ${t.serviceHoursGoal}h`,
  ].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " or $1");
  return `Click a band or a face — ${parts} puts someone on watch.`;
}

/** Search (name or role line) and the band filter. */
export function filterRoster(brothers: Brother[], q: string, status: StatusFilter, t: Thresholds, measured: TrackedMetrics): Brother[] {
  const s = q.trim().toLowerCase();
  return brothers.filter(b =>
    (!s || b.name.toLowerCase().includes(s) || roleTitle(b).toLowerCase().includes(s))
    && (status === "All" || getBrotherStatus(b, t, measured) === status));
}

/** The roster as CSV, the columns the web's Export writes. */
export function rosterCsv(brothers: Brother[], t: Thresholds, measured: TrackedMetrics): string {
  const rows = [
    ["Name", "Role", "Attendance %", "GPA", "Service Hours", "Dues Owed", "Status"],
    ...brothers.map(b => [b.name, roleTitle(b), String(b.attendance), b.gpa.toFixed(2), String(b.serviceHours), b.duesOwed.toFixed(2), getBrotherStatus(b, t, measured)]),
  ];
  return rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}
