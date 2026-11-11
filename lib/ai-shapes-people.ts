// The people family of list forms (docs/ask-chapt-list-forms-plan.md §4.1,
// §4.6, §4.7): Standings (`ranked`), Side by side (`table`) and Roll call
// (`roll`).
//
// Privacy: a builder shows only fields the evidence tool already returned to
// this caller. list_brothers hands every member's attendance, GPA, dues and
// service hours to whoever asks, so ranking those reveals nothing new; the
// event-attendance rates are derived from the same records get_event_attendance
// (ungated) reads. No builder here reads a column its source tool doesn't serve.
//
// "Not recorded" is not zero: a metric nobody has a record for yet can't be
// ranked at all (null — the plain rows stay), and a member with no reading of
// their own (an exempt attendance, a blank GPA) is drawn as "not recorded",
// never coloured, and sorted last.

import type { db } from "@/lib/db";
import type { AnswerRow } from "@/lib/ai-tools";
import { orgStanding, orgStandingConfig } from "@/lib/ai-tools";
import type { ShapeRequest, RollSplit } from "@/lib/ai-shape-request";
import { listItems, narrowToRows, prop, recordsOf, sourceRead, type ShapeEvidence, type SourceReader, type SourceRecord } from "@/lib/ai-shape-evidence";
import { ExcuseStatus } from "@/lib/state";
import { fmtUsd, money } from "@/lib/money";
import type { Thresholds } from "@/lib/thresholds";
import type { TrackedMetrics } from "@/lib/tracked-metrics";
import type { MetricUnit, RankMetric, RankedShape, RollShape, TableShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";
import { fmtDay } from "@/lib/ai-shapes-calendar";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string }

export const RANKED_MAX = 12;
export const TABLE_MAX = 24;
export const ROLL_MAX = 60;

/** One member as list_brothers serves them. */
export interface MemberRow {
  id: number;
  name: string;
  role: string;
  attendance: number;
  gpa: number;
  duesOwed: number;
  serviceHours: number;
}

type MemberMetric = Exclude<RankMetric, "event_attendance">;

interface MetricDef {
  label: string;
  unit: MetricUnit;
  better: "higher" | "lower";
  tracked: keyof TrackedMetrics;
  /** A member's own reading, or null when they have none. */
  read: (m: MemberRow) => number | null;
  /** The org's threshold for it, when the org set one. */
  bar: (t: Thresholds, set: ReadonlySet<string>) => { at: number; label: string } | null;
}

export const METRIC_DEFS: Record<MemberMetric, MetricDef> = {
  service_hours: {
    label: "Service hours", unit: "hrs", better: "higher", tracked: "serviceHours",
    read: m => money(m.serviceHours),
    bar: (t, set) => (set.has("serviceHoursGoal") ? { at: t.serviceHoursGoal, label: `Your bar · ${t.serviceHoursGoal} hrs` } : null),
  },
  gpa: {
    label: "GPA", unit: "gpa", better: "higher", tracked: "gpa",
    // A 0.00 GPA is a blank, not a reading.
    read: m => (m.gpa > 0 ? m.gpa : null),
    bar: (t, set) => (set.has("gpaWatch") ? { at: t.gpaWatch, label: `Your bar · ${t.gpaWatch.toFixed(1)}` } : null),
  },
  attendance: {
    label: "Attendance", unit: "pct", better: "higher", tracked: "attendance",
    // -1 is the exempt sentinel.
    read: m => (m.attendance < 0 ? null : Math.round(m.attendance)),
    bar: (t, set) => (set.has("attendanceWatch") ? { at: t.attendanceWatch, label: `Your bar · ${t.attendanceWatch}%` } : null),
  },
  dues_owed: {
    label: "Dues owed", unit: "usd", better: "lower", tracked: "duesOwed",
    read: m => money(m.duesOwed),
    // Owing anything is over: that's the dues rule itself, not a guessed threshold.
    bar: () => ({ at: 0, label: "Owes nothing" }),
  },
};

export function fmtNum(n: number | null, unit: MetricUnit): string {
  if (n == null) return "not recorded";
  if (unit === "hrs") return `${n} hr${n === 1 ? "" : "s"}`;
  if (unit === "usd") return fmtUsd(n);
  if (unit === "pct") return `${Math.round(n)}%`;
  return n.toFixed(2);
}

/** Scale for a unit over these values. */
export function scaleOf(unit: MetricUnit, nums: number[]): { min: number; max: number } {
  if (unit === "pct") return { min: 0, max: 100 };
  if (unit === "gpa") {
    // From zero, 3.1 and 3.9 look identical: start a whole point under the lowest.
    const lo = nums.length ? Math.min(...nums) : 0;
    return { min: Math.max(0, Math.floor(lo) - 1), max: Math.max(4, ...nums) };
  }
  return { min: 0, max: Math.max(1, ...nums) };
}

function memberRecords(result: unknown): SourceRecord[] {
  return recordsOf(prop(result, "brothers") ?? listItems(result), "name", null);
}
function asMember(r: SourceRecord): MemberRow {
  const x = r.raw;
  const n = (k: string) => (typeof x[k] === "number" ? (x[k] as number) : 0);
  return { id: r.id, name: r.title, role: typeof x.role === "string" ? x.role : "", attendance: n("attendance"), gpa: n("gpa"), duesOwed: n("duesOwed"), serviceHours: n("serviceHours") };
}

/** Which threshold keys the org set itself (the rest are app defaults, and draw no bar). */
async function standing(scoped: Scoped, orgId: number, roster?: MemberRow[]) {
  // Sequential: the scoped pool is two connections.
  const { thresholds, measured } = await orgStanding(scoped, orgId, roster);
  const config = await scoped.organizationConfig.find();
  const raw = config?.thresholds;
  const set = new Set(raw && typeof raw === "object" ? Object.keys(raw as object) : []);
  return { thresholds, measured, set };
}

// ────────────────────────────────────────────────────────────────────────────
// Standings
// ────────────────────────────────────────────────────────────────────────────

/** Pure: members + one metric → standings, or null when the metric has no readings at all. */
export function rankedFromMembers(input: {
  metric: MemberMetric;
  members: MemberRow[];
  thresholds: Thresholds;
  setKeys: ReadonlySet<string>;
  measured: TrackedMetrics;
  truncated: { of: number } | null;
  scope: string;
}): BuiltShape<RankedShape> | null {
  const def = METRIC_DEFS[input.metric];
  if (input.members.length < 2 || !input.measured[def.tracked]) return null;
  const withNum = input.members.map(m => ({ m, num: def.read(m) }));
  if (withNum.every(x => x.num == null)) return null;
  const dir = def.better === "higher" ? -1 : 1;
  withNum.sort((a, b) =>
    a.num == null ? (b.num == null ? a.m.name.localeCompare(b.m.name) : 1)
    : b.num == null ? -1
    : (a.num - b.num) * dir || a.m.name.localeCompare(b.m.name));
  const nums = withNum.flatMap(x => (x.num == null ? [] : [x.num]));
  const shape: RankedShape = {
    type: "ranked",
    metric: input.metric,
    kicker: `${def.label} · ${input.scope}`,
    unit: def.unit,
    better: def.better,
    ...scaleOf(def.unit, nums),
    bar: def.bar(input.thresholds, input.setKeys),
    order: "rank",
    items: withNum.map(x => ({ num: x.num, date: null })),
    truncated: input.truncated,
  };
  const rows: AnswerRow[] = withNum.map(({ m, num }) => ({
    kind: "person",
    title: m.name,
    ...(m.role ? { subtitle: m.role } : {}),
    value: fmtNum(num, def.unit),
    ref: { type: "member", id: m.id },
  }));
  return { shape, rows };
}

/** Pure: events + their turnout → dated standings (date order, no ranks). */
export function rankedFromEvents(input: {
  events: Array<{ id: number; title: string; date: string; rate: number | null }>;
  bar: { at: number; label: string } | null;
  truncated: { of: number } | null;
  scope: string;
}): BuiltShape<RankedShape> | null {
  if (input.events.length < 2 || input.events.every(e => e.rate == null)) return null;
  const events = [...input.events].sort((a, b) => a.date.localeCompare(b.date));
  const shape: RankedShape = {
    type: "ranked",
    metric: "event_attendance",
    kicker: `Attendance · ${input.scope}`,
    unit: "pct",
    better: "higher",
    min: 0,
    max: 100,
    bar: input.bar,
    order: "date",
    items: events.map(e => ({ num: e.rate, date: e.date })),
    truncated: input.truncated,
  };
  const rows: AnswerRow[] = events.map(e => ({
    kind: "event",
    title: e.title,
    subtitle: fmtDay(e.date),
    value: fmtNum(e.rate, "pct"),
    ref: { type: "event", id: e.id },
  }));
  return { shape, rows };
}

/** present ÷ (present + absent) per event, by get_event_attendance's own rules (ghosts out, an approved excuse counts as neither). */
async function turnout(scoped: Scoped, ids: number[]): Promise<Map<number, number | null>> {
  const records = await scoped.attendanceRecord.findMany({
    where: { calendarEventId: { in: ids } },
    select: { calendarEventId: true, brotherId: true, attended: true, brother: { select: { isGhost: true } } },
  });
  const excused = await scoped.attendanceExcuse.findMany({
    where: { calendarEventId: { in: ids }, status: ExcuseStatus.Approved },
    select: { calendarEventId: true, brotherId: true },
  });
  const ex = new Set(excused.map(e => `${e.calendarEventId}:${e.brotherId}`));
  const out = new Map<number, number | null>();
  for (const id of ids) {
    const rs = records.filter(r => r.calendarEventId === id && !r.brother.isGhost && !ex.has(`${id}:${r.brotherId}`));
    out.set(id, rs.length ? Math.round((rs.filter(r => r.attended).length / rs.length) * 100) : null);
  }
  return out;
}

function memberScope(n: number, truncated: { of: number } | null): string {
  return truncated ? `top ${n} of ${truncated.of}` : `${n} member${n === 1 ? "" : "s"}`;
}

export async function buildRanked(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, orgId: number, o: Opts): Promise<BuiltShape | null> {
  if (!req.rank) return null;
  if (req.rank === "event_attendance") {
    const cal = evidence.get("list_calendar_events");
    if (!cal) return null;
    const all = recordsOf(listItems(cal.result), "title", "date").filter(r => r.date && r.date < o.today);
    // Newest through the cap, drawn oldest first.
    const pick = narrowToRows([...all].sort((a, b) => b.date!.localeCompare(a.date!)), o.rows, RANKED_MAX);
    if (pick.records.length < 2) return null;
    const rates = await turnout(scoped, pick.records.map(r => r.id));
    const { thresholds, set } = await standing(scoped, orgId);
    return rankedFromEvents({
      events: pick.records.map(r => ({ id: r.id, title: r.title, date: r.date!, rate: rates.get(r.id) ?? null })),
      bar: set.has("attendanceWatch") ? { at: thresholds.attendanceWatch, label: `Your bar · ${thresholds.attendanceWatch}%` } : null,
      truncated: pick.truncated,
      scope: `${pick.records.length} events`,
    });
  }
  const read = evidence.get("list_brothers");
  if (!read) return null;
  const metric = req.rank;
  const def = METRIC_DEFS[metric];
  // Rank the whole source by the metric before the cap, so a cut keeps the top.
  const dir = def.better === "higher" ? -1 : 1;
  const all = memberRecords(read.result).sort((a, b) => {
    const x = def.read(asMember(a)), y = def.read(asMember(b));
    return x == null ? 1 : y == null ? -1 : (x - y) * dir;
  });
  const pick = narrowToRows(all, o.rows, RANKED_MAX);
  const members = pick.records.map(asMember);
  const { thresholds, measured, set } = await standing(scoped, orgId, all.map(asMember));
  return rankedFromMembers({ metric, members, thresholds, setKeys: set, measured, truncated: pick.truncated, scope: memberScope(members.length, pick.truncated) });
}

// ────────────────────────────────────────────────────────────────────────────
// Side by side
// ────────────────────────────────────────────────────────────────────────────

/** Pure: members × measures → a table, or null with fewer than two usable columns. */
export function tableFromMembers(input: {
  metrics: MemberMetric[];
  members: MemberRow[];
  thresholds: Thresholds;
  setKeys: ReadonlySet<string>;
  tracked: TrackedMetrics;
  measured: TrackedMetrics;
  truncated: { of: number } | null;
  scope: string;
}): BuiltShape<TableShape> | null {
  if (input.members.length < 2) return null;
  // A measure the org doesn't track, or has no readings for, isn't offered as a column.
  const keys = input.metrics.filter(k => input.tracked[METRIC_DEFS[k].tracked] && input.measured[METRIC_DEFS[k].tracked]);
  if (keys.length < 2) return null;
  const cols: TableShape["cols"] = keys.map(k => {
    const d = METRIC_DEFS[k];
    return { key: k, label: d.label, unit: d.unit, better: d.better, bar: d.bar(input.thresholds, input.setKeys)?.at ?? null };
  });
  // Source order, not "most misses first": sorting is the reader's, on the client.
  const cells = input.members.map(m => Object.fromEntries(keys.map(k => [k, METRIC_DEFS[k].read(m)])) as Record<string, number | null>);
  const shape: TableShape = { type: "table", kicker: input.scope, cols, cells, dates: null, truncated: input.truncated };
  const rows: AnswerRow[] = input.members.map((m, i) => ({
    kind: "person",
    title: m.name,
    ...(m.role ? { subtitle: m.role } : {}),
    value: cols.map(c => fmtNum(cells[i][c.key], c.unit)).join(" · ").slice(0, 24),
    ref: { type: "member", id: m.id },
  }));
  return { shape, rows };
}

export async function buildTable(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, orgId: number, o: Opts): Promise<BuiltShape | null> {
  const metrics = (req.metrics ?? []).filter((m): m is MemberMetric => m !== "event_attendance");
  if (metrics.length < 2) return null;
  const read = evidence.get("list_brothers");
  if (!read) return null;
  const all = memberRecords(read.result);
  const pick = narrowToRows(all, o.rows, TABLE_MAX);
  const members = pick.records.map(asMember);
  const { thresholds, measured, set } = await standing(scoped, orgId, all.map(asMember));
  const { tracked } = await orgStandingConfig(scoped, orgId);
  const n = members.length;
  return tableFromMembers({
    metrics, members, thresholds, setKeys: set, tracked, measured, truncated: pick.truncated,
    scope: pick.truncated ? `${n} of ${pick.truncated.of} members` : `${n} member${n === 1 ? "" : "s"}`,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Roll call
// ────────────────────────────────────────────────────────────────────────────

export interface RollPerson { id: number | null; name: string; group: number; note: string | null }

/** Pure: people already split into groups → the roll. Any count from one. */
export function rollFromPeople(input: {
  groups: RollShape["groups"];
  people: RollPerson[];
  rows: AnswerRow[];
}): BuiltShape<RollShape> | null {
  if (input.people.length === 0) return null;
  const sorted = [...input.people].sort((a, b) => a.group - b.group || a.name.localeCompare(b.name));
  const recs: SourceRecord[] = sorted.map((p, i) => ({ id: p.id ?? -(i + 1), title: p.name, date: null, raw: p as unknown as Record<string, unknown> }));
  const pick = narrowToRows(recs, input.rows, ROLL_MAX);
  const set = pick.records.map(r => r.raw as unknown as RollPerson);
  // Only groups someone is in are drawn, renumbered to match.
  const used = [...new Set(set.map(p => p.group))].sort((a, b) => a - b);
  const groups = used.map(g => input.groups[g]);
  const shape: RollShape = {
    type: "roll",
    groups,
    items: set.map(p => ({ group: used.indexOf(p.group), note: p.note })),
    truncated: pick.truncated,
  };
  const rows: AnswerRow[] = set.map(p => ({
    kind: "person",
    title: p.name,
    subtitle: input.groups[p.group].label,
    ...(p.note ? { value: p.note } : {}),
    ...(p.id != null ? { ref: { type: "member" as const, id: p.id } } : {}),
  }));
  return { shape, rows };
}

/** People out of a list of bare names (get_event_attendance serves no ids). */
function namedRecords(names: unknown): SourceRecord[] {
  return (Array.isArray(names) ? names : [])
    .map(n => (typeof n === "string" ? n : typeof n === "object" && n !== null ? (n as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === "string")
    .map((name, i) => ({ id: -(i + 1), title: name, date: null, raw: {} }));
}

// Who each roll source names, so the roll is drawn from the read the answer's
// people came from (two events' attendance, or the roster read twice, in a turn).
const ROLL_SOURCES: Record<string, SourceReader> = {
  list_brothers: memberRecords,
  get_event_attendance: r => [...namedRecords(prop(r, "absent")), ...namedRecords(prop(r, "excused"))],
  list_polls: r => listItems(r).flatMap(p => recordsOf(p.notVoted, "name", null)),
  list_attendance_exemptions: r => recordsOf(listItems(r), "name", null),
};

export async function buildRoll(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  const read = sourceRead(evidence, ROLL_SOURCES, o.rows);
  if (!read) return null;
  const split: RollSplit | undefined = req.split;

  if (read.tool === "list_brothers") {
    const members = memberRecords(read.result).map(asMember);
    if (split === "paid") {
      return rollFromPeople({
        groups: [{ label: "Owe", flag: true }, { label: "Paid up", flag: false }],
        people: members.map(m => ({ id: m.id, name: m.name, group: m.duesOwed > 0 ? 0 : 1, note: m.duesOwed > 0 ? fmtUsd(m.duesOwed) : null })),
        rows: o.rows,
      });
    }
    return rollFromPeople({ groups: [{ label: "Members", flag: true }], people: members.map(m => ({ id: m.id, name: m.name, group: 0, note: null })), rows: o.rows });
  }

  if (read.tool === "get_event_attendance") {
    const r = read.result as { absent?: unknown; excused?: unknown; attended?: unknown };
    if (!Array.isArray(r.absent)) return null;
    // The tool serves names; resolve them to this org's roster ids (a name two
    // members share stays a chip without a peek, never a guessed one).
    const roster = await scoped.member.listRoster();
    const ids = new Map<string, number | null>();
    for (const m of roster) ids.set(m.name, ids.has(m.name) ? null : m.id);
    const absent = (r.absent as unknown[]).filter((n): n is string => typeof n === "string");
    const excused = Array.isArray(r.excused)
      ? (r.excused as Array<{ name?: unknown; status?: unknown }>).filter(e => e.status === ExcuseStatus.Approved && typeof e.name === "string").map(e => e.name as string)
      : [];
    const people: RollPerson[] = [
      ...absent.map(name => ({ id: ids.get(name) ?? null, name, group: 0, note: null })),
      ...(split === "excused" ? excused.map(name => ({ id: ids.get(name) ?? null, name, group: 1, note: null })) : []),
    ];
    return rollFromPeople({
      groups: split === "excused" ? [{ label: "No excuse", flag: true }, { label: "Excused", flag: false }] : [{ label: "Missed", flag: true }],
      people,
      rows: o.rows,
    });
  }

  if (read.tool === "list_polls") {
    // notVoted is served to poll managers only; anyone else's read has none.
    const polls = listItems(read.result).filter(p => Array.isArray(p.notVoted));
    if (polls.length !== 1) return null;
    const people = recordsOf(polls[0].notVoted, "name", null).map(p => ({ id: p.id, name: p.title, group: 0, note: null }));
    return rollFromPeople({ groups: [{ label: "Haven't voted", flag: true }], people, rows: o.rows });
  }

  const people = recordsOf(listItems(read.result), "name", null).map(p => ({ id: p.id, name: p.title, group: 0, note: typeof p.raw.reason === "string" ? p.raw.reason : null }));
  return rollFromPeople({ groups: [{ label: "Exempt", flag: true }], people, rows: o.rows });
}
