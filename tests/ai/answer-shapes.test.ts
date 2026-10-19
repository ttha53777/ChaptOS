/**
 * Answer shapes (lib/ai-shapes): the model NAMES a picture in compose_answer and
 * the server draws it from org data. These pin the three promises that makes:
 *
 *   1. What the model sends is only a request — unknown types and malformed
 *      fields are dropped, never fatal, and nothing numeric is accepted.
 *   2. A shape is only drawn from data the model actually read this turn.
 *   3. Each shape brings rows derived from the same data, lined up with what it
 *      draws, so an older client (and keyboard selection) still works.
 *
 * Pure unit — the DB is faked where a builder reads.
 */

import { describe, it, expect } from "vitest";
import { parseComposeAnswer } from "@/lib/ai-tools";
import {
  attachPeople, breakdownFromAmounts, buildShape, createShapeEvidence, minutesOf,
  parseShapeRequest, peopleCards, tallyFromRoster, weekFromRows, TALLY_MAX_MARKS,
} from "@/lib/ai-shapes";
import { createRefIndex } from "@/lib/ai-refs";
import type { BreakdownShape, TallyShape, WeekShape } from "@/lib/api-types";

const member = (id: number, name: string, over: Partial<{ duesOwed: number; attendance: number; serviceHours: number; status: string; role: string }> = {}) => ({
  id, name, role: over.role ?? "Member", attendance: over.attendance ?? 90, duesOwed: over.duesOwed ?? 0,
  serviceHours: over.serviceHours ?? 4, status: over.status ?? "Good",
});

describe("parseShapeRequest", () => {
  it("accepts a known type with its own fields", () => {
    expect(parseShapeRequest({ type: "tally", metric: "owes_dues" })).toEqual({ type: "tally", metric: "owes_dues" });
    expect(parseShapeRequest({ type: "week", start: "2026-10-19" })).toEqual({ type: "week", start: "2026-10-19" });
  });

  it("drops unknown types and malformed fields rather than failing", () => {
    expect(parseShapeRequest({ type: "donut" })).toBeUndefined();
    expect(parseShapeRequest("tally")).toBeUndefined();
    expect(parseShapeRequest({ type: "tally", metric: "gpa" })).toEqual({ type: "tally" });
    expect(parseShapeRequest({ type: "week", start: "2026-02-31" })).toEqual({ type: "week" });
  });

  it("rides through compose_answer as a request, separate from the wire answer", () => {
    const parsed = parseComposeAnswer({ verdict: "*14 of 52* still owe.", rows: [], shape: { type: "tally", metric: "owes_dues", of: 99 } });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.shapeRequest).toEqual({ type: "tally", metric: "owes_dues" });
    expect(parsed).not.toHaveProperty("shape");
  });
});

describe("evidence gate", () => {
  // Any read would throw — proving the gate returns before touching the DB.
  const noDb = new Proxy({}, { get() { throw new Error("DB touched"); } }) as never;

  it("draws nothing from data the model didn't read this turn", async () => {
    const ev = createShapeEvidence();
    expect(await buildShape({ type: "tally", metric: "owes_dues" }, ev, noDb, 1)).toBeNull();
    expect(await buildShape({ type: "breakdown" }, ev, noDb, 1)).toBeNull();
    expect(await buildShape({ type: "week" }, ev, noDb, 1)).toBeNull();
  });

  it("ignores a tool call that errored", () => {
    const ev = createShapeEvidence();
    ev.add("list_brothers", {}, { error: "boom" });
    expect(ev.get("list_brothers")).toBeUndefined();
  });

  it("needs a metric, either named or inferable from the model's own read", async () => {
    const ev = createShapeEvidence();
    ev.add("list_brothers", { order_by: "gpa" }, { brothers: [] });
    expect(await buildShape({ type: "tally" }, ev, noDb, 1)).toBeNull();
  });
});

describe("tallyFromRoster", () => {
  const roster = [
    member(1, "Ava Rossi"),
    member(2, "Jake Morales", { duesOwed: 420 }),
    member(3, "Ben Carver", { duesOwed: 100 }),
    member(4, "Tyler Brooks", { duesOwed: 380 }),
    member(5, "Devin Shah", { duesOwed: 300 }),
    member(6, "Owen Park", { duesOwed: 260 }),
    member(7, "Cole Hart", { duesOwed: 60 }),
  ];

  it("counts the subset against everyone, hits first by amount, then the rest", () => {
    const built = tallyFromRoster("owes_dues", roster)!;
    const shape = built.shape as TallyShape;
    expect(shape.of).toBe(7);
    expect(shape.hit).toBe(6);
    expect(shape.marks!.map(m => m.id)).toEqual([2, 4, 5, 6, 3, 7, 1]);
    expect(shape.marks!.map(m => m.state)).toEqual(["top", "top", "top", "top", "hit", "hit", "rest"]);
  });

  it("labels the top marks from the smallest of them", () => {
    expect((tallyFromRoster("owes_dues", roster)!.shape as TallyShape).topLabel).toBe("$260+");
  });

  it("sets no top band when the subset is short enough to list whole", () => {
    const shape = tallyFromRoster("owes_dues", roster.slice(0, 3))!.shape as TallyShape;
    expect(shape.topLabel).toBeNull();
    expect(shape.marks!.every(m => m.state !== "top")).toBe(true);
  });

  it("derives peekable rows for the biggest few", () => {
    const { rows } = tallyFromRoster("owes_dues", roster)!;
    expect(rows.map(r => r.title)).toEqual(["Jake Morales", "Tyler Brooks", "Devin Shah", "Owen Park"]);
    expect(rows[0]).toMatchObject({ kind: "person", value: "$420", ref: { type: "member", id: 2 } });
  });

  it("stops drawing dots past the countable limit", () => {
    const big = Array.from({ length: TALLY_MAX_MARKS + 1 }, (_, i) => member(i + 1, `M ${i}`, { duesOwed: i % 2 ? 50 : 0 }));
    const shape = tallyFromRoster("owes_dues", big)!.shape as TallyShape;
    expect(shape.marks).toBeNull();
    expect(shape.of).toBe(TALLY_MAX_MARKS + 1);
  });

  it("ranks at-risk by attendance and shows it as the value", () => {
    const shape = tallyFromRoster("at_risk", [
      member(1, "A", { status: "At Risk", attendance: 61 }),
      member(2, "B", { status: "At Risk", attendance: 40 }),
      member(3, "C"),
    ])!.shape as TallyShape;
    expect(shape.marks!.map(m => [m.id, m.value])).toEqual([[2, "40%"], [1, "61%"], [3, null]]);
    expect(shape.topLabel).toBeNull();
  });
});

describe("breakdownFromAmounts", () => {
  const categories = [
    { slug: "social", label: "Socials", color: "#c2410c", colorDark: null },
    { slug: "philanthropy", label: "Philanthropy", color: "#15803d", colorDark: "#4ade80" },
  ];

  it("ranks parts, takes labels and colours from the org's categories, and lines rows up 1:1", () => {
    const built = breakdownFromAmounts({
      kind: "expense", period: "Spent · Fall 26", categories,
      amounts: [{ category: "philanthropy", amount: 890 }, { category: "social", amount: 1825 }, { category: "zero", amount: 0 }],
      budgets: new Map([["social", 1600], ["philanthropy", 1200]]),
    })!;
    const shape = built.shape as BreakdownShape;
    expect(shape.parts.map(p => p.label)).toEqual(["Socials", "Philanthropy"]);
    expect(shape.total).toBe(2715);
    expect(shape.parts[0]).toMatchObject({ color: "#c2410c", budget: 1600, share: 67.2 });
    expect(shape.parts[1].colorDark).toBe("#4ade80");
    expect(built.rows.map(r => r.title)).toEqual(["Socials", "Philanthropy"]);
    expect(built.rows[0]).toMatchObject({ subtitle: "$225 over budget", value: "$1,825", screen: "treasury" });
    expect(built.rows[1].subtitle).toBe("of $1,200 budget");
  });

  it("folds the tail past six into one Other line", () => {
    const amounts = Array.from({ length: 8 }, (_, i) => ({ category: `c${i}`, amount: 100 - i }));
    const shape = breakdownFromAmounts({ kind: "expense", period: "x", amounts, budgets: null, categories: [] })!.shape as BreakdownShape;
    expect(shape.parts).toHaveLength(6);
    expect(shape.parts[5]).toMatchObject({ slug: null, label: "Other (3)", amount: 93 + 94 + 95 });
    expect(shape.hasBudget).toBe(false);
  });

  it("draws nothing when nothing was spent", () => {
    expect(breakdownFromAmounts({ kind: "expense", period: "x", amounts: [{ category: "a", amount: 0 }], budgets: null, categories: [] })).toBeNull();
  });
});

describe("weekFromRows", () => {
  it("orders each day deadline-first then by clock time, and binds rows 1:1 to items", () => {
    const built = weekFromRows({
      start: "2026-10-19",
      events: [
        { id: 10, title: "Mixer", date: "2026-10-23", time: "9:00 PM", category: "party" },
        { id: 11, title: "Chapter meeting", date: "2026-10-19", time: "7:00 PM", category: "chapter" },
        { id: 12, title: "Exec", date: "2026-10-23", time: "8:30 AM", category: "chapter" },
      ],
      deadlines: [{ id: 5, title: "Dues close", dueDate: "2026-10-23" }],
      types: [{ slug: "chapter", label: "Chapter", color: "#2563eb", colorDark: null }],
    });
    const shape = built.shape as WeekShape;
    expect(shape.items.map(i => i.title)).toEqual(["Chapter meeting", "Dues close", "Exec", "Mixer"]);
    expect(shape.items[0].cat).toMatchObject({ label: "Chapter", color: "#2563eb" });
    expect(shape.items[3].cat).toMatchObject({ label: "party", color: null });
    expect(built.rows.map(r => r.ref)).toEqual(shape.items.map(i => i.ref));
    expect(built.rows[1]).toMatchObject({ kind: "task", value: "Fri" });
  });

  it("shows a task once even though the Timeline mirrors it as a deadline event", () => {
    const shape = weekFromRows({
      start: "2026-05-25",
      events: [
        { id: 20, title: "Spring Roster Update", date: "2026-05-25", time: null, category: "deadline" },
        { id: 21, title: "Officer forms", date: "2026-05-26", time: null, category: "deadline" },
      ],
      deadlines: [{ id: 7, title: "Spring roster update", dueDate: "2026-05-25" }],
      types: [],
    }).shape as WeekShape;
    expect(shape.items.map(i => [i.ref.type, i.title, i.kind])).toEqual([
      ["task", "Spring roster update", "deadline"],
      ["event", "Officer forms", "deadline"],
    ]);
  });

  it("reads free-text times, sorting what it can't read last", () => {
    expect(minutesOf("7:00 PM")).toBe(19 * 60);
    expect(minutesOf("12:30 am")).toBe(30);
    expect(minutesOf("19:15")).toBe(19 * 60 + 15);
    expect(minutesOf("after dinner")).toBeGreaterThan(minutesOf(null));
  });
});

describe("people cards", () => {
  it("flags only the facts that tell the candidates apart", () => {
    const cards = peopleCards([
      { id: 1, name: "Chris Lee", role: "Rush chair", attendance: 92, status: "Good" },
      { id: 2, name: "Chris Okafor", role: "", attendance: 92, status: "Watch" },
    ]);
    expect(cards[0].facts).toEqual([{ label: "Good standing", diff: true }, { label: "92% attendance", diff: false }]);
    expect(cards[1]).toMatchObject({ role: null, ref: { type: "member", id: 2 } });
  });

  it("attaches people only when every chip is a member seen this turn", async () => {
    const refs = createRefIndex();
    refs.add("get_brother", { candidates: [{ id: 1, name: "Chris Lee" }, { id: 2, name: "Chris Okafor" }] });
    const scoped = {
      member: { listRoster: async () => [
        { id: 1, name: "Chris Lee", role: "Rush chair", attendance: 92, duesOwed: 0, gpa: 3.4, serviceHours: 5 },
        { id: 2, name: "Chris Okafor", role: "Member", attendance: 70, duesOwed: 0, gpa: 3.1, serviceHours: 2 },
      ] },
      organizationConfig: { find: async () => null },
    } as never;
    const out = await attachPeople({
      questions: [
        { question: "Which one did you mean?", chips: ["Chris Lee", "Chris Okafor"] },
        { question: "About what?", chips: ["Dues", "Attendance"] },
      ],
    }, refs, scoped, 987654);
    expect(out.questions[0].people?.map(p => p.name)).toEqual(["Chris Lee", "Chris Okafor"]);
    expect(out.questions[1].people).toBeUndefined();
  });
});
