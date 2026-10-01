import { fmt$, type Brother } from "../../data";
import { isAttendanceExempt, type Thresholds } from "@/lib/thresholds";
import type { TrackedMetrics } from "@/lib/tracked-metrics";

export type Tone = "t-ok" | "t-warn" | "t-risk" | "";

export function toneAttendance(pct: number, t: Thresholds): Tone {
  return pct < t.attendanceAtRisk ? "t-risk" : pct < t.attendanceWatch ? "t-warn" : "t-ok";
}

export function toneGpa(gpa: number, t: Thresholds): Tone {
  return gpa < t.gpaAtRisk ? "t-risk" : gpa < t.gpaWatch ? "t-warn" : "t-ok";
}

/** One clause of the verdict. `em` is the italic, colored part. */
export interface Verdict {
  tone: Tone;
  lead: string;
  em: string;
  tail: string;
}

/**
 * The card's one-sentence standing: "Marcus is *on watch*: attendance is 62%,
 * GPA is 2.84 and $120 in dues is outstanding."
 *
 * Mirrors getBrotherStatus (same thresholds, same tracked-metric rules), so the
 * sentence can never disagree with the roster pill. It only explains which
 * measures put someone where they are.
 */
export function standingVerdict(
  b: Brother,
  t: Thresholds,
  tracked: TrackedMetrics,
  opts: { self: boolean; duesLabel: string; serviceLabel: string },
): Verdict {
  const first = b.name.trim().split(/\s+/)[0] || b.name;
  const subj = opts.self ? "You're" : `${first} is`;
  const exempt = isAttendanceExempt(b.attendance);
  const issues: string[] = [];
  let worst = 0;

  if (tracked.attendance && !exempt && b.attendance < t.attendanceWatch) {
    issues.push(`attendance is ${b.attendance}%`);
    worst = Math.max(worst, b.attendance < t.attendanceAtRisk ? 2 : 1);
  }
  if (tracked.gpa && b.gpa < t.gpaWatch) {
    issues.push(`GPA is ${b.gpa.toFixed(2)}`);
    worst = Math.max(worst, b.gpa < t.gpaAtRisk ? 2 : 1);
  }
  if (tracked.duesOwed && b.duesOwed > 0) {
    issues.push(`${fmt$(b.duesOwed)} in ${opts.duesLabel.toLowerCase()} is outstanding`);
    worst = Math.max(worst, 1);
  }
  if (tracked.serviceHours && b.serviceHours < t.serviceHoursGoal) {
    issues.push(`${b.serviceHours} of ${t.serviceHoursGoal} ${opts.serviceLabel.toLowerCase()} hours are done`);
    worst = Math.max(worst, 1);
  }

  if (!issues.length) {
    return {
      tone: "t-ok",
      lead: `${subj} in `,
      em: "good standing",
      tail: ` on every measure${exempt && tracked.attendance ? " (exempt from attendance this term)" : ""}.`,
    };
  }
  const list = issues.length === 1 ? issues[0] : `${issues.slice(0, -1).join(", ")} and ${issues[issues.length - 1]}`;
  return {
    tone: worst === 2 ? "t-risk" : "t-warn",
    lead: `${subj} `,
    em: worst === 2 ? "at risk" : "on watch",
    tail: `: ${list}.`,
  };
}
