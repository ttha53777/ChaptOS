/**
 * Pure Members rules. The standing logic is a port of the web card's
 * (app/components/members/spotlight-standing.ts + lib/tracked-metrics.ts +
 * lib/thresholds.ts), which mobile/ can't import. Keep them in step.
 *
 *   tracked    the org didn't switch the metric off (OrganizationConfig.disabledFeatures,
 *              opt-out, workflow "operations", feature "kpi-<metric>")
 *   measured   tracked AND someone on the roster has a record for it. A stored 0 is not
 *              a reading: a brand-new chapter is all zeros, and judging those zeros
 *              would greet the first members with "at risk". Standing reads `measured`.
 *
 * Who sees the numbers: the person themselves, an org admin, or an officer with roster,
 * treasury, attendance or service permissions (the web card's "full"). Everyone else sees
 * the calling card without standing. (The roster read sends the numbers to every member;
 * hiding them from peers is a display rule, the same as the web.)
 */
import type { Brother, MeResponse } from "@/lib/api-types";
import type { Tone } from "~/theme/palette";

type Metric = "attendance" | "gpa" | "duesOwed" | "serviceHours";
export type Metrics = Record<Metric, boolean>;
export type Thresholds = NonNullable<MeResponse["org"]>["thresholds"];
type CustomMemberFieldDef = NonNullable<MeResponse["org"]>["customMemberFields"][number];

const KPI: Record<Metric, string> = { attendance: "kpi-attendance", gpa: "kpi-gpa", duesOwed: "kpi-dues", serviceHours: "kpi-service" };
const METRICS = Object.keys(KPI) as Metric[];

export const ATTENDANCE_EXEMPT = -1;
export const isExempt = (attendance: number) => attendance === ATTENDANCE_EXEMPT;

export function trackedOf(disabled: Record<string, string[]> | null | undefined): Metrics {
  const off = disabled?.operations ?? [];
  return Object.fromEntries(METRICS.map(m => [m, !off.includes(KPI[m])])) as Metrics;
}

export function measuredOf(tracked: Metrics, roster: Brother[]): Metrics {
  return {
    attendance: tracked.attendance && roster.some(b => b.attendance > 0),
    gpa: tracked.gpa && roster.some(b => b.gpa > 0),
    duesOwed: tracked.duesOwed && roster.some(b => b.duesOwed !== 0),
    serviceHours: tracked.serviceHours && roster.some(b => b.serviceHours > 0),
  };
}

const anyOf = (m: Metrics) => METRICS.some(k => m[k]);

const SEES_STANDING = (1 << 0) | (1 << 1) | (1 << 5) | (1 << 6); // BROTHERS | TREASURY | SERVICE | ATTENDANCE

export function seesStanding(me: MeResponse, memberId: number): boolean {
  return memberId === me.id || me.isAdmin || (me.permissions & SEES_STANDING) !== 0;
}

/** The org's word for a canonical term ("Dues" → "Fees"). */
export function vocab(me: MeResponse, term: string): string {
  return me.org?.vocabularyOverrides[term] ?? term;
}

export const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export type Level = "ok" | "warn" | "risk" | "none";
export const LEVEL_TONE: Record<Level, Tone | null> = { ok: "mint", warn: "butter", risk: "rose", none: null };

export const attLevel = (pct: number, t: Thresholds): Level => pct < t.attendanceAtRisk ? "risk" : pct < t.attendanceWatch ? "warn" : "ok";
export const gpaLevel = (gpa: number, t: Thresholds): Level => gpa < t.gpaAtRisk ? "risk" : gpa < t.gpaWatch ? "warn" : "ok";

/** "Marcus is *on watch*: attendance is 62%, GPA is 2.84 and $120 in dues is outstanding." */
export interface Verdict { level: Level; lead: string; em: string; tail: string }

export function verdictOf(b: Brother, t: Thresholds, tracked: Metrics, measured: Metrics, o: { self: boolean; dues: string; service: string }): Verdict {
  const first = b.name.trim().split(/\s+/)[0] || b.name;
  const subj = o.self ? "You're" : `${first} is`;
  const exempt = isExempt(b.attendance);
  const issues: string[] = [];
  let worst = 0;
  if (measured.attendance && !exempt && b.attendance < t.attendanceWatch) {
    issues.push(`attendance is ${b.attendance}%`);
    worst = Math.max(worst, b.attendance < t.attendanceAtRisk ? 2 : 1);
  }
  if (measured.gpa && b.gpa < t.gpaWatch) {
    issues.push(`GPA is ${b.gpa.toFixed(2)}`);
    worst = Math.max(worst, b.gpa < t.gpaAtRisk ? 2 : 1);
  }
  if (tracked.duesOwed && b.duesOwed > 0) {
    issues.push(`${money(b.duesOwed)} in ${o.dues.toLowerCase()} is outstanding`);
    worst = Math.max(worst, 1);
  }
  if (measured.serviceHours && b.serviceHours < t.serviceHoursGoal) {
    issues.push(`${b.serviceHours} of ${t.serviceHoursGoal} ${o.service.toLowerCase()} hours are done`);
    worst = Math.max(worst, 1);
  }
  if (!issues.length && !anyOf(measured) && anyOf(tracked)) {
    const firsts = [tracked.attendance && "meeting", tracked.gpa && "grade", tracked.serviceHours && `${o.service.toLowerCase()} hours`].filter(Boolean) as string[];
    const what = firsts.length ? firsts.join(firsts.length > 2 ? ", " : " or ").replace(/, ([^,]*)$/, " or $1") : "record";
    return { level: "none", lead: `Nothing's been recorded for ${o.self ? "you" : first} `, em: "yet", tail: `. Standing starts with the first ${what}.` };
  }
  if (!issues.length) {
    const partial = (["attendance", "gpa", "serviceHours"] as const).some(k => tracked[k] && !measured[k]);
    return {
      level: "ok", lead: `${subj} in `, em: "good standing",
      tail: ` on ${partial ? "everything recorded so far" : "every measure"}${exempt && tracked.attendance ? " (exempt from attendance this term)" : ""}.`,
    };
  }
  const list = issues.length === 1 ? issues[0] : `${issues.slice(0, -1).join(", ")} and ${issues[issues.length - 1]}`;
  return { level: worst === 2 ? "risk" : "warn", lead: `${subj} `, em: worst === 2 ? "at risk" : "on watch", tail: `: ${list}.` };
}

/** One standing tile: value, level, caption. Mirrors the web card's Stat tiles. */
export interface Stat { key: Metric; label: string; value: string; level: Level; caption: string }

export function statsOf(b: Brother, t: Thresholds, tracked: Metrics, measured: Metrics, o: { dues: string; service: string }): Stat[] {
  const out: Stat[] = [];
  if (tracked.attendance) {
    const ex = isExempt(b.attendance);
    out.push({
      key: "attendance", label: "Attendance",
      value: ex ? "Exempt" : measured.attendance ? `${b.attendance}%` : "—",
      level: ex || !measured.attendance ? "none" : attLevel(b.attendance, t),
      caption: ex ? "no obligation this term" : measured.attendance ? `goal ${t.attendanceWatch}%` : "no meetings yet",
    });
  }
  if (tracked.gpa) {
    out.push({
      key: "gpa", label: "GPA",
      value: measured.gpa ? b.gpa.toFixed(2) : "—",
      level: measured.gpa ? gpaLevel(b.gpa, t) : "none",
      caption: measured.gpa ? `goal ${t.gpaWatch.toFixed(2)}` : "not entered yet",
    });
  }
  if (tracked.duesOwed) {
    out.push({
      key: "duesOwed", label: o.dues,
      value: b.duesOwed > 0 ? money(b.duesOwed) : b.duesOwed < 0 ? `${money(-b.duesOwed)} credit` : "Paid up",
      level: b.duesOwed > 0 ? "warn" : measured.duesOwed ? "ok" : "none",
      caption: b.duesOwed > 0 ? "outstanding" : "nothing owed",
    });
  }
  if (tracked.serviceHours) {
    const met = b.serviceHours >= t.serviceHoursGoal;
    out.push({
      key: "serviceHours", label: o.service,
      value: `${b.serviceHours}h`,
      level: !measured.serviceHours ? "none" : met ? "ok" : "warn",
      caption: met ? "goal met" : `of ${t.serviceHoursGoal}h`,
    });
  }
  return out;
}

/** Custom field values worth showing, in the org's order. */
export function customOf(b: Brother, defs: CustomMemberFieldDef[] | undefined): { label: string; value: string }[] {
  const vals = b.customFields ?? {};
  return (defs ?? [])
    .map(d => ({ label: d.label, value: vals[d.id] }))
    .filter((x): x is { label: string; value: string | number } => x.value != null && x.value !== "")
    .map(x => ({ label: x.label, value: String(x.value) }));
}

/* ── the register ─────────────────────────────────────────────────────────────── */

/** Office title: top-ranked role, else the free-text role, else "Member". */
export function titleOf(b: Brother): string {
  const top = [...(b.roles ?? [])].sort((a, c) => c.rank - a.rank)[0];
  return top?.name ?? (b.role && b.role !== "Brother" ? b.role : "Member");
}

export const letterOf = (name: string) => {
  const ch = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
};

export interface Group { letter: string; people: Brother[] }

export function groupByLetter(list: Brother[]): Group[] {
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const out: Group[] = [];
  for (const b of sorted) {
    const l = letterOf(b.name);
    const g = out[out.length - 1];
    if (g && g.letter === l) g.people.push(b);
    else out.push({ letter: l, people: [b] });
  }
  return out;
}

/** Name, any role name, or the custom-field values ("econ" finds the Economics majors). */
export function matches(b: Brother, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [b.name, b.role, ...(b.roles ?? []).map(r => r.name), ...Object.values(b.customFields ?? {}).map(v => String(v ?? ""))];
  return hay.some(h => h.toLowerCase().includes(s));
}
