// The calendar family of list forms (docs/ask-chapt-list-forms-plan.md §4.2,
// §4.3, §4.10): Today line (`dated`), Logbook (`logbook`) and Past due
// (`pastdue`). Each is built from records the model read this turn, never from
// its row text, and qualifies only when EVERY record has what the form needs;
// otherwise it returns null and the answer keeps its plain rows.
//
// Pure `xFromRecords` functions do the deciding (exported for tests); the
// thin async wrappers pick the records out of the evidence and read the few
// labels the payloads don't carry.

import type { db } from "@/lib/db";
import type { AnswerRow } from "@/lib/ai-tools";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import { listItems, narrowToRows, prop, recordsOf, type ShapeEvidence, type SourceRecord } from "@/lib/ai-shape-evidence";
import { DATE_RE, isValidCalendarDate } from "@/lib/dates";
import type { DatedShape, LogbookShape, PastDueOwner, PastDueShape } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string }

export const DATED_MAX = 24;
export const LOGBOOK_MAX = 120;
export const PASTDUE_MAX = 24;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
const validDate = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v) && isValidCalendarDate(v);

/** "7:00 PM" / "19:00" → minutes past midnight; free text and no time sort last. */
function minutesOf(time: string | null): number {
  if (!time) return 24 * 60;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*$/i.exec(time);
  if (!m) return 24 * 60 + 1;
  let h = Number(m[1]) % 24;
  if (m[3]) { h = h % 12; if (m[3].toLowerCase() === "p") h += 12; }
  return h * 60 + Number(m[2] ?? 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Today line — tasks and events on one rail around today
// ────────────────────────────────────────────────────────────────────────────

/** One calendar thing, normalised from either a task or an event payload. */
export interface CalThing {
  kind: "task" | "event";
  id: number;
  title: string;
  date: string;
  time: string | null;
  /** task: open | done. Events have none. */
  status: string | null;
  /** event: its type slug; task: null. */
  category: string | null;
  /** task: who has it, as list_deadlines labels it. */
  assignees: string | null;
}

function taskThings(items: unknown): CalThing[] {
  return listItems(items).flatMap(r => validDate(r.dueDate) && typeof r.id === "number" && typeof r.title === "string" ? [{
    kind: "task" as const, id: r.id, title: r.title, date: r.dueDate,
    time: typeof r.dueTime === "string" ? r.dueTime : null,
    status: typeof r.status === "string" ? r.status : null,
    category: null,
    assignees: typeof r.assignees === "string" ? r.assignees : null,
  }] : []);
}

function eventThings(items: unknown): CalThing[] {
  return listItems(items).flatMap(r => validDate(r.date) && typeof r.id === "number" && typeof r.title === "string" ? [{
    kind: "event" as const, id: r.id, title: r.title, date: r.date,
    time: typeof r.time === "string" && r.time.trim() ? r.time.trim() : null,
    status: null,
    category: typeof r.category === "string" ? r.category : null,
    assignees: null,
  }] : []);
}

/** A dated task also lives on the Timeline as a `deadline` event: keep it once, as the task. */
function dedupe(things: CalThing[]): CalThing[] {
  const key = (t: CalThing) => `${t.date}|${t.title.trim().toLowerCase()}`;
  const tasks = new Set(things.filter(t => t.kind === "task").map(key));
  const seen = new Set<string>();
  return things.filter(t => {
    if (t.kind === "event" && t.category === "deadline" && tasks.has(key(t))) return false;
    const id = `${t.kind}:${t.id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const byWhen = (a: CalThing, b: CalThing) => a.date.localeCompare(b.date) || minutesOf(a.time) - minutesOf(b.time);

const asRecord = (t: CalThing): SourceRecord => ({ kind: t.kind, id: t.id, title: t.title, date: t.date, raw: t as unknown as Record<string, unknown> });

/** Pure: the set → the Today line, or null when nothing is today or later. */
export function datedFromThings(input: {
  things: CalThing[];
  today: string;
  rows: AnswerRow[];
  typeLabels: Map<string, string>;
}): BuiltShape<DatedShape> | null {
  const all = dedupe(input.things).sort(byWhen);
  if (all.length === 0) return null;
  // Past the cap, keep what's still ahead first, then the most recent of what
  // isn't: a cut must never drop the part of the rail that's the point.
  const ahead = all.filter(t => t.date >= input.today);
  const behind = all.filter(t => t.date < input.today).reverse();
  const pick = narrowToRows([...ahead, ...behind].map(asRecord), input.rows, DATED_MAX);
  const set = pick.records.map(r => r.raw as unknown as CalThing).sort(byWhen);
  // All in the past is a Logbook; the Today line needs something still ahead.
  if (!set.some(t => t.date >= input.today)) return null;

  const items: DatedShape["items"] = set.map(t => ({
    date: t.date,
    time: t.time,
    kind: t.kind,
    late: t.kind === "task" && t.status === "open" && t.date < input.today,
    done: t.kind === "task" ? t.status === "done" : t.date < input.today,
  }));
  const shape: DatedShape = { type: "dated", today: input.today, items, truncated: pick.truncated };
  const rows: AnswerRow[] = set.map(t => {
    const label = t.kind === "task" ? "Task" : (t.category && input.typeLabels.get(t.category)) || "Event";
    const who = t.kind === "task" && t.assignees ? ` · ${t.assignees}` : t.time ? ` · ${t.time}` : "";
    return {
      kind: t.kind,
      title: t.title,
      subtitle: `${label}${who}`,
      value: fmtDay(t.date),
      ref: { type: t.kind, id: t.id },
    };
  });
  return { shape, rows };
}

async function typeLabels(scoped: Scoped): Promise<Map<string, string>> {
  const types = await scoped.calendarEventType.findMany({ select: { slug: true, label: true } });
  return new Map(types.map(t => [t.slug, t.label]));
}

export async function buildDated(_req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  const due = evidence.get("list_deadlines");
  const cal = evidence.get("list_calendar_events");
  const digest = evidence.get("weekly_digest");
  if (!due && !cal && !digest) return null;
  // Every calendar read this turn goes on the one rail: tasks and events
  // together is the point of the form.
  const things = [
    ...(due ? taskThings(due.result) : []),
    ...(cal ? eventThings(cal.result) : []),
    ...(digest ? [...taskThings(prop(digest.result, "deadlinesDue")), ...eventThings(prop(digest.result, "events"))] : []),
  ];
  if (things.length === 0) return null;
  return datedFromThings({ things, today: o.today, rows: o.rows, typeLabels: await typeLabels(scoped) });
}

// ────────────────────────────────────────────────────────────────────────────
// Logbook — calendar things that already happened, counted by month
// ────────────────────────────────────────────────────────────────────────────

interface LogSource {
  /** How to read records out of the payload. */
  read: (result: unknown, args: Record<string, unknown>) => SourceRecord[];
  /** Ref type for a row, when the record has a peek. */
  ref: "event" | "task" | null;
  noun: { one: string; many: string };
  subtitle: (r: SourceRecord) => string | null;
}

const LOG_SOURCES: Record<string, LogSource> = {
  list_calendar_events: {
    read: r => recordsOf(listItems(r), "title", "date"),
    ref: "event",
    noun: { one: "event", many: "events" },
    subtitle: r => (typeof r.raw.location === "string" && r.raw.location) || (typeof r.raw.time === "string" && r.raw.time) || null,
  },
  list_service_events: {
    read: r => recordsOf(listItems(r), "title", "date"),
    ref: null,
    noun: { one: "service event", many: "service events" },
    subtitle: r => (typeof r.raw.location === "string" && r.raw.location) || null,
  },
  list_parties: {
    read: r => recordsOf(listItems(r), "name", "date"),
    ref: null,
    noun: { one: "party", many: "parties" },
    subtitle: r => (typeof r.raw.theme === "string" && r.raw.theme) || (typeof r.raw.partyType === "string" && r.raw.partyType) || null,
  },
  list_programming_events: {
    read: r => recordsOf(listItems(r), "title", "date"),
    ref: null,
    noun: { one: "program", many: "programs" },
    subtitle: r => (typeof r.raw.type === "string" && r.raw.type) || null,
  },
  list_fundraisers: {
    read: r => recordsOf(listItems(r), "name", "date"),
    ref: null,
    noun: { one: "fundraiser", many: "fundraisers" },
    subtitle: r => (typeof r.raw.place === "string" && r.raw.place) || null,
  },
  // Finished work is history too; open work is the Today line or Past due.
  list_deadlines: {
    read: (r, args) => (args.status === "done" ? recordsOf(listItems(r), "title", "dueDate") : []),
    ref: "task",
    noun: { one: "finished task", many: "finished tasks" },
    subtitle: r => (typeof r.raw.assignees === "string" && r.raw.assignees) || null,
  },
};

/** Pure: past records → the logbook, or null when any of them isn't in the past. */
export function logbookFromRecords(input: {
  records: SourceRecord[];
  source: Pick<LogSource, "ref" | "subtitle">;
  noun: LogbookShape["noun"];
  period: string;
  today: string;
  rows: AnswerRow[];
}): BuiltShape<LogbookShape> | null {
  if (input.records.length === 0) return null;
  if (input.records.some(r => !r.date || r.date >= input.today)) return null;
  // Newest first through the cap, so a long history keeps its recent end.
  const newestFirst = [...input.records].sort((a, b) => b.date!.localeCompare(a.date!));
  const pick = narrowToRows(newestFirst, input.rows, LOGBOOK_MAX);
  const set = [...pick.records].sort((a, b) => a.date!.localeCompare(b.date!));
  const shape: LogbookShape = {
    type: "logbook",
    today: input.today,
    noun: input.noun,
    period: input.period,
    items: set.map(r => ({ date: r.date! })),
    truncated: pick.truncated,
  };
  const rows: AnswerRow[] = set.map(r => {
    const sub = input.source.subtitle(r);
    return {
      kind: input.source.ref === "task" ? "task" : "event",
      title: r.title,
      ...(sub ? { subtitle: sub } : {}),
      value: fmtDay(r.date!),
      ...(input.source.ref ? { ref: { type: input.source.ref, id: r.id } } : { ask: `Tell me about ${r.title} on ${fmtDay(r.date!)}` }),
    };
  });
  return { shape, rows };
}

/** The window the model's read covered, in the org's own words where a semester matches it. */
export async function periodLabel(scoped: Scoped, args: Record<string, unknown>): Promise<string> {
  const start = validDate(args.start) ? args.start : undefined;
  const end = validDate(args.end) ? args.end : undefined;
  if (!start && !end) return "All time";
  if (start) {
    const sems = await scoped.semester.findMany({ select: { label: true, startDate: true, endDate: true } });
    const hit = sems.find(s => s.startDate <= start && start <= s.endDate && (!end || end <= s.endDate));
    if (hit) return hit.label;
  }
  if (start && end) return `${fmtDay(start)} – ${fmtDay(end)}`;
  return start ? `since ${fmtDay(start)}` : `through ${fmtDay(end!)}`;
}

export async function buildLogbook(_req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  const read = evidence.latest(Object.keys(LOG_SOURCES));
  if (!read) return null;
  const src = LOG_SOURCES[read.tool];
  const records = src.read(read.result, read.args);
  // The noun comes from the read's own type filter, in the org's label.
  let noun = src.noun;
  if (read.tool === "list_calendar_events" && typeof read.args.category === "string") {
    const label = (await typeLabels(scoped)).get(read.args.category);
    if (label) noun = { one: `${label.toLowerCase()} event`, many: `${label.toLowerCase()} events` };
  }
  return logbookFromRecords({ records, source: src, noun, period: await periodLabel(scoped, read.args), today: o.today, rows: o.rows });
}

// ────────────────────────────────────────────────────────────────────────────
// Past due — open work whose date has passed, and who has it
// ────────────────────────────────────────────────────────────────────────────

export interface TaskOwnerRow {
  id: number;
  everyone: string | null;
  assignments: Array<{ brother: { name: string } | null; role: { name: string } | null; brotherId?: number | null }>;
}

/** Who has a task: a member, a role (not "no owner"), everyone, or nobody. */
export function ownerOf(t: TaskOwnerRow, memberName?: (a: TaskOwnerRow["assignments"][number]) => string | null): PastDueOwner {
  if (t.everyone === "each" || t.everyone === "any") return { kind: "everyone", label: "Everyone" };
  const people = t.assignments.map(a => (memberName?.(a) ?? a.brother?.name) || null).filter((n): n is string => !!n);
  if (people.length) return { kind: "member", label: people.length > 1 ? `${people[0]} +${people.length - 1}` : people[0] };
  const role = t.assignments.find(a => a.role)?.role?.name;
  if (role) return { kind: "role", label: role };
  return { kind: "none", label: "No owner" };
}

/** Pure: open late tasks → past due, or null when any isn't open and late. */
export function pastDueFromTasks(input: {
  tasks: Array<SourceRecord & { status: string | null; owner: PastDueOwner }>;
  today: string;
  rows: AnswerRow[];
}): BuiltShape<PastDueShape> | null {
  if (input.tasks.length === 0) return null;
  if (input.tasks.some(t => t.status !== "open" || !t.date || t.date >= input.today)) return null;
  const oldestFirst = [...input.tasks].sort((a, b) => a.date!.localeCompare(b.date!));
  const pick = narrowToRows(oldestFirst, input.rows, PASTDUE_MAX);
  const byId = new Map(input.tasks.map(t => [t.id, t]));
  const set = pick.records.map(r => byId.get(r.id)!).sort((a, b) => a.date!.localeCompare(b.date!));
  const shape: PastDueShape = {
    type: "pastdue",
    today: input.today,
    items: set.map(t => ({ date: t.date!, owner: t.owner })),
    truncated: pick.truncated,
  };
  const rows: AnswerRow[] = set.map(t => ({
    kind: "task",
    title: t.title,
    subtitle: `${t.owner.label} · was due ${fmtDay(t.date!)}`,
    value: "Overdue",
    ref: { type: "task", id: t.id },
  }));
  return { shape, rows };
}

export async function buildPastDue(_req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  const due = evidence.get("list_deadlines");
  if (!due) return null;
  const records = recordsOf(listItems(due.result), "title", "dueDate");
  if (records.length === 0) return null;
  // list_deadlines flattens assignees to a label; the owner's KIND (a role is
  // owned, not "no owner") needs the assignment rows, for these ids only.
  const owners = await scoped.task.findMany({
    where: { id: { in: records.map(r => r.id) } },
    select: {
      id: true, everyone: true,
      assignments: { select: { brother: { select: { name: true } }, role: { select: { name: true } } } },
    },
  });
  const ownerById = new Map(owners.map(t => [t.id, ownerOf(t as TaskOwnerRow)]));
  return pastDueFromTasks({
    tasks: records.map(r => ({ ...r, status: typeof r.raw.status === "string" ? r.raw.status : null, owner: ownerById.get(r.id) ?? { kind: "none", label: "No owner" } })),
    today: o.today,
    rows: o.rows,
  });
}
