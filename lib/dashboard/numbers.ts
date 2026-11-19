/**
 * The dashboard's headline numbers (DashNumbers / Measure), as plain facts: the value,
 * its units, the note under it and where a tap goes. Pure and client-safe. The web page
 * dresses each fact in a <Measure>; the native app draws the same fact natively.
 *
 * Every rule here is the one the web page used inline (see its comments for the why):
 * attendance ignores exempt members, dues are "unset" until the roster or the books say
 * otherwise, a measure nobody recorded prints "—" and a reason, never a 0.
 */
import type { Brother, TreasuryData } from "@/lib/api-types";
import type { DashStatId } from "@/lib/dashboard-layout";
import type { MetricSnapshot } from "@/lib/metrics";
import { isAttendanceExempt, type Thresholds } from "@/lib/thresholds";
import { avg, type RosterData } from "./standing";

export type NumberTone = "mint" | "butter" | "lilac" | "sky" | "peach" | "rose";

/** Where a tap on the number goes. Drawers are the web's KPI drawers. */
export type NumberTarget =
  | { kind: "drawer"; drawer: "attendance" | "dues" | "gpa" | "service" | "deadlines" }
  | { kind: "page"; page: "brothers" | "tasks" | "treasury" }
  | { kind: "metric"; definitionId: number };

export interface NumberFact {
  id: DashStatId;
  label: string;
  icon: string;
  tone: NumberTone;
  value: string;
  unit?: string;
  unitLeading?: string;
  /** Nothing recorded: the value is "—", units are suppressed. */
  unset?: boolean;
  note?: string;
  noteWarn?: boolean;
  noteGood?: boolean;
  /** 0–100 meter under the value, drawn from the same data (never a trend). */
  meter?: number;
  meterLabel?: string;
  /** The one next move for an unset measure ("Set an amount"). */
  action?: { label: string; target: NumberTarget };
  target: NumberTarget;
}

export interface NumberInputs {
  today: string;
  brothers: Brother[];
  roster: RosterData;
  thresholds: Thresholds;
  /** isFeatureEnabled("operations", id) for this org. */
  feature: (id: string) => boolean;
  words: { dues: string; service: string; members: string; member: (plural: boolean) => string };
  /** The week's agenda length and deadlines due this week. */
  weekEvents: number;
  weekDeadlines: number;
  tasksEnabled: boolean;
  openTasks: number;
  overdueTasks: number;
  canBrothers: boolean;
  pendingJoins: number;
  financeEnabled: boolean;
  canTreasury: boolean;
  treasury: TreasuryData | null;
  metrics: MetricSnapshot[];
}

const minusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Every number this org can show right now, keyed by id. */
export function numberFacts(i: NumberInputs): Partial<Record<DashStatId, NumberFact>> {
  const out: Partial<Record<DashStatId, NumberFact>> = {};
  const T = i.thresholds;
  const b = i.brothers;
  const r = i.roster;
  const attendees = b.filter(x => !isAttendanceExempt(x.attendance));
  const avgAttendance = avg(attendees.map(x => x.attendance));
  const belowAtt = attendees.filter(x => x.attendance < T.attendanceWatch).length;
  const outstanding = b.reduce((s, x) => s + x.duesOwed, 0);
  const owing = b.filter(x => x.duesOwed > 0).length;
  const gpa = avg(b.map(x => x.gpa));
  const belowGpa = b.filter(x => x.gpa < T.gpaWatch).length;
  const svcTotal = b.reduce((s, x) => s + x.serviceHours, 0);
  const onTrackSvc = b.filter(x => x.serviceHours >= T.serviceHoursGoal).length;
  const monthAgo = minusDays(i.today, 30);
  const joinedRecently = b.filter(x => (x.joinedAt ?? "").slice(0, 10) >= monthAgo).length;

  if (i.feature("kpi-attendance")) out.attendance = {
    id: "attendance", label: "Attendance", icon: "people", tone: "mint",
    value: r.hasAttendanceData ? avgAttendance.toFixed(1) : "—", unit: "%", unset: !r.hasAttendanceData,
    meter: r.hasAttendanceData ? avgAttendance : undefined, meterLabel: `${avgAttendance.toFixed(1)}% average attendance`,
    note: r.hasAttendanceData ? `${belowAtt} below ${T.attendanceWatch}%` : "No meetings recorded yet.",
    noteWarn: r.hasAttendanceData && belowAtt > 0,
    target: { kind: "drawer", drawer: "attendance" },
  };
  if (i.feature("kpi-dues")) out.dues = {
    id: "dues", label: `${i.words.dues} outstanding`, icon: "wallet", tone: "butter",
    value: r.hasDuesData ? outstanding.toLocaleString() : "—", unitLeading: "$", unset: !r.hasDuesData,
    meter: r.hasDuesData && b.length > 0 ? ((b.length - owing) / b.length) * 100 : undefined,
    meterLabel: `${b.length - owing} of ${b.length} paid up`,
    note: r.hasDuesData ? `${owing} ${i.words.member(owing !== 1).toLowerCase()} owe` : `No ${i.words.dues.toLowerCase()} set yet.`,
    noteWarn: r.hasDuesData && owing > 0,
    action: !r.hasDuesData && i.canTreasury && i.financeEnabled ? { label: "Set an amount", target: { kind: "page", page: "treasury" } } : undefined,
    target: { kind: "drawer", drawer: "dues" },
  };
  if (i.feature("kpi-gpa")) out.gpa = {
    id: "gpa", label: "Average GPA", icon: "star", tone: "lilac",
    value: r.hasGpaData ? gpa.toFixed(2) : "—", unset: !r.hasGpaData,
    meter: r.hasGpaData ? (gpa / 4) * 100 : undefined, meterLabel: `${gpa.toFixed(2)} of 4.00`,
    note: r.hasGpaData ? `${belowGpa} below ${T.gpaWatch.toFixed(1)}` : "No grades on file yet.",
    target: { kind: "drawer", drawer: "gpa" },
  };
  if (i.feature("kpi-service")) out.service = {
    id: "service", label: i.words.service, icon: "heart", tone: "sky",
    value: r.hasServiceData ? `${svcTotal}` : "—", unit: "h", unset: !r.hasServiceData,
    meter: r.hasServiceData && b.length > 0 ? (onTrackSvc / b.length) * 100 : undefined,
    meterLabel: `${onTrackSvc} of ${b.length} on track`,
    note: r.hasServiceData ? `${onTrackSvc} of ${b.length} on track` : "Nothing logged this term.",
    target: { kind: "drawer", drawer: "service" },
  };
  out.members = {
    id: "members", label: i.words.members, icon: "people", tone: "sky",
    value: String(b.length),
    note: joinedRecently > 0 ? `+${joinedRecently} in the last 30 days` : "on the roster",
    noteGood: joinedRecently > 0,
    target: { kind: "page", page: "brothers" },
  };
  out.week = {
    id: "week", label: "This week", icon: "cal", tone: "butter",
    value: String(i.weekEvents), unit: i.weekEvents === 1 ? " event" : " events",
    note: i.weekDeadlines ? `${i.weekDeadlines} deadline${i.weekDeadlines === 1 ? "" : "s"} due` : "no deadlines due",
    target: { kind: "drawer", drawer: "deadlines" },
  };
  if (i.tasksEnabled) out.tasks = {
    id: "tasks", label: "Open tasks", icon: "box", tone: "peach",
    value: String(i.openTasks),
    note: i.overdueTasks > 0 ? `${i.overdueTasks} overdue` : i.openTasks > 0 ? "nothing overdue" : "all done",
    noteWarn: i.overdueTasks > 0, noteGood: i.overdueTasks === 0,
    target: { kind: "page", page: "tasks" },
  };
  if (i.canBrothers) out.requests = {
    id: "requests", label: "Asking to join", icon: "door", tone: "lilac",
    value: String(i.pendingJoins),
    note: i.pendingJoins > 0 ? "waiting on an officer" : "no one waiting",
    noteWarn: i.pendingJoins > 0,
    target: { kind: "page", page: "brothers" },
  };
  if (i.financeEnabled) out.balance = {
    id: "balance", label: "Balance", icon: "wallet", tone: "mint",
    value: i.treasury ? Math.round(i.treasury.balance).toLocaleString() : "—", unitLeading: "$", unset: !i.treasury,
    note: i.treasury ? `$${Math.round(i.treasury.projected).toLocaleString()} projected` : undefined,
    target: { kind: "page", page: "treasury" },
  };
  for (const snap of i.metrics) {
    const fmt = Number.isInteger(snap.headline) ? String(snap.headline) : snap.headline.toFixed(1);
    const value = snap.aggregation === "count_on_track" ? `${snap.headline} / ${snap.totalCount}` : snap.unit ? `${fmt}${snap.unit}` : fmt;
    const note = snap.aggregation === "count_on_track" ? `${snap.onTrackCount} on track` : `Goal ${snap.goal}${snap.unit ?? ""}`;
    out[`metric:${snap.definitionId}`] = {
      id: `metric:${snap.definitionId}`, label: snap.name, icon: "bars", tone: "rose", value, note,
      target: { kind: "metric", definitionId: snap.definitionId },
    };
  }
  return out;
}
