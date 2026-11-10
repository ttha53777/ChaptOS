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
});
