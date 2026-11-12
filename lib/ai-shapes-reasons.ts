// Reasons (docs/ask-chapt-answer-system-plan.md, Phase 4): "why is X flagged
// for attendance?" answered as a case file. v1 is attendance only — the one
// metric with a per-event history to show.
//
// The model writes the reason cards (its rows, each tagged with the panel it
// rests on). Everything in the folder is read here: the gauge counts exactly
// what the roster % counts (lib/attendance.ts: mandatory meetings, an approved
// excuse takes the meeting out of both sides), the strip is every mandatory
// meeting this semester, and "the way back" is arithmetic over the meetings
// still on the calendar. Nothing is drawn that get_brother_attendance and
// list_brothers wouldn't already show this caller; an excuse's reason only for
// attendance managers and the member themselves.

import type { db } from "@/lib/db";
import type { AnswerRow, ToolAccess } from "@/lib/ai-tools";
import { orgThresholds } from "@/lib/ai-tools";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import type { ShapeEvidence } from "@/lib/ai-shape-evidence";
import { getActiveSemester } from "@/lib/attendance";
import { isAttendanceExempt, type Thresholds } from "@/lib/thresholds";
import { hasPermission } from "@/lib/permissions";
import { fmtUsd } from "@/lib/money";
import type { ReasonPanel, ReasonsShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string; access?: ToolAccess }

export const REASON_PANELS: readonly ReasonPanel[] = ["gauge", "strip", "rest"];
export const REASONS_MAX = 4;
/** A past meeting with nobody marked yet may still be recorded — within this many days it counts as still to come. */
export const UNRECORDED_GRACE_DAYS = 14;

/** Same rounding as recalcBrotherAttendance. */
const pct = (attended: number, counted: number) => (counted === 0 ? 0 : Math.round((attended / counted) * 100));

/**
 * Pure: what the meetings still on the calendar can do. Outcomes for making
 * all of them and for missing one; null when there are none. Exported for tests.
 */
export function pathBack(attended: number, counted: number, left: number, atRisk: number): ReasonsShape["pathBack"] {
  if (left <= 0) return null;
  const all = { attend: left, attended: attended + left, counted: counted + left };
  const outcomes = [{ ...all, pct: pct(all.attended, all.counted), clears: pct(all.attended, all.counted) >= atRisk }];
  if (left >= 1) {
    const one = { attend: left - 1, attended: attended + left - 1, counted: counted + left };
    outcomes.push({ ...one, pct: pct(one.attended, one.counted), clears: pct(one.attended, one.counted) >= atRisk });
  }
  return { left, outcomes };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

interface CaseInput {
  member: { id: number; name: string; role: string; joinedAt: string; duesOwed: number; serviceHours: number; gpa: number };
  thresholds: Thresholds;
  meetings: Array<{ id: number; date: string }>;
  records: Array<{ calendarEventId: number; attended: boolean }>;
  excuses: Array<{ calendarEventId: number; status: string; reason: string }>;
  /** Event ids of mandatory meetings, for counting exactly as the roster % does. */
  mandatory: Set<number>;
  today: string;
  seeReasons: boolean;
}

/** Pure: the reads → the case file (everything but the reason cards). Exported for tests. */
export function caseFile(input: CaseInput): Omit<ReasonsShape, "type" | "judgment"> {
  const { member, thresholds, today } = input;
  const approved = new Map(input.excuses.filter(e => e.status === "approved").map(e => [e.calendarEventId, e] as const));
  const recordBy = new Map(input.records.map(r => [r.calendarEventId, r] as const));

  // The gauge: recalcBrotherAttendance's arithmetic, over this member's records.
  const eligible = input.records.filter(r => input.mandatory.has(r.calendarEventId) && !approved.has(r.calendarEventId));
  const attended = eligible.filter(r => r.attended).length;
  const counted = eligible.length;

  const strip: ReasonsShape["strip"] = [];
  const excluded: ReasonsShape["excluded"] = [];
  let left = 0;
  for (const m of [...input.meetings].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const ex = approved.get(m.id);
    const rec = recordBy.get(m.id);
    let state: ReasonsShape["strip"][number]["state"];
    if (ex) {
      state = "excused";
      excluded.push({ eventId: m.id, date: m.date, why: "excused", ...(input.seeReasons && ex.reason ? { reason: ex.reason.slice(0, 80) } : {}) });
    } else if (rec) {
      state = rec.attended ? "there" : "missed";
    } else if (m.date >= today) {
      state = "ahead";
      left++;
    } else {
      state = "unrecorded";
      excluded.push({ eventId: m.id, date: m.date, why: "unrecorded" });
      if (daysBetween(m.date, today) <= UNRECORDED_GRACE_DAYS) left++;
    }
    strip.push({ eventId: m.id, date: m.date, state });
  }

  const rest: ReasonsShape["rest"] = [
    { label: "dues owed", value: fmtUsd(member.duesOwed), ok: member.duesOwed <= 0 },
    ...(member.serviceHours > 0 || thresholds.serviceHoursGoal > 0
      ? [{ label: "service", value: `${member.serviceHours} hrs`, ok: member.serviceHours >= thresholds.serviceHoursGoal, note: `goal ${thresholds.serviceHoursGoal}` }]
      : []),
    // A 0 GPA is "not entered", not a reading — leave it out rather than call it low.
    ...(member.gpa > 0
      ? [{ label: "GPA", value: member.gpa.toFixed(2), ok: member.gpa >= thresholds.gpaWatch, note: `watch under ${thresholds.gpaWatch}` }]
      : []),
  ];

  return {
    subject: { id: member.id, name: member.name, role: member.role, joinedAt: member.joinedAt.slice(0, 10) },
    gauge: {
      value: pct(attended, counted),
      attended,
      counted,
      atRisk: thresholds.attendanceAtRisk,
      watch: thresholds.attendanceWatch > thresholds.attendanceAtRisk ? thresholds.attendanceWatch : null,
    },
    strip,
    rest,
    excluded,
    pathBack: pathBack(attended, counted, left, thresholds.attendanceAtRisk),
    today,
  };
}

/** The model's reason cards: at most four, each with a panel it may point at. */
export function reasonRows(rows: AnswerRow[]): AnswerRow[] {
  return rows.slice(0, REASONS_MAX).map(r => {
    const panel = r.panel && REASON_PANELS.includes(r.panel) ? r.panel : undefined;
    const { panel: _drop, ...rest } = r;
    return panel ? { ...rest, panel } : rest;
  });
}

function seesReasons(access: ToolAccess | undefined, brotherId: number): boolean {
  if (!access) return false;
  return access.isPlatformAdmin || access.isOrgAdmin || hasPermission(access.permissions, "MANAGE_ATTENDANCE") || access.actorId === brotherId;
}

export async function buildReasons(_req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, orgId: number, o: Opts): Promise<BuiltShape | null> {
  // Exactly one member, read through get_brother_attendance this turn.
  const read = evidence.get("get_brother_attendance")?.result as { brother?: { id?: unknown } } | undefined;
  const id = read?.brother && typeof read.brother.id === "number" ? read.brother.id : null;
  if (id == null) return null;
  const cards = reasonRows(o.rows);
  if (cards.length === 0) return null;

  // Waves of at most two scoped reads (the pool is two connections).
  const [row, semester] = await Promise.all([scoped.member.findRosterRow(id), getActiveSemester(scoped)]);
  if (!row || row.isGhost || !semester) return null;
  // Exempt this semester: there's no judgment to explain.
  if (isAttendanceExempt(row.attendance)) return null;
  const thresholds = await orgThresholds(scoped, orgId);
  const [records, excuses] = await Promise.all([
    scoped.attendanceRecord.findMany({ where: { brotherId: id, semesterId: semester.id }, select: { calendarEventId: true, attended: true } }),
    scoped.attendanceExcuse.findMany({ where: { brotherId: id, semesterId: semester.id }, select: { calendarEventId: true, status: true, reason: true } }),
  ]) as [Array<{ calendarEventId: number; attended: boolean }>, Array<{ calendarEventId: number; status: string; reason: string }>];
  const meetings = await scoped.calendarEvent.findMany({
    where: { mandatory: true, date: { gte: semester.startDate, lte: semester.endDate } },
    select: { id: true, date: true },
  }) as Array<{ id: number; date: string }>;
  // A record whose event sits outside the semester's dates still counts toward
  // the %, exactly as recalc counts it: the mandatory set is all mandatory events.
  const outside = records.map(r => r.calendarEventId).filter(eid => !meetings.some(m => m.id === eid));
  const extra = outside.length
    ? await scoped.calendarEvent.findMany({ where: { id: { in: outside }, mandatory: true }, select: { id: true } }) as Array<{ id: number }>
    : [];
  const mandatory = new Set([...meetings.map(m => m.id), ...extra.map(e => e.id)]);

  const file = caseFile({
    member: { id: row.id, name: row.name, role: row.role, joinedAt: row.joinedAt, duesOwed: row.duesOwed, serviceHours: row.serviceHours, gpa: row.gpa },
    thresholds, meetings, records, excuses, mandatory, today: o.today, seeReasons: seesReasons(o.access, id),
  });
  if (file.gauge.counted === 0) return null;
  return { shape: { type: "reasons", judgment: "attendance", ...file }, rows: cards };
}
