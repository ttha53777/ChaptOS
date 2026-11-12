// The answer system's pure pieces (docs/ask-chapt-answer-system-plan.md):
// Figure, Steps, Decline, Reasons, Quote, note refs, and the request parser.
// No database — every builder's arithmetic lives in an exported pure function.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { balanceFigure, membersFigure, FIGURE_MIN_POINTS } from "@/lib/ai-shapes-figure";
import { declineShape, stepsFromPlaybook, HOWTO_PLAYBOOKS } from "@/lib/ai-howto";
import { caseFile, pathBack, reasonRows } from "@/lib/ai-shapes-reasons";
import { isVerbatim, quoteFrom } from "@/lib/ai-shapes-quote";
import { createRefIndex, noteRefs } from "@/lib/ai-refs";
import { parseShapeRequest } from "@/lib/ai-shape-request";
import { checkVerdict } from "@/lib/ai-shapes-judge";
import { DEFAULT_THRESHOLDS } from "@/lib/thresholds";
import type { ToolAccess } from "@/lib/ai-tools";
import type { ReasonsShape } from "@/lib/api-types";

const admin: ToolAccess = { actorId: 1, permissions: 0, isOrgAdmin: true, isPlatformAdmin: false };
const member: ToolAccess = { actorId: 2, permissions: 0, isOrgAdmin: false, isPlatformAdmin: false };

describe("figure: balance", () => {
  const read = { balance: 4210.5, breakdown: { openingBalance: 1200, doorRevenue: 0, income: 6830, expense: 3819.5 } };
  const moves = [
    { date: "2026-09-01", amount: 2000 }, { date: "2026-09-15", amount: -800 },
    { date: "2026-10-01", amount: 3000 }, { date: "2026-10-20", amount: -2019.5 },
    { date: "2026-11-02", amount: 1830 }, { date: "2026-11-05", amount: -1000 },
  ];

  it("terms add up to the figure", () => {
    const b = balanceFigure({ read, moves, today: "2026-11-12", windowStart: "2026-08-24", termLabel: "Fall 26" });
    const sum = b.shape.terms!.reduce((s, t) => s + (t.op === "+" ? t.amount : -t.amount), 0);
    expect(sum).toBeCloseTo(4210.5, 2);
    expect(b.shape.terms!.map(t => t.label)).toEqual(["Opening", "Income", "Expenses"]);
    expect(b.rows).toEqual([]);
  });

  it("drops terms that wouldn't add up rather than draw them wrong", () => {
    const b = balanceFigure({ read: { ...read, balance: 9999 }, moves, today: "2026-11-12", windowStart: null, termLabel: null });
    expect(b.shape.terms).toBeNull();
  });

  it("draws the line only when it lands on the figure, with the month's change", () => {
    const b = balanceFigure({ read, moves, today: "2026-11-12", windowStart: "2026-08-24", termLabel: "Fall 26" });
    expect(b.shape.series!.at(-1)!.value).toBeCloseTo(4210.5, 2);
    expect(b.shape.delta).toEqual({ by: 830, since: "2026-11-01" });
  });

  it("no sparkline under the minimum number of points", () => {
    const b = balanceFigure({ read: { ...read, balance: 2400 }, moves: moves.slice(0, 2), today: "2026-11-12", windowStart: null, termLabel: null });
    expect(moves.slice(0, 2).length).toBeLessThan(FIGURE_MIN_POINTS);
    expect(b.shape.series).toBeNull();
  });
});

describe("figure: members", () => {
  it("splits by joined date and the parts sum", () => {
    const joined = [...Array(46).fill("2025-02-01T00:00:00.000Z"), ...Array(6).fill("2026-09-10T00:00:00.000Z")];
    const f = membersFigure({ joined, termStart: "2026-08-24", termLabel: "Fall 26", today: "2026-11-12" })!;
    expect(f.shape.value).toBe(52);
    expect(f.shape.split!.reduce((s, p) => s + p.count, 0)).toBe(52);
    expect(f.shape.split![1]).toEqual({ label: "Joined this term", count: 6 });
  });
  it("no split when nobody joined this term", () => {
    const f = membersFigure({ joined: ["2025-02-01T00:00:00.000Z"], termStart: "2026-08-24", termLabel: "Fall 26", today: "2026-11-12" })!;
    expect(f.shape.split).toBeNull();
  });
});

describe("steps", () => {
  it("draws the playbook's own labels and fills only its fields", () => {
    const s = stepsFromPlaybook("custom_metric", { Name: "Study hours", Bogus: "x" }, admin)!;
    expect(s.shape.crumbs).toEqual(["Settings", "Custom metrics", "Add metric"]);
    const fields = s.shape.steps.flatMap(st => st.fields ?? []);
    expect(fields.find(f => f.label === "Name")?.example).toBe("Study hours");
    expect(fields.some(f => f.label === "Bogus")).toBe(false);
    expect(s.shape.perm).toEqual({ label: "Manage settings", ok: true });
  });
  it("says when the asker lacks the permission", () => {
    expect(stepsFromPlaybook("log_money", undefined, member)!.shape.perm).toEqual({ label: "Manage treasury", ok: false });
  });
  it("an unknown playbook draws nothing", () => {
    expect(stepsFromPlaybook("make_coffee", undefined, admin)).toBeNull();
  });
  it("every playbook links to a screen relative to the org", () => {
    for (const pb of Object.values(HOWTO_PLAYBOOKS)) expect(pb.screen.path === "" || pb.screen.path.startsWith("/")).toBe(true);
  });
});

describe("decline", () => {
  it("is fixed copy with the org's name", () => {
    expect(declineShape("Sigma").shape.scope).toBe("I only read Sigma's records in ChaptOS: events, money, people, minutes and docs.");
    expect(declineShape(null).shape.scope).toContain("your chapter's");
  });
});

describe("reasons: the way back", () => {
  it("5 of 8, five left, 75% bar: a clean run clears it, missing one doesn't", () => {
    expect(pathBack(5, 8, 5, 75)).toEqual({
      left: 5,
      outcomes: [
        { attend: 5, attended: 10, counted: 13, pct: 77, clears: true },
        { attend: 4, attended: 9, counted: 13, pct: 69, clears: false },
      ],
    });
  });
  it("nothing left → null", () => expect(pathBack(5, 8, 0, 75)).toBeNull());
  it("can be out of reach", () => expect(pathBack(1, 10, 2, 75)!.outcomes.every(o => !o.clears)).toBe(true));
});

describe("reasons: the case file", () => {
  const meetings = ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"]
    .map((date, i) => ({ id: i + 1, date }));
  const records = [
    ...[1, 2, 3, 5, 6].map(id => ({ calendarEventId: id, attended: true })),
    ...[7, 8, 9].map(id => ({ calendarEventId: id, attended: false })),
    { calendarEventId: 4, attended: false }, // excused, so it must not count
  ];
  const excuses = [{ calendarEventId: 4, status: "approved", reason: "travel" }];
  const base = {
    member: { id: 9, name: "Cole Brennan", role: "Member", joinedAt: "2025-01-15T00:00:00.000Z", duesOwed: 0, serviceHours: 14, gpa: 3.4 },
    thresholds: { ...DEFAULT_THRESHOLDS, attendanceAtRisk: 75, attendanceWatch: 85, serviceHoursGoal: 10, gpaWatch: 3 },
    meetings, records, excuses, mandatory: new Set(meetings.map(m => m.id)), today: "2026-11-12",
  };

  it("counts exactly like the roster %: 5 of 8, excused left out", () => {
    const f = caseFile({ ...base, seeReasons: true });
    expect(f.gauge).toEqual({ value: 63, attended: 5, counted: 8, atRisk: 75, watch: 85 });
  });

  it("lays out the strip and what was left out", () => {
    const f = caseFile({ ...base, seeReasons: true });
    const states = f.strip.map(s => s.state);
    expect(states.slice(0, 10)).toEqual(["there", "there", "there", "excused", "there", "there", "missed", "missed", "missed", "unrecorded"]);
    expect(states.slice(10)).toEqual(["ahead", "ahead", "ahead", "ahead"]);
    expect(f.excluded).toEqual([
      { eventId: 4, date: "2026-09-29", why: "excused", reason: "travel" },
      { eventId: 10, date: "2026-11-10", why: "unrecorded" },
    ]);
    // Four still ahead, plus the recent unrecorded one that may yet be marked.
    expect(f.pathBack!.left).toBe(5);
  });

  it("hides the excuse reason from someone who can't read it", () => {
    const f = caseFile({ ...base, seeReasons: false });
    expect(f.excluded[0]).toEqual({ eventId: 4, date: "2026-09-29", why: "excused" });
  });

  it("leaves an unentered GPA out instead of calling it low", () => {
    const f = caseFile({ ...base, member: { ...base.member, gpa: 0 }, seeReasons: false });
    expect(f.rest.map(r => r.label)).toEqual(["dues owed", "service"]);
  });

  it("keeps at most four reason cards and drops unknown panels", () => {
    const rows = reasonRows([
      { kind: "generic", title: "a", panel: "gauge" },
      { kind: "generic", title: "b", panel: "nope" as never },
      { kind: "generic", title: "c" }, { kind: "generic", title: "d" }, { kind: "generic", title: "e" },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[0].panel).toBe("gauge");
    expect("panel" in rows[1]).toBe(false);
  });

  it("a verdict percent that isn't the gauge is sent back", () => {
    const f = caseFile({ ...base, seeReasons: true });
    const shape: ReasonsShape = { type: "reasons", judgment: "attendance", ...f };
    expect(checkVerdict("Cole is at *63%*, under your 75% bar.", shape, []).ok).toBe(true);
    const bad = checkVerdict("Cole is at *62%*, under the bar.", shape, []);
    expect(bad.ok).toBe(false);
  });
});

describe("quote", () => {
  const minutes = "4. Formal budget\n\n**Motion** to set the Winter Formal budget at $3,000, venue deposit of $800 due by Nov 10. Seconded by Marcus.";
  const summary = { gist: "", decisions: ["Set the Winter Formal budget at $3,000"], actions: [{ id: "a1", text: "Pay the venue deposit", owner: "Priya", brotherId: null, due: "2026-11-10", done: false }] };
  const meeting = { id: 7, title: "Chapter meeting", date: "2026-10-20" };

  it("accepts a passage only if it is in the minutes word for word", () => {
    expect(isVerbatim("Motion to set the Winter Formal budget at $3,000", minutes)).toBe(true);
    expect(isVerbatim("Motion to set the formal budget at $3,500", minutes)).toBe(false);
    expect(isVerbatim("budget", minutes)).toBe(false);
  });

  it("falls back to the summarized decision and stamps it", () => {
    const q = quoteFrom({ meeting, minutes, summary, quote: "We agreed on $3,500", decision: 0 })!;
    expect(q.shape.text).toBe("Set the Winter Formal budget at $3,000");
    expect(q.shape.decided).toBe(true);
    expect(q.shape.items[0]).toMatchObject({ id: "a1", done: false });
    expect(q.rows[0].ref).toEqual({ type: "event", id: 7 });
  });

  it("nothing verbatim and no decision → no quote", () => {
    expect(quoteFrom({ meeting, minutes, summary, quote: "We agreed on $3,500" })).toBeNull();
  });
});

describe("note refs", () => {
  it("chips only labels that resolve to one record, longest first", () => {
    const idx = createRefIndex();
    idx.add("list_brothers", { brothers: [{ id: 1, name: "Cole Brennan" }, { id: 2, name: "Dev Arora" }] });
    idx.add("list_deadlines", [{ id: 5, title: "Pay venue deposit" }, { id: 6, title: "Pay venue deposit" }]);
    const refs = noteRefs("Cole Brennan and dev arora still owe; Pay venue deposit is open.", idx);
    expect(refs).toEqual([
      { text: "Cole Brennan", ref: { type: "member", id: 1 } },
      { text: "dev arora", ref: { type: "member", id: 2 } },
    ]);
  });
});

describe("request parsing behind the flag", () => {
  let prev: string | undefined;
  beforeEach(() => { prev = process.env.ASK_CHAPT_ANSWER_KIT; });
  afterEach(() => { if (prev === undefined) delete process.env.ASK_CHAPT_ANSWER_KIT; else process.env.ASK_CHAPT_ANSWER_KIT = prev; });

  it("drops kit shapes when the flag is off", () => {
    delete process.env.ASK_CHAPT_ANSWER_KIT;
    expect(parseShapeRequest({ type: "figure", metric: "balance" })).toBeUndefined();
  });
  it("parses them when it's on", () => {
    process.env.ASK_CHAPT_ANSWER_KIT = "1";
    expect(parseShapeRequest({ type: "figure", metric: "balance" })).toEqual({ type: "figure", figure: "balance" });
    expect(parseShapeRequest({ type: "steps", playbook: "custom_metric", examples: { Name: "Study hours", n: 4 } }))
      .toEqual({ type: "steps", playbook: "custom_metric", examples: { Name: "Study hours" } });
    expect(parseShapeRequest({ type: "quote", meeting: 7, decision: 0, quote: " Motion " })).toEqual({ type: "quote", meeting: 7, decision: 0, quote: "Motion" });
    expect(parseShapeRequest({ type: "reasons" })).toEqual({ type: "reasons", judgment: "attendance" });
  });
});
