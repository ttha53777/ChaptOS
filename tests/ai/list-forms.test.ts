/**
 * List forms (docs/ask-chapt-list-forms-plan.md): the shapes that replace the
 * plain row list. Each pins the same promises the older shapes do — built only
 * from records read this turn, null (plain rows) the moment one record doesn't
 * qualify, rows lined up 1:1 with what's drawn — plus each form's own rules.
 *
 * Pure unit; the DB is faked where a builder reads.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createShapeEvidence, narrowToRows, resolveRows, selectFromEvidence, recordsOf } from "@/lib/ai-shape-evidence";
import { datedFromThings, logbookFromRecords, ownerOf, pastDueFromTasks, buildPastDue, type CalThing } from "@/lib/ai-shapes-calendar";
import { parseShapeRequest } from "@/lib/ai-shape-request";
import { parseComposeAnswer } from "@/lib/ai-tools";
import type { DatedShape, LogbookShape, PastDueShape } from "@/lib/api-types";

const TODAY = "2026-11-10";
let prevFlag: string | undefined;
beforeAll(() => { prevFlag = process.env.ASK_CHAPT_FORMS; process.env.ASK_CHAPT_FORMS = "1"; });
afterAll(() => { if (prevFlag === undefined) delete process.env.ASK_CHAPT_FORMS; else process.env.ASK_CHAPT_FORMS = prevFlag; });

describe("request parsing behind the flag", () => {
  it("accepts list forms only while ASK_CHAPT_FORMS is on", () => {
    expect(parseShapeRequest({ type: "dated" })).toEqual({ type: "dated" });
    process.env.ASK_CHAPT_FORMS = "0";
    expect(parseShapeRequest({ type: "dated" })).toBeUndefined();
    expect(parseShapeRequest({ type: "tally" })).toEqual({ type: "tally" });
    process.env.ASK_CHAPT_FORMS = "1";
  });

  it("keeps a row's date only when it's a real calendar date", () => {
    const parsed = parseComposeAnswer({ verdict: "x", rows: [
      { kind: "event", title: "Chapter Meeting", date: "2026-10-04" },
      { kind: "event", title: "Chapter Meeting", date: "2026-02-31" },
    ] });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.rows.map(r => r.date)).toEqual(["2026-10-04", undefined]);
  });
});

describe("selection", () => {
  const meetings = recordsOf([
    { id: 1, title: "Chapter Meeting", date: "2026-10-04" },
    { id: 2, title: "Chapter Meeting", date: "2026-10-11" },
    { id: 3, title: "Formal", date: "2026-10-18" },
  ], "title", "date");

  it("resolves recurring titles by the row's date, and refuses to guess without one", () => {
    expect(resolveRows([{ title: "Chapter Meeting", date: "2026-10-11" }], meetings)?.map(r => r.id)).toEqual([2]);
    expect(resolveRows([{ title: "Chapter Meeting" }], meetings)).toBeNull();
    expect(resolveRows([{ title: "formal" }], meetings)?.map(r => r.id)).toEqual([3]);
  });

  it("uses the model's rows as a deliberate subset, else the whole source capped", () => {
    expect(narrowToRows(meetings, [{ title: "Formal" }], 10)).toMatchObject({ subset: true, truncated: null });
    expect(narrowToRows(meetings, [{ title: "Nope" }], 2)).toMatchObject({ subset: false, truncated: { of: 3 } });
    // Six rows is the model's own cap, so it may itself be a cut: take the source.
    const six = Array.from({ length: 6 }, () => ({ title: "Formal" }));
    expect(narrowToRows(meetings, six, 10).subset).toBe(false);
  });

  it("takes the most recent accepted read as the source", () => {
    const ev = createShapeEvidence();
    ev.add("list_service_events", {}, [{ id: 9, title: "Old", date: "2026-01-01" }]);
    ev.add("list_calendar_events", {}, [{ id: 1, title: "New", date: "2026-02-01" }]);
    ev.add("list_parties", {}, { error: "boom" });
    const sel = selectFromEvidence({
      evidence: ev,
      sources: { list_service_events: r => recordsOf(r, "title", "date"), list_calendar_events: r => recordsOf(r, "title", "date"), list_parties: r => recordsOf(r, "name", "date") },
      rows: [],
      cap: 10,
    });
    expect(sel?.tool).toBe("list_calendar_events");
  });

  it("takes the read the rows came from over a later, narrower one", () => {
    // "How many service events this term?" reads the calendar by type, then by a
    // title fragment. The second read holds one of the five the verdict counts.
    const five = ["Book Drive", "Honor & Ink", "Sign Making", "Pet Drive", "Service Activity"].map((title, i) => ({ id: i + 1, title, date: `2026-10-0${i + 1}` }));
    const ev = createShapeEvidence();
    ev.add("list_calendar_events", { category: "service" }, five);
    ev.add("list_calendar_events", { title: "service" }, [five[4]]);
    const sel = selectFromEvidence({
      evidence: ev,
      sources: { list_calendar_events: r => recordsOf(r, "title", "date") },
      rows: five.map(e => ({ title: e.title })),
      cap: 10,
    });
    expect(sel?.args).toEqual({ category: "service" });
    expect(sel?.records).toHaveLength(5);
  });
});

const thing = (over: Partial<CalThing> & Pick<CalThing, "id" | "title" | "date">): CalThing => ({
  kind: "task", time: null, status: "open", category: null, assignees: null, ...over,
});

describe("dated (Today line)", () => {
  const things: CalThing[] = [
    thing({ id: 1, title: "Pay the venue deposit", date: "2026-11-04", assignees: "Marcus" }),
    thing({ id: 2, title: "Habitat build day", date: "2026-11-07", kind: "event", status: null, category: "service" }),
    thing({ id: 3, title: "Send the invite list", date: TODAY }),
    thing({ id: 4, title: "Chapter Meeting", date: "2026-11-15", kind: "event", status: null, category: "chapter", time: "7:00 PM" }),
    thing({ id: 5, title: "Old report", date: "2026-11-01", status: "done" }),
  ];
  const labels = new Map([["service", "Service"], ["chapter", "Chapter"]]);

  it("puts tasks and events on one rail; only an open task is late, a past event is just done", () => {
    const built = datedFromThings({ things, today: TODAY, rows: [], typeLabels: labels })!;
    const shape = built.shape as DatedShape;
    expect(built.rows.map(r => r.title)).toEqual(["Old report", "Pay the venue deposit", "Habitat build day", "Send the invite list", "Chapter Meeting"]);
    expect(shape.items.map(i => [i.late, i.done])).toEqual([[false, true], [true, false], [false, true], [false, false], [false, false]]);
    expect(built.rows[2]).toMatchObject({ subtitle: "Service", ref: { type: "event", id: 2 } });
    expect(built.rows[1].ref).toEqual({ type: "task", id: 1 });
  });

  it("past the cap keeps everything ahead, then the most recent past", () => {
    const many = Array.from({ length: 30 }, (_, k) => thing({ id: 100 + k, title: `Past ${k}`, date: `2026-10-${String(k + 1).padStart(2, "0")}`, status: "done" }));
    const built = datedFromThings({ things: [...many, thing({ id: 1, title: "Ahead", date: "2026-11-20" })], today: TODAY, rows: [], typeLabels: labels })!;
    const shape = built.shape as DatedShape;
    expect(shape.truncated).toEqual({ of: 31 });
    expect(built.rows.at(-1)!.title).toBe("Ahead");
    expect(built.rows[0].title).toBe("Past 7"); // the 23 most recent of 30
  });

  it("is a Logbook's job when everything is in the past", () => {
    expect(datedFromThings({ things: things.filter(t => t.date < TODAY), today: TODAY, rows: [], typeLabels: labels })).toBeNull();
  });

  it("shows a dated task once, as the task, not also as its deadline event", () => {
    const built = datedFromThings({
      things: [thing({ id: 7, title: "Dues due", date: "2026-11-20" }), thing({ id: 70, title: "Dues due", date: "2026-11-20", kind: "event", status: null, category: "deadline" })],
      today: TODAY, rows: [], typeLabels: labels,
    })!;
    expect(built.rows.map(r => r.ref)).toEqual([{ type: "task", id: 7 }]);
  });
});

describe("logbook", () => {
  const recs = recordsOf([
    { id: 11, title: "Food bank shift", date: "2026-10-03", location: "Second Harvest" },
    { id: 12, title: "Highway cleanup", date: "2026-09-12" },
    { id: 13, title: "Habitat build day", date: "2026-11-07" },
  ], "title", "date");
  const src = { ref: "event" as const, subtitle: (r: { raw: Record<string, unknown> }) => (typeof r.raw.location === "string" ? r.raw.location : null) };

  it("draws past records oldest first, with refs when the source has a peek", () => {
    const built = logbookFromRecords({ records: recs, source: src, noun: { one: "service event", many: "service events" }, period: "Fall 2026", today: TODAY, rows: [] })!;
    const shape = built.shape as LogbookShape;
    expect(shape.items.map(i => i.date)).toEqual(["2026-09-12", "2026-10-03", "2026-11-07"]);
    expect(shape.truncated).toBeNull();
    expect(built.rows[1]).toMatchObject({ title: "Food bank shift", subtitle: "Second Harvest", ref: { type: "event", id: 11 } });
  });

  it("one record is still a logbook", () => {
    expect(logbookFromRecords({ records: recs.slice(0, 1), source: src, noun: { one: "a", many: "b" }, period: "x", today: TODAY, rows: [] })).not.toBeNull();
  });

  it("refuses when any record is today or later", () => {
    const future = [...recs, ...recordsOf([{ id: 14, title: "Blood drive", date: "2026-11-20" }], "title", "date")];
    expect(logbookFromRecords({ records: future, source: src, noun: { one: "a", many: "b" }, period: "x", today: TODAY, rows: [] })).toBeNull();
  });

  it("a source without peeks gives rows a follow-up instead of a ref", () => {
    const built = logbookFromRecords({ records: recs, source: { ref: null, subtitle: () => null }, noun: { one: "a", many: "b" }, period: "x", today: TODAY, rows: [] })!;
    expect(built.rows[0].ref).toBeUndefined();
    expect(built.rows[0].ask).toMatch(/Highway cleanup/);
  });
});

describe("pastdue", () => {
  it("names a role as the owner, not 'no owner'", () => {
    expect(ownerOf({ id: 1, everyone: null, assignments: [{ brother: null, role: { name: "Treasurer" } }] })).toEqual({ kind: "role", label: "Treasurer" });
    expect(ownerOf({ id: 1, everyone: "each", assignments: [] })).toEqual({ kind: "everyone", label: "Everyone" });
    expect(ownerOf({ id: 1, everyone: null, assignments: [] })).toEqual({ kind: "none", label: "No owner" });
    expect(ownerOf({ id: 1, everyone: null, assignments: [{ brother: { name: "Ava" }, role: null }, { brother: { name: "Leo" }, role: null }] }).label).toBe("Ava +1");
  });

  const task = (id: number, date: string, status = "open") => ({ kind: undefined, id, title: `T${id}`, date, raw: {}, status, owner: { kind: "none" as const, label: "No owner" } });

  it("draws only when every task is open and late, oldest first", () => {
    const built = pastDueFromTasks({ tasks: [task(1, "2026-11-08"), task(2, "2026-10-23")], today: TODAY, rows: [] })!;
    expect((built.shape as PastDueShape).items.map(i => i.date)).toEqual(["2026-10-23", "2026-11-08"]);
    expect(built.rows[0].ref).toEqual({ type: "task", id: 2 });
    expect(pastDueFromTasks({ tasks: [task(1, "2026-11-08"), task(2, "2026-11-12")], today: TODAY, rows: [] })).toBeNull();
    expect(pastDueFromTasks({ tasks: [task(1, "2026-11-08", "done")], today: TODAY, rows: [] })).toBeNull();
  });

  it("reads owners for the source's ids only", async () => {
    const ev = createShapeEvidence();
    ev.add("list_deadlines", { open_only: true }, [{ id: 5, title: "Insurance", dueDate: "2026-10-23", status: "open", assignees: "Treasurer" }]);
    let asked: unknown;
    const scoped = { task: { findMany: async (q: { where: unknown }) => { asked = q.where; return [{ id: 5, everyone: null, assignments: [{ brother: null, role: { name: "Treasurer" } }] }]; } } } as never;
    const built = await buildPastDue({ type: "pastdue" }, ev, scoped, 1, { rows: [], today: TODAY });
    expect(asked).toEqual({ id: { in: [5] } });
    expect((built!.shape as PastDueShape).items[0].owner).toEqual({ kind: "role", label: "Treasurer" });
  });
});

// ── People family ───────────────────────────────────────────────────────────
import { rankedFromMembers, rankedFromEvents, tableFromMembers, rollFromPeople, buildRanked, buildRoll, scaleOf, type MemberRow } from "@/lib/ai-shapes-people";
import { DEFAULT_THRESHOLDS } from "@/lib/thresholds";
import { ALL_TRACKED } from "@/lib/tracked-metrics";
import type { RankedShape, RollShape, TableShape } from "@/lib/api-types";

const m = (id: number, name: string, over: Partial<MemberRow> = {}): MemberRow => ({
  id, name, role: "Member", attendance: 80, gpa: 3.2, duesOwed: 0, serviceHours: 10, ...over,
});
const crew = [m(1, "Aiden", { serviceHours: 22 }), m(2, "Cole", { serviceHours: 0 }), m(3, "Maya", { serviceHours: 19 }), m(4, "Ian", { serviceHours: 4 })];
const setAll = new Set(["serviceHoursGoal", "gpaWatch", "attendanceWatch"]);

describe("ranked (Standings)", () => {
  it("ranks best first and draws the org's bar only when the org set it", () => {
    const built = rankedFromMembers({ metric: "service_hours", members: crew, thresholds: DEFAULT_THRESHOLDS, setKeys: setAll, measured: ALL_TRACKED, truncated: null, scope: "4 members" })!;
    const shape = built.shape as RankedShape;
    expect(built.rows.map(r => r.title)).toEqual(["Aiden", "Maya", "Ian", "Cole"]);
    expect(shape.items.map(i => i.num)).toEqual([22, 19, 4, 0]);
    expect(shape.bar).toEqual({ at: 10, label: "Your bar · 10 hrs" });
    expect(shape).toMatchObject({ min: 0, max: 22, order: "rank", better: "higher" });
    const unset = rankedFromMembers({ metric: "service_hours", members: crew, thresholds: DEFAULT_THRESHOLDS, setKeys: new Set(), measured: ALL_TRACKED, truncated: null, scope: "" })!;
    expect((unset.shape as RankedShape).bar).toBeNull();
  });

  it("dues are lower-is-better: the least owed ranks first", () => {
    const built = rankedFromMembers({ metric: "dues_owed", members: [m(1, "A", { duesOwed: 380 }), m(2, "B"), m(3, "C", { duesOwed: 40 })], thresholds: DEFAULT_THRESHOLDS, setKeys: setAll, measured: ALL_TRACKED, truncated: null, scope: "" })!;
    expect(built.rows.map(r => r.title)).toEqual(["B", "C", "A"]);
    expect((built.shape as RankedShape).better).toBe("lower");
  });

  it("an unmeasured metric can't be ranked, and a member's blank sorts last as not recorded", () => {
    expect(rankedFromMembers({ metric: "gpa", members: crew, thresholds: DEFAULT_THRESHOLDS, setKeys: setAll, measured: { ...ALL_TRACKED, gpa: false }, truncated: null, scope: "" })).toBeNull();
    const built = rankedFromMembers({ metric: "gpa", members: [m(1, "A", { gpa: 0 }), m(2, "B", { gpa: 3.9 }), m(3, "C", { gpa: 3.1 })], thresholds: DEFAULT_THRESHOLDS, setKeys: setAll, measured: ALL_TRACKED, truncated: null, scope: "" })!;
    expect((built.shape as RankedShape).items.map(i => i.num)).toEqual([3.9, 3.1, null]);
    expect(built.rows[2].value).toBe("not recorded");
  });

  it("GPA starts a whole point under the lowest; percentages always run 0–100", () => {
    expect(scaleOf("gpa", [3.1, 3.9])).toEqual({ min: 2, max: 4 });
    expect(scaleOf("pct", [40])).toEqual({ min: 0, max: 100 });
  });

  it("dated rows keep date order and carry their dates", () => {
    const built = rankedFromEvents({ events: [{ id: 2, title: "Chapter Meeting", date: "2026-10-11", rate: 72 }, { id: 1, title: "Chapter Meeting", date: "2026-10-04", rate: 88 }], bar: null, truncated: null, scope: "2 events" })!;
    const shape = built.shape as RankedShape;
    expect(shape.order).toBe("date");
    expect(shape.items).toEqual([{ num: 88, date: "2026-10-04" }, { num: 72, date: "2026-10-11" }]);
    expect(built.rows.map(r => r.ref?.id)).toEqual([1, 2]);
  });

  it("shows nothing list_brothers didn't already return to the caller", async () => {
    const ev = createShapeEvidence();
    const served = { summary: {}, brothers: crew.map(b => ({ ...b, status: "Good", isAdmin: false })) };
    ev.add("list_brothers", {}, served);
    const scoped = { organizationConfig: { find: async () => ({ thresholds: { serviceHoursGoal: 10 }, disabledFeatures: {} }) } } as never;
    const built = (await buildRanked({ type: "ranked", rank: "service_hours" }, ev, scoped, 424242, { rows: [], today: TODAY }))!;
    for (const r of built.rows) expect(Object.keys(r).every(k => ["kind", "title", "subtitle", "value", "ref"].includes(k))).toBe(true);
    const servedHours = new Set(served.brothers.map(b => b.serviceHours));
    for (const it of (built.shape as RankedShape).items) expect(servedHours.has(it.num!)).toBe(true);
  });
});

describe("table (Side by side)", () => {
  it("drops measures the org doesn't track and keeps source order", () => {
    const built = tableFromMembers({ metrics: ["gpa", "dues_owed", "attendance"], members: crew, thresholds: DEFAULT_THRESHOLDS, setKeys: setAll, tracked: { ...ALL_TRACKED, gpa: false }, measured: ALL_TRACKED, truncated: null, scope: "4" })!;
    const shape = built.shape as TableShape;
    expect(shape.cols.map(c => c.key)).toEqual(["dues_owed", "attendance"]);
    expect(built.rows.map(r => r.title)).toEqual(["Aiden", "Cole", "Maya", "Ian"]);
    expect(shape.cols[1].bar).toBe(80);
  });

  it("is a ranking's job with fewer than two usable columns", () => {
    expect(tableFromMembers({ metrics: ["gpa", "attendance"], members: crew, thresholds: DEFAULT_THRESHOLDS, setKeys: setAll, tracked: { ...ALL_TRACKED, gpa: false }, measured: ALL_TRACKED, truncated: null, scope: "" })).toBeNull();
  });
});

describe("roll (Roll call)", () => {
  it("splits by group with the flagged group first, any count from one", () => {
    const built = rollFromPeople({ groups: [{ label: "No excuse", flag: true }, { label: "Excused", flag: false }], people: [{ id: 3, name: "Zane", group: 1, note: null }, { id: 1, name: "Owen", group: 0, note: null }], rows: [] })!;
    expect(built.rows.map(r => r.title)).toEqual(["Owen", "Zane"]);
    expect((built.shape as RollShape).items.map(i => i.group)).toEqual([0, 1]);
    const one = rollFromPeople({ groups: [{ label: "Missed", flag: true }], people: [{ id: 1, name: "Owen", group: 0, note: null }], rows: [] });
    expect(one).not.toBeNull();
  });

  it("resolves absentees' names to roster ids, and never guesses a shared name", async () => {
    const ev = createShapeEvidence();
    ev.add("get_event_attendance", { id: 1 }, { event: { id: 1 }, absent: ["Owen Park", "Sam Lee"], excused: [{ name: "Ravi M", status: "approved" }], attended: [] });
    const scoped = { member: { listRoster: async () => [{ id: 7, name: "Owen Park" }, { id: 8, name: "Sam Lee" }, { id: 9, name: "Sam Lee" }, { id: 10, name: "Ravi M" }] } } as never;
    const built = (await buildRoll({ type: "roll", split: "excused" }, ev, scoped, 1, { rows: [], today: TODAY }))!;
    expect(built.rows.map(r => [r.title, r.ref?.id])).toEqual([["Owen Park", 7], ["Sam Lee", undefined], ["Ravi M", 10]]);
    expect((built.shape as RollShape).groups.map(g => g.label)).toEqual(["No excuse", "Excused"]);
  });

  it("draws the read the answer's people came from, not the last one", async () => {
    const ev = createShapeEvidence();
    ev.add("get_event_attendance", { id: 1 }, { event: { id: 1 }, absent: ["Owen Park", "Ravi M"], excused: [], attended: [] });
    ev.add("get_event_attendance", { id: 2 }, { event: { id: 2 }, absent: ["Sam Lee"], excused: [], attended: [] });
    const scoped = { member: { listRoster: async () => [{ id: 7, name: "Owen Park" }, { id: 8, name: "Sam Lee" }, { id: 10, name: "Ravi M" }] } } as never;
    const rows = [{ kind: "person", title: "Owen Park" }, { kind: "person", title: "Ravi M" }] as never;
    const built = (await buildRoll({ type: "roll" }, ev, scoped, 1, { rows, today: TODAY }))!;
    expect(built.rows.map(r => r.title)).toEqual(["Owen Park", "Ravi M"]);
  });
});

// ── Judgments ───────────────────────────────────────────────────────────────
import { yesnoFromJudged, statusFromTasks, checkVerdict, verdictWord, verdictCount, buildYesNo, type Judged } from "@/lib/ai-shapes-judge";
import type { YesNoShape, StatusShape } from "@/lib/api-types";

const j = (id: number, title: string, pass: boolean | null, value = pass ? "Paid" : "$380 owed"): Judged =>
  ({ kind: "person", ref: { type: "member", id }, title, subtitle: null, pass, value });

describe("yesno", () => {
  it("stamps NO when any fails, failures first; YES only when all pass", () => {
    const no = yesnoFromJudged({ test: "dues_paid", judged: [j(1, "Priya", true), j(2, "Tyler", false), j(3, "Ava", true)], scope: "3 members" })!;
    const shape = no.shape as YesNoShape;
    expect(shape.holds).toBe(false);
    expect(shape.headline).toBe("2 of 3 have paid");
    expect(no.rows.map(r => r.title)).toEqual(["Tyler", "Priya", "Ava"]);
    expect(shape.items.map(i => i.pass)).toEqual([false, true, true]);
    const yes = yesnoFromJudged({ test: "dues_paid", judged: [j(1, "Priya", true), j(3, "Ava", true)], scope: "2" })!;
    expect((yes.shape as YesNoShape)).toMatchObject({ holds: true, headline: "All 2 have paid" });
  });

  it("one record that can't be judged means no stamp at all", () => {
    expect(yesnoFromJudged({ test: "gpa_met", judged: [j(1, "A", true), j(2, "B", null)], scope: "" })).toBeNull();
  });

  it("a single record reads as a sentence about it", () => {
    const one = yesnoFromJudged({ test: "task_done", judged: [{ kind: "task", ref: { type: "task", id: 4 }, title: "The deposit", subtitle: null, pass: false, value: "6 days late" }], scope: "1 task" })!;
    expect((one.shape as YesNoShape).headline).toBe("The deposit isn't done");
  });

  it("won't stamp over the model's full row list — it may be a cut", async () => {
    const ev = createShapeEvidence();
    const people = Array.from({ length: 8 }, (_, k) => ({ id: k + 1, name: `P${k + 1}`, role: "Exec", attendance: 90, gpa: 3.5, duesOwed: k === 2 ? 40 : 0, serviceHours: 5 }));
    ev.add("list_brothers", {}, { summary: {}, brothers: people });
    const scoped = { organizationConfig: { find: async () => ({ thresholds: {}, disabledFeatures: {} }) } } as never;
    const six = people.slice(0, 6).map(p => ({ kind: "person" as const, title: p.name }));
    expect(await buildYesNo({ type: "yesno", test: "dues_paid" }, ev, scoped, 31337, { rows: six, today: TODAY })).toBeNull();
    const five = people.slice(0, 5).map(p => ({ kind: "person" as const, title: p.name }));
    const built = await buildYesNo({ type: "yesno", test: "dues_paid" }, ev, scoped, 31337, { rows: five, today: TODAY });
    expect((built!.shape as YesNoShape)).toMatchObject({ holds: false, headline: "4 of 5 have paid" });
  });

  it("service and GPA tests need the org's own threshold", async () => {
    const ev = createShapeEvidence();
    ev.add("list_brothers", {}, { summary: {}, brothers: [{ id: 1, name: "A", role: "", attendance: 90, gpa: 3.5, duesOwed: 0, serviceHours: 5 }, { id: 2, name: "B", role: "", attendance: 90, gpa: 3.5, duesOwed: 0, serviceHours: 12 }] });
    const scoped = { organizationConfig: { find: async () => ({ thresholds: {}, disabledFeatures: {} }) } } as never;
    expect(await buildYesNo({ type: "yesno", test: "service_met" }, ev, scoped, 31338, { rows: [], today: TODAY })).toBeNull();
  });
});

describe("verdict consistency", () => {
  const shapeNo = yesnoFromJudged({ test: "dues_paid", judged: [j(1, "Priya", true), j(2, "Tyler", false)], scope: "2 members" })!;

  it("reads the word a verdict leads with, and the first count it states", () => {
    expect(verdictWord("*Yes*, all six.")).toBe(true);
    expect(verdictWord("Not yet. Tyler owes $380.")).toBe(false);
    expect(verdictWord("Tyler still owes.")).toBeNull();
    expect(verdictCount("*Six* so far, four in October.")).toBe(6);
    expect(verdictCount("You've had 12 meetings")).toBe(12);
  });

  it("a Yes over a failing set is fed back with the computed result, then replaced", () => {
    const vc = checkVerdict("*Yes*, exec is all paid up.", shapeNo.shape, shapeNo.rows);
    expect(vc.ok).toBe(false);
    if (vc.ok) return;
    expect(vc.feedback).toMatch(/NO/);
    expect(vc.feedback).toMatch(/Tyler/);
    expect(vc.fallback).toBe("*No*. 1 of 2 have paid.");
    expect(checkVerdict("*Not yet*. Tyler owes $380.", shapeNo.shape, shapeNo.rows).ok).toBe(true);
  });

  it("a logbook verdict must state the drawn count", () => {
    const lb = logbookFromRecords({ records: recordsOf([{ id: 1, title: "A", date: "2026-10-01" }, { id: 2, title: "B", date: "2026-10-08" }], "title", "date"), source: { ref: "event", subtitle: () => null }, noun: { one: "service event", many: "service events" }, period: "Fall 2026", today: TODAY, rows: [] })!;
    expect(checkVerdict("*Three* so far.", lb.shape, lb.rows)).toMatchObject({ ok: false, fallback: "*2* service events, Fall 2026." });
    expect(checkVerdict("*Two* so far.", lb.shape, lb.rows).ok).toBe(true);
  });
});

describe("status (Progress)", () => {
  const t = (id: number, date: string, status: string, owner = { kind: "member", label: "Marcus" }) => ({ id, title: `T${id}`, date, raw: {}, status, owner });

  it("derives stuck (late or unowned), orders stuck → open → done", () => {
    const built = statusFromTasks({ tasks: [t(1, "2026-10-20", "done"), t(2, "2026-11-04", "open"), t(3, "2026-11-18", "open", { kind: "none", label: "No owner" }), t(4, "2026-11-20", "open"), t(5, "2026-11-12", "open", { kind: "role", label: "Treasurer" })], today: TODAY, kicker: "Nov", focus: "open", rows: [] })!;
    const shape = built.shape as StatusShape;
    expect(shape.items.map(i => [i.state, i.why])).toEqual([["stuck", "late"], ["stuck", "unowned"], ["open", null], ["open", null], ["done", null]]);
    expect(built.rows.map(r => r.title)).toEqual(["T2", "T3", "T5", "T4", "T1"]);
  });

  it("needs two different states", () => {
    expect(statusFromTasks({ tasks: [t(1, "2026-10-20", "done"), t(2, "2026-10-21", "done")], today: TODAY, kicker: "", focus: "open", rows: [] })).toBeNull();
  });
});

// ── Lookups ─────────────────────────────────────────────────────────────────
import { buildRecord, zeroFromCounts, buildZero } from "@/lib/ai-shapes-lookup";
import type { PeekCard, RecordShape, ZeroShape } from "@/lib/api-types";

describe("record", () => {
  const card = (id: number): PeekCard => ({ type: "event", id, title: "Chapter Meeting", subtitle: "Nov 15, 2026", facts: [], sections: [] });

  it("a lookup with a ref is its peek card, built by the peek service", async () => {
    const asked: Array<[string, number]> = [];
    const built = await buildRecord({ type: "record" }, createShapeEvidence(), {} as never, 1, {
      rows: [{ kind: "event", title: "Chapter Meeting", value: "Sun 7 PM", ref: { type: "event", id: 9 } }],
      today: TODAY,
      peek: async (type, id) => { asked.push([type, id]); return card(id); },
    });
    expect(asked).toEqual([["event", 9]]);
    expect((built!.shape as RecordShape).cards[0].id).toBe(9);
    expect(built!.rows[0].value).toBe("Sun 7 PM");
  });

  it("never for more than two, a row with no record, or when the peek is refused", async () => {
    const peek = async (_t: string, id: number) => card(id);
    const r = (id: number) => ({ kind: "event" as const, title: `E${id}`, ref: { type: "event" as const, id } });
    expect(await buildRecord({ type: "record" }, createShapeEvidence(), {} as never, 1, { rows: [r(1), r(2), r(3)], today: TODAY, peek })).toBeNull();
    expect(await buildRecord({ type: "record" }, createShapeEvidence(), {} as never, 1, { rows: [r(1), { kind: "event", title: "No ref" }], today: TODAY, peek })).toBeNull();
    expect(await buildRecord({ type: "record" }, createShapeEvidence(), {} as never, 1, { rows: [r(1)], today: TODAY, peek: async () => { throw new Error("403"); } })).toBeNull();
  });
});

describe("zero (Nothing yet)", () => {
  const types = [{ slug: "service", label: "Service" }, { slug: "chapter", label: "Chapter" }, { slug: "philanthropy", label: "Philanthropy" }];
  const window = [...Array(12).fill({ category: "chapter" }), ...Array(6).fill({ category: "philanthropy" })];

  it("names the org's word, the searched count, and what they're filed as instead", () => {
    const built = zeroFromCounts({ filterSlug: "service", types, window, period: "Fall 2026", scope: "since Aug 24", canCreate: true })!;
    const shape = built.shape as ZeroShape;
    expect(built.rows).toEqual([]);
    expect(shape).toMatchObject({ filter: "Service", slug: "service", searched: { count: 18, scope: "since Aug 24" }, canCreate: true });
    expect(shape.instead).toEqual([{ slug: "chapter", label: "Chapter", count: 12 }, { slug: "philanthropy", label: "Philanthropy", count: 6 }]);
  });

  it("accepts the label for the slug", () => {
    expect(zeroFromCounts({ filterSlug: "Service", types, window, period: "x", scope: "y", canCreate: false })?.shape).toMatchObject({ slug: "service" });
  });

  it("a word the org doesn't use is never a zero — the model asks back", () => {
    expect(zeroFromCounts({ filterSlug: "volunteering", types, window, period: "x", scope: "y", canCreate: false })).toBeNull();
  });

  it("isn't a zero when the window holds that type after all", () => {
    expect(zeroFromCounts({ filterSlug: "chapter", types, window, period: "x", scope: "y", canCreate: false })).toBeNull();
  });

  it("only for an empty, type-filtered calendar read; Plan one follows the proposal permission", async () => {
    const scoped = {
      calendarEventType: { findMany: async () => types },
      calendarEvent: { findMany: async () => window },
      semester: { findMany: async () => [{ label: "Fall 2026", startDate: "2026-08-24", endDate: "2026-12-20" }] },
    } as never;
    const ev = createShapeEvidence();
    ev.add("list_calendar_events", { category: "service", start: "2026-08-24" }, { count: 0, items: [], hint: "" });
    const member = { actorId: 1, permissions: 0, isOrgAdmin: false, isPlatformAdmin: false } as never;
    const built = await buildZero({ type: "zero" }, ev, scoped, 1, { rows: [], today: TODAY, access: member });
    expect((built!.shape as ZeroShape)).toMatchObject({ period: "Fall 2026", canCreate: false });
    const evFull = createShapeEvidence();
    evFull.add("list_calendar_events", { category: "service" }, [{ id: 1, title: "x", date: "2026-09-01" }]);
    expect(await buildZero({ type: "zero" }, evFull, scoped, 1, { rows: [], today: TODAY })).toBeNull();
    // An empty type read followed by a title search is still that type's zero…
    const evThen = createShapeEvidence();
    evThen.add("list_calendar_events", { category: "service", start: "2026-08-24" }, { count: 0, items: [], hint: "" });
    evThen.add("list_calendar_events", { title: "service" }, [{ id: 4, title: "Service planning", date: "2026-09-02" }]);
    expect(await buildZero({ type: "zero" }, evThen, scoped, 1, { rows: [], today: TODAY })).not.toBeNull();
    // …unless the answer lists what the search found.
    expect(await buildZero({ type: "zero" }, evThen, scoped, 1, { rows: [{ kind: "event", title: "Service planning" }] as never, today: TODAY })).toBeNull();
    // A wider read for context with rows only OUTSIDE the empty window keeps the zero…
    evThen.add("list_calendar_events", { category: "service" }, [{ id: 5, title: "Food bank", date: "2026-03-01" }]);
    expect(await buildZero({ type: "zero" }, evThen, scoped, 1, { rows: [], today: TODAY })).not.toBeNull();
    // …one with a row of that type inside the window overturns it.
    evThen.add("list_calendar_events", { category: "service" }, [{ id: 6, title: "Beach cleanup", date: "2026-09-10" }]);
    expect(await buildZero({ type: "zero" }, evThen, scoped, 1, { rows: [], today: TODAY })).toBeNull();
    // Parties: January empty, then the whole year for context (the eval's shape).
    const evParty = createShapeEvidence();
    evParty.add("list_parties", { start: "2026-01-01", end: "2026-01-31" }, { count: 0, items: [], hint: "" });
    evParty.add("list_parties", { start: "2026-01-01", end: "2026-12-31" }, [{ id: 7, name: "Kickback", date: "2026-05-22" }]);
    const withParty = {
      calendarEventType: { findMany: async () => [...types, { slug: "party", label: "Party" }] },
      calendarEvent: { findMany: async () => window },
      semester: { findMany: async () => [{ label: "Spring 2026", startDate: "2026-01-01", endDate: "2026-05-31" }] },
    } as never;
    expect(await buildZero({ type: "zero" }, evParty, withParty, 1, { rows: [], today: TODAY })).not.toBeNull();
  });

  it("a zero verdict that states a count is corrected", () => {
    const built = zeroFromCounts({ filterSlug: "service", types, window, period: "Fall 2026", scope: "", canCreate: false })!;
    expect(checkVerdict("*Six* service events.", built.shape, built.rows)).toMatchObject({ ok: false, fallback: "*None* filed as Service, Fall 2026." });
    expect(checkVerdict("*None* filed as Service this term.", built.shape, built.rows).ok).toBe(true);
  });
});

// ── Money ───────────────────────────────────────────────────────────────────
import { receiptFromLines, type Line } from "@/lib/ai-shapes-money";
import { createRefIndex } from "@/lib/ai-refs";
import type { ReceiptShape } from "@/lib/api-types";

describe("receipt (pure)", () => {
  const L = (id: number, type: "income" | "expense", cents: number, date: string, pending = false): Line =>
    ({ id, title: `L${id}`, date, raw: {}, cents, type, category: "formal", pending });

  it("leads with what the lines contain, and never sums a cut set", () => {
    const out = receiptFromLines({ lines: [L(1, "expense", 5000, "2026-10-01"), L(2, "expense", 2500, "2026-10-02")], kicker: "Formal", categoryLabels: new Map(), rows: [] })!;
    expect((out.shape as ReceiptShape)).toMatchObject({ headline: "out", totals: { out: 7500, in: 0, net: -7500 } });
    const many = Array.from({ length: 30 }, (_, k) => L(k + 1, "expense", 100, `2026-10-${String(k + 1).padStart(2, "0")}`));
    const cut = receiptFromLines({ lines: many, kicker: "x", categoryLabels: new Map(), rows: [] })!;
    expect((cut.shape as ReceiptShape)).toMatchObject({ totals: null, truncated: { of: 30 } });
    expect((cut.shape as ReceiptShape).items[0].date).toBe("2026-10-07"); // the newest 24, oldest first
  });

  it("a ledger line becomes a transaction ref for a money row", () => {
    const idx = createRefIndex();
    idx.add("list_transactions", [{ id: 41, description: "Venue hold", date: "2026-10-21" }]);
    expect(idx.lookup("Venue hold", "money")).toEqual({ type: "transaction", id: 41 });
  });
});

describe("yesno coverage", () => {
  it("rows that are all exceptions mean the question covered the whole read", async () => {
    const ev = createShapeEvidence();
    ev.add("list_brothers", {}, { summary: {}, brothers: [
      { id: 1, name: "Owes A", role: "", attendance: 90, gpa: 3, duesOwed: 50, serviceHours: 1 },
      { id: 2, name: "Owes B", role: "", attendance: 90, gpa: 3, duesOwed: 20, serviceHours: 1 },
      { id: 3, name: "Paid C", role: "", attendance: 90, gpa: 3, duesOwed: 0, serviceHours: 1 },
    ] });
    const scoped = { organizationConfig: { find: async () => ({ thresholds: {}, disabledFeatures: {} }) } } as never;
    const built = await buildYesNo({ type: "yesno", test: "dues_paid" }, ev, scoped, 31339, { rows: [{ kind: "person", title: "Owes A" }, { kind: "person", title: "Owes B" }], today: TODAY });
    expect((built!.shape as YesNoShape)).toMatchObject({ holds: false, headline: "1 of 3 have paid" });
  });
});

describe("found by the eval", () => {
  it("a record row with a recurring title resolves by its date among this turn's reads", async () => {
    const ev = createShapeEvidence();
    ev.add("list_calendar_events", { start: TODAY }, [{ id: 21, title: "Chapter Meeting", date: "2026-11-15" }, { id: 22, title: "Chapter Meeting", date: "2026-11-22" }]);
    const built = await buildRecord({ type: "record" }, ev, {} as never, 1, {
      rows: [{ kind: "event", title: "Chapter Meeting", date: "2026-11-15" }],
      today: TODAY,
      peek: async (type, id) => ({ type, id, title: "Chapter Meeting", facts: [], sections: [] }),
    });
    expect(built!.rows[0].ref).toEqual({ type: "event", id: 21 });
  });

  it("an empty list_parties read is a zero for the org's party type", async () => {
    const ev = createShapeEvidence();
    ev.add("list_parties", { start: "2026-01-01", end: "2026-01-31" }, { count: 0, items: [], hint: "" });
    const scoped = {
      calendarEventType: { findMany: async () => [{ slug: "party", label: "Party" }, { slug: "chapter", label: "Chapter" }] },
      calendarEvent: { findMany: async () => [{ category: "chapter" }, { category: "chapter" }] },
      semester: { findMany: async () => [] },
    } as never;
    const built = await buildZero({ type: "zero" }, ev, scoped, 1, { rows: [], today: TODAY });
    expect((built!.shape as ZeroShape)).toMatchObject({ filter: "Party", searched: { count: 2, scope: "Jan 1 – Jan 31" } });
  });
});
