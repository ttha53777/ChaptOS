// The judgment forms (docs/ask-chapt-list-forms-plan.md §4.4, §4.13, §2.3):
// Yes or no (`yesno`) and Progress (`status`), plus the check that keeps a
// verdict from contradicting the picture under it.
//
// Yes or no is the strictest form: the word is computed, never written, and it
// is only drawn when EVERY record it covers can be judged. One record the test
// can't read (a GPA nobody entered, a meeting with no attendance taken) and
// there is no stamp — the plain rows go out instead. A stamp over a sample is
// the same lie, so a cut set never gets one either.

import type { db } from "@/lib/db";
import type { AnswerRow } from "@/lib/ai-tools";
import { orgStanding } from "@/lib/ai-tools";
import type { ShapeRequest } from "@/lib/ai-shape-request";
import { listItems, MODEL_ROW_CAP, narrowToRows, prop, recordsOf, resolveRows, type ShapeEvidence, type SourceRecord } from "@/lib/ai-shape-evidence";
import { ExcuseStatus } from "@/lib/state";
import { fmtUsd, money } from "@/lib/money";
import type { AnswerShape, StatusShape, YesNoShape, YesNoTest } from "@/lib/api-types";
import type { BuiltShape } from "@/lib/ai-shapes";
import { fmtDay, ownerOf, type TaskOwnerRow } from "@/lib/ai-shapes-calendar";

type Scoped = ReturnType<typeof db>;
interface Opts { rows: AnswerRow[]; today: string }

export const YESNO_MAX = 60;
export const STATUS_MAX = 60;

// ────────────────────────────────────────────────────────────────────────────
// Yes or no
// ────────────────────────────────────────────────────────────────────────────

/** One record the test ran on. `pass: null` = couldn't be judged. */
export interface Judged {
  kind: "person" | "task" | "event";
  ref: { type: "member" | "task" | "event"; id: number } | null;
  title: string;
  subtitle: string | null;
  pass: boolean | null;
  /** What the row says about it: "$380 owed", "Done", "6 days late". */
  value: string;
}

interface TestWords { verb: string; failWord: string; noun: string }
const WORDS: Record<YesNoTest, TestWords> = {
  dues_paid:   { verb: "have paid",          failWord: "hasn't paid",          noun: "Dues" },
  task_done:   { verb: "are done",           failWord: "isn't done",           noun: "Tasks" },
  attended:    { verb: "came",               failWord: "didn't come",          noun: "Attendance" },
  service_met: { verb: "have met the goal",  failWord: "hasn't met the goal",  noun: "Service hours" },
  gpa_met:     { verb: "are over the bar",   failWord: "is under the bar",     noun: "GPA" },
  voted:       { verb: "have voted",         failWord: "hasn't voted",         noun: "Votes" },
};

/** Pure: judged records → the stamp, or null when any record can't be judged. */
export function yesnoFromJudged(input: { test: YesNoTest; judged: Judged[]; scope: string }): BuiltShape<YesNoShape> | null {
  const { judged } = input;
  if (judged.length === 0 || judged.some(j => j.pass == null)) return null;
  const failing = judged.filter(j => !j.pass);
  const passing = judged.filter(j => j.pass);
  const holds = failing.length === 0;
  const w = WORDS[input.test];
  const n = judged.length;
  const headline = n === 1
    ? `${judged[0].title} ${holds ? w.verb.replace(/^(have|are)\b/, m => (m === "have" ? "has" : "is")) : w.failWord}`
    : holds ? `All ${n} ${w.verb}` : `${passing.length} of ${n} ${w.verb}`;
  const ordered = [...failing, ...passing];
  const shape: YesNoShape = {
    type: "yesno",
    test: input.test,
    holds,
    headline,
    kicker: `${w.noun} · ${input.scope}`,
    items: ordered.map(j => ({ pass: !!j.pass })),
  };
  const rows: AnswerRow[] = ordered.map(j => ({
    kind: j.kind,
    title: j.title,
    ...(j.subtitle ? { subtitle: j.subtitle } : {}),
    value: j.value,
    ...(j.ref ? { ref: j.ref } : {}),
  }));
  return { shape, rows };
}

const memberRecs = (r: unknown) => recordsOf(prop(r, "brothers") ?? listItems(r), "name", null);
const num = (raw: Record<string, unknown>, k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : 0);

/**
 * Which records the question covers. The model's rows narrow the set, with two
 * exceptions: a full row list may itself be a cut, so it gets no stamp; and a
 * list of nothing but failures is the classic "here are the exceptions" reply
 * to "has everyone…?", so when the read holds records that pass, the question
 * covered the whole read and that's what is judged.
 */
export function pickForStamp(all: SourceRecord[], rows: AnswerRow[], passes: (r: SourceRecord) => boolean | null): SourceRecord[] | null {
  if (rows.length >= MODEL_ROW_CAP && resolveRows(rows, all)) return null;
  const pick = narrowToRows(all, rows, YESNO_MAX);
  if (pick.truncated) return null;
  if (pick.subset && pick.records.every(r => passes(r) === false) && all.some(r => passes(r) === true)) {
    return all.length <= YESNO_MAX ? all : null;
  }
  return pick.records;
}

export async function buildYesNo(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, orgId: number, o: Opts): Promise<BuiltShape | null> {
  const test = req.test;
  if (!test) return null;
  const scopeOf = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

  if (test === "dues_paid" || test === "service_met" || test === "gpa_met") {
    const read = evidence.get("list_brothers");
    if (!read) return null;
    const all = memberRecs(read.result);
    const { thresholds, measured } = await orgStanding(scoped, orgId, all.map(r => ({ attendance: num(r.raw, "attendance"), gpa: num(r.raw, "gpa"), serviceHours: num(r.raw, "serviceHours"), duesOwed: num(r.raw, "duesOwed") })));
    const config = await scoped.organizationConfig.find();
    const setKeys = new Set(config?.thresholds && typeof config.thresholds === "object" ? Object.keys(config.thresholds as object) : []);
    let judge: (raw: Record<string, unknown>) => { pass: boolean | null; value: string };
    if (test === "dues_paid") {
      if (!measured.duesOwed) return null;
      judge = raw => { const owed = money(num(raw, "duesOwed")); return { pass: owed <= 0, value: owed > 0 ? `${fmtUsd(owed)} owed` : "Paid" }; };
    } else if (test === "service_met") {
      // No goal of the org's own, nothing to meet.
      if (!measured.serviceHours || !setKeys.has("serviceHoursGoal")) return null;
      judge = raw => { const h = money(num(raw, "serviceHours")); return { pass: h >= thresholds.serviceHoursGoal, value: `${h} of ${thresholds.serviceHoursGoal} hrs` }; };
    } else {
      if (!measured.gpa || !setKeys.has("gpaWatch")) return null;
      judge = raw => { const g = num(raw, "gpa"); return g > 0 ? { pass: g >= thresholds.gpaWatch, value: g.toFixed(2) } : { pass: null, value: "not recorded" }; };
    }
    const set = pickForStamp(all, o.rows, r => judge(r.raw).pass);
    if (!set) return null;
    return yesnoFromJudged({
      test,
      scope: scopeOf(set.length, "member"),
      judged: set.map(r => ({ kind: "person", ref: { type: "member", id: r.id }, title: r.title, subtitle: typeof r.raw.role === "string" && r.raw.role ? r.raw.role : null, ...judge(r.raw) })),
    });
  }

  if (test === "task_done") {
    const read = evidence.get("list_deadlines");
    if (!read) return null;
    const set = pickForStamp(recordsOf(listItems(read.result), "title", "dueDate"), o.rows, r => r.raw.status === "done");
    if (!set) return null;
    return yesnoFromJudged({
      test,
      scope: scopeOf(set.length, "task"),
      judged: set.map(r => {
        const done = r.raw.status === "done";
        const late = !done && !!r.date && r.date < o.today;
        const days = late ? Math.round((Date.parse(o.today) - Date.parse(r.date!)) / 86_400_000) : 0;
        return {
          kind: "task", ref: { type: "task", id: r.id }, title: r.title,
          subtitle: [typeof r.raw.assignees === "string" ? r.raw.assignees : null, r.date ? `due ${fmtDay(r.date)}` : null].filter(Boolean).join(" · ") || null,
          pass: done,
          value: done ? "Done" : late ? `${days} day${days === 1 ? "" : "s"} late` : "Open",
        };
      }),
    });
  }

  if (test === "attended") {
    const read = evidence.get("get_event_attendance");
    if (!read) return null;
    const r = read.result as { attended?: unknown; absent?: unknown; excused?: unknown };
    if (!Array.isArray(r.attended) || !Array.isArray(r.absent)) return null;
    const attended = (r.attended as unknown[]).filter((n): n is string => typeof n === "string");
    const absent = (r.absent as unknown[]).filter((n): n is string => typeof n === "string");
    const excused = Array.isArray(r.excused)
      ? (r.excused as Array<{ name?: unknown; status?: unknown }>).filter(e => e.status === ExcuseStatus.Approved && typeof e.name === "string").map(e => e.name as string)
      : [];
    // No attendance taken: nothing to judge.
    if (attended.length + absent.length === 0) return null;
    const roster = await scoped.member.listRoster();
    const ids = new Map<string, number | null>();
    for (const m of roster) ids.set(m.name, ids.has(m.name) ? null : m.id);
    const people = [
      ...attended.map(name => ({ name, pass: true, value: "Came" })),
      ...absent.map(name => ({ name, pass: false, value: "Missed" })),
      ...excused.map(name => ({ name, pass: false, value: "Excused" })),
    ];
    const recs: SourceRecord[] = people.map((p, i) => ({ id: ids.get(p.name) ?? -(i + 1), title: p.name, date: null, raw: p }));
    const set = pickForStamp(recs, o.rows, r => r.raw.pass as boolean);
    if (!set) return null;
    return yesnoFromJudged({
      test,
      scope: scopeOf(set.length, "member"),
      judged: set.map(rec => ({ kind: "person", ref: rec.id > 0 ? { type: "member", id: rec.id } : null, title: rec.title, subtitle: null, pass: rec.raw.pass as boolean, value: rec.raw.value as string })),
    });
  }

  // voted: only a manager's read names who hasn't voted, and only an everyone
  // poll says who could — so only then is every voter known.
  const read = evidence.get("list_polls");
  if (!read) return null;
  const polls = listItems(read.result).filter(p => Array.isArray(p.notVoted) && typeof p.eligible === "number");
  if (polls.length !== 1) return null;
  const poll = polls[0];
  const notVoted = new Set(recordsOf(poll.notVoted, "name", null).map(p => p.id));
  const roster = await scoped.member.listRoster({ where: { archivedAt: null } });
  if (roster.length !== poll.eligible) return null;
  const set = pickForStamp(roster.map(m => ({ id: m.id, title: m.name, date: null, raw: { role: m.role } })), o.rows, r => !notVoted.has(r.id));
  if (!set) return null;
  return yesnoFromJudged({
    test,
    scope: typeof poll.question === "string" ? poll.question.slice(0, 40) : scopeOf(set.length, "member"),
    judged: set.map(rec => ({ kind: "person", ref: { type: "member", id: rec.id }, title: rec.title, subtitle: (rec.raw.role as string) || null, pass: !notVoted.has(rec.id), value: notVoted.has(rec.id) ? "Hasn't voted" : "Voted" })),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Progress
// ────────────────────────────────────────────────────────────────────────────

export interface StatusTask extends SourceRecord {
  status: string | null;
  owner: { kind: string; label: string };
}

/** Pure: tasks → progress, or null with fewer than two different states. */
export function statusFromTasks(input: { tasks: StatusTask[]; today: string; kicker: string; focus: "open" | "done"; rows: AnswerRow[] }): BuiltShape<StatusShape> | null {
  if (input.tasks.length < 2) return null;
  const pick = narrowToRows(input.tasks, input.rows, STATUS_MAX);
  if (pick.truncated) return null;
  const byKey = new Map(input.tasks.map(t => [t.id, t]));
  const set = pick.records.map(r => byKey.get(r.id)!);
  const judged = set.map(t => {
    const open = t.status !== "done";
    const late = open && !!t.date && t.date < input.today;
    const unowned = open && t.owner.kind === "none";
    const state: StatusShape["items"][number]["state"] = !open ? "done" : late || unowned ? "stuck" : "open";
    return { t, state, why: late ? "late" as const : unowned ? "unowned" as const : null };
  });
  if (new Set(judged.map(j => j.state)).size < 2) return null;
  // Stuck first, then in motion, then done; date order within each.
  const rank = { stuck: 0, open: 1, done: 2 };
  judged.sort((a, b) => rank[a.state] - rank[b.state] || (a.t.date ?? "9").localeCompare(b.t.date ?? "9"));
  const shape: StatusShape = {
    type: "status",
    kicker: `${input.kicker} · ${set.length} tasks`,
    today: input.today,
    focus: input.focus,
    items: judged.map(j => ({ state: j.state, why: j.why, date: j.t.date, owner: j.t.owner.kind === "none" ? null : j.t.owner.label })),
  };
  const rows: AnswerRow[] = judged.map(j => ({
    kind: "task",
    title: j.t.title,
    subtitle: [j.t.owner.label, j.t.date ? `due ${fmtDay(j.t.date)}` : null].filter(Boolean).join(" · "),
    value: j.state === "done" ? "Done" : j.why === "late" ? "Overdue" : j.why === "unowned" ? "No owner" : "Open",
    ref: { type: "task", id: j.t.id },
  }));
  return { shape, rows };
}

export async function buildStatus(req: ShapeRequest, evidence: ShapeEvidence, scoped: Scoped, _orgId: number, o: Opts): Promise<BuiltShape | null> {
  const read = evidence.get("list_deadlines");
  if (!read) return null;
  // Tasks have no project link, so a status board is only about something when
  // the read itself was narrowed; an unfiltered "all my tasks" stays a list.
  const start = typeof read.args.start === "string" ? read.args.start : undefined;
  const end = typeof read.args.end === "string" ? read.args.end : undefined;
  if (!start && !end) return null;
  const records = recordsOf(listItems(read.result), "title", "dueDate");
  if (records.length < 2) return null;
  const owners = await scoped.task.findMany({
    where: { id: { in: records.map(r => r.id) } },
    select: { id: true, everyone: true, assignments: { select: { brother: { select: { name: true } }, role: { select: { name: true } } } } },
  });
  const ownerById = new Map(owners.map(t => [t.id, ownerOf(t as TaskOwnerRow)]));
  const kicker = start && end ? `${fmtDay(start)} – ${fmtDay(end)}` : start ? `From ${fmtDay(start)}` : `Through ${fmtDay(end!)}`;
  return statusFromTasks({
    tasks: records.map(r => ({ ...r, status: typeof r.raw.status === "string" ? r.raw.status : null, owner: ownerById.get(r.id) ?? { kind: "none", label: "No owner" } })),
    today: o.today,
    kicker,
    focus: req.focus ?? "open",
    rows: o.rows,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Verdict consistency (§2.3)
//
// The model writes its verdict before the server builds the picture, so they
// can disagree where the disagreement is visible: a "Yes" over a NO stamp, or
// "Six" over a logbook of five. The route feeds the error back once; if the
// retry still disagrees, the verdict is replaced by the server's own sentence.
// ────────────────────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/** The yes/no a verdict leads with, or null when it doesn't lead with one. */
export function verdictWord(verdict: string): boolean | null {
  const first = verdict.replace(/\*/g, "").trim().toLowerCase().match(/^[a-z']+/)?.[0];
  if (!first) return null;
  if (["yes", "yep", "yeah", "all", "everyone", "everybody"].includes(first)) return true;
  if (["no", "nope", "not", "nobody", "none"].includes(first)) return false;
  return null;
}

/** The first count a verdict states, as digits or a word. */
export function verdictCount(verdict: string): number | null {
  const m = verdict.replace(/\*/g, "").toLowerCase().match(/\b(\d{1,4}|zero|none|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/);
  if (!m) return null;
  return NUMBER_WORDS[m[1]] ?? Number(m[1]);
}

export type VerdictCheck = { ok: true } | { ok: false; feedback: string; fallback: string };

/** Does the verdict agree with the picture it sits over? */
export function checkVerdict(verdict: string, shape: AnswerShape, rows: AnswerRow[]): VerdictCheck {
  if (shape.type === "yesno") {
    const said = verdictWord(verdict);
    if (said == null || said === shape.holds) return { ok: true };
    const failing = rows.filter((_, i) => !shape.items[i]?.pass).map(r => r.title);
    const word = shape.holds ? "Yes" : "No";
    return {
      ok: false,
      feedback: `compose_answer: your verdict says "${said ? "yes" : "no"}", but the records say ${word.toUpperCase()}: ${shape.headline}` +
        (failing.length ? ` (not: ${failing.slice(0, 8).join(", ")})` : "") + ". The answer is stamped from the records, so re-send with a verdict that agrees.",
      fallback: shape.holds ? `*Yes*, ${shape.headline.charAt(0).toLowerCase()}${shape.headline.slice(1)}.` : `*No*. ${shape.headline}.`,
    };
  }
  if (shape.type === "logbook" && !shape.truncated) {
    const n = shape.items.length;
    const said = verdictCount(verdict);
    if (said == null || said === n) return { ok: true };
    const noun = n === 1 ? shape.noun.one : shape.noun.many;
    return {
      ok: false,
      feedback: `compose_answer: your verdict says ${said}, but there are ${n} ${noun} (${shape.period}) and the count is drawn under it. Re-send with a verdict that says ${n}.`,
      fallback: `*${n}* ${noun}, ${shape.period === "All time" ? "all time" : shape.period}.`,
    };
  }
  if (shape.type === "zero") {
    const said = verdictCount(verdict);
    if (said == null || said === 0) return { ok: true };
    return {
      ok: false,
      feedback: `compose_answer: your verdict says ${said}, but nothing is filed as ${shape.filter} (${shape.period}); the answer shows that zero. Re-send with a verdict that says none, and name what they're filed as instead if it helps.`,
      fallback: `*None* filed as ${shape.filter}, ${shape.period === "All time" ? "ever" : shape.period}.`,
    };
  }
  if (shape.type === "reasons") {
    // The gauge is drawn under the sentence: a percent in the verdict that isn't
    // it (or the bar) is a contradiction on screen.
    const g = shape.gauge;
    const said = [...verdict.replace(/\*/g, "").matchAll(/(\d{1,3})\s*%/g)].map(m => Number(m[1]));
    const allowed = new Set([g.value, g.atRisk, ...(g.watch != null ? [g.watch] : [])]);
    if (said.every(n => allowed.has(n))) return { ok: true };
    const first = shape.subject.name.split(/\s+/)[0];
    return {
      ok: false,
      feedback: `compose_answer: your verdict says ${said.find(n => !allowed.has(n))}%, but ${shape.subject.name}'s attendance is ${g.value}% (${g.attended} of ${g.counted} counted) against a ${g.atRisk}% bar, and that gauge is drawn under it. Re-send with a verdict that uses ${g.value}%.`,
      fallback: `${first} is at *${g.value}% attendance*, ${g.value < g.atRisk ? "under" : "over"} your ${g.atRisk}% bar.`,
    };
  }
  return { ok: true };
}
