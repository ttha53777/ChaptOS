/**
 * Answer-row entity refs (lib/ai-refs):
 *
 *   1. EXTRACTION — each tool's result shape yields the right {type, id} pairs,
 *      and the empty-list envelope yields none.
 *   2. MATCHING — a row's title resolves to the record the tools actually saw,
 *      case/punctuation-insensitively; the row's `kind` narrows which type it
 *      may resolve to.
 *   3. SAFETY — the invariant this whole design rests on: an id the model
 *      invented can't be attached, because only ids observed in this turn's
 *      (already org-scoped) tool results are in the index. Ambiguous labels
 *      resolve to nothing rather than to a guess.
 *
 * Pure unit — no DB, no OpenAI.
 */

import { describe, it, expect } from "vitest";
import { createRefIndex, attachRefs } from "@/lib/ai-refs";
import type { AnswerRow } from "@/lib/ai-tools";

function row(over: Partial<AnswerRow> = {}): AnswerRow {
  return { kind: "person", title: "Marcus Reed", ...over };
}

describe("extraction", () => {
  it("reads members out of list_brothers", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", {
      summary: { count: 2 },
      brothers: [{ id: 7, name: "Marcus Reed", duesOwed: 250 }, { id: 9, name: "Andre Whitfield" }],
    });
    expect(ix.lookup("Marcus Reed", "person")).toEqual({ type: "member", id: 7 });
    expect(ix.lookup("Andre Whitfield", "person")).toEqual({ type: "member", id: 9 });
  });

  it("reads a member out of get_brother's direct hit AND its candidates", () => {
    const direct = createRefIndex();
    direct.add("get_brother", { id: 4, name: "Bryan Lee", duesOwed: 0 });
    expect(direct.lookup("Bryan Lee", "person")).toEqual({ type: "member", id: 4 });

    const fuzzy = createRefIndex();
    fuzzy.add("get_brother", { matches: 2, candidates: [{ id: 4, name: "Bryan Lee" }, { id: 5, name: "Bryan Cole" }] });
    expect(fuzzy.lookup("Bryan Cole", "person")).toEqual({ type: "member", id: 5 });
  });

  it("reads events and tasks from their list tools", () => {
    const ix = createRefIndex();
    ix.add("list_calendar_events", [{ id: 30, title: "Chapter Meeting", date: "2026-07-14" }]);
    ix.add("list_deadlines", [{ id: 12, title: "Submit budget", dueDate: "2026-07-20" }]);
    expect(ix.lookup("Chapter Meeting", "event")).toEqual({ type: "event", id: 30 });
    expect(ix.lookup("Submit budget", "task")).toEqual({ type: "task", id: 12 });
  });

  it("reads both halves of weekly_digest", () => {
    const ix = createRefIndex();
    ix.add("weekly_digest", {
      events: [{ id: 30, title: "Chapter Meeting" }],
      deadlinesDue: [{ id: 12, title: "Submit budget" }],
      parties: [{ id: 3, name: "Spring Formal" }],
    });
    expect(ix.lookup("Chapter Meeting", "event")).toEqual({ type: "event", id: 30 });
    expect(ix.lookup("Submit budget", "task")).toEqual({ type: "task", id: 12 });
    // Parties aren't a peek type yet — they must not be mistyped into one.
    expect(ix.lookup("Spring Formal", "generic")).toBeNull();
  });

  it("yields nothing from the empty-list envelope, unknown tools, or junk", () => {
    const ix = createRefIndex();
    ix.add("list_calendar_events", { count: 0, items: [], hint: "No rows matched these filters." });
    ix.add("get_treasury", { balance: 4120, recentTransactions: [{ date: "2026-07-01", amount: 50 }] });
    ix.add("list_brothers", null);
    ix.add("list_brothers", { brothers: "not an array" });
    expect(ix.size()).toBe(0);
  });

  it("ignores rows missing an id or a usable label", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", { brothers: [{ name: "No Id Here" }, { id: 3, name: "   " }, { id: 0, name: "Zero" }] });
    expect(ix.size()).toBe(0);
  });
});

describe("matching", () => {
  it("is case- and punctuation-insensitive", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", { brothers: [{ id: 7, name: "Marcus Reed" }] });
    expect(ix.lookup("marcus reed", "person")).toEqual({ type: "member", id: 7 });
    expect(ix.lookup("Marcus  Reed.", "person")).toEqual({ type: "member", id: 7 });
  });

  it("uses the row kind to pick between same-named records of different types", () => {
    const ix = createRefIndex();
    ix.add("list_calendar_events", [{ id: 30, title: "Budget Review" }]);
    ix.add("list_deadlines", [{ id: 12, title: "Budget Review" }]);
    expect(ix.lookup("Budget Review", "event")).toEqual({ type: "event", id: 30 });
    expect(ix.lookup("Budget Review", "task")).toEqual({ type: "task", id: 12 });
    // An untyped row can't choose between them, so it gets nothing.
    expect(ix.lookup("Budget Review", "generic")).toBeNull();
  });

  it("refuses to guess between two records of the SAME type", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", { brothers: [{ id: 7, name: "Chris Palmer" }, { id: 8, name: "Chris Palmer" }] });
    expect(ix.lookup("Chris Palmer", "person")).toBeNull();
  });

  it("treats the same record seen twice as one record, not ambiguity", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", { brothers: [{ id: 7, name: "Marcus Reed" }] });
    ix.add("get_brother", { id: 7, name: "Marcus Reed" });
    expect(ix.lookup("Marcus Reed", "person")).toEqual({ type: "member", id: 7 });
  });

  it("lets a money row resolve to whatever was seen under that label", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", { brothers: [{ id: 7, name: "Marcus Reed" }] });
    expect(ix.lookup("Marcus Reed", "money")).toEqual({ type: "member", id: 7 });
  });
});

describe("attachRefs", () => {
  it("attaches to matched rows and leaves the rest untouched", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", { brothers: [{ id: 7, name: "Marcus Reed" }] });

    const rows = attachRefs(
      [row(), row({ title: "Someone Unseen", ask: "How much do they owe?" })],
      ix,
    );
    expect(rows[0].ref).toEqual({ type: "member", id: 7 });
    // Unmatched rows keep their follow-up question — the pre-peek behavior.
    expect(rows[1].ref).toBeUndefined();
    expect(rows[1].ask).toBe("How much do they owe?");
  });

  it("cannot attach a record the tools never returned", () => {
    const ix = createRefIndex();
    // The model saw member 7 only; a row naming anyone else gets no ref, so a
    // hallucinated or cross-org id has no path onto an answer row.
    ix.add("list_brothers", { brothers: [{ id: 7, name: "Marcus Reed" }] });
    const rows = attachRefs([row({ title: "Ghost Member" })], ix);
    expect(rows[0].ref).toBeUndefined();
  });

  it("does not mutate the rows it was given", () => {
    const ix = createRefIndex();
    ix.add("list_brothers", { brothers: [{ id: 7, name: "Marcus Reed" }] });
    const original = row();
    attachRefs([original], ix);
    expect(original.ref).toBeUndefined();
  });
});

describe("same-named events resolve by date, and carry their facts", () => {
  const meetings = [
    { id: 31, title: "Chapter Meeting", date: "2026-03-10" },
    { id: 34, title: "Chapter Meeting", date: "2026-04-21" },
    { id: 40, title: "Chapter Meeting", date: "2026-11-10" },
  ];
  const ev = (title: string, extra: Partial<AnswerRow> = {}): AnswerRow => ({ kind: "event", title, ...extra });
  function index() {
    const ix = createRefIndex();
    ix.add("list_calendar_events", meetings);
    ix.add("get_event_attendance", { event: meetings[0], counts: { attended: 8, absent: 1, excused: 0 }, absent: [], excused: [] });
    return ix;
  }

  it("stays unresolved with no date to choose by", () => {
    expect(attachRefs([ev("Chapter Meeting")], index())[0].ref).toBeUndefined();
  });

  it("resolves by the row's own date", () => {
    const [r] = attachRefs([ev("Chapter Meeting", { date: "2026-04-21" })], index());
    expect(r.ref).toEqual({ type: "event", id: 34 });
    expect(r.event).toEqual({ date: "2026-04-21", turnout: null });
  });

  it("resolves by a date written into the title, and attaches the turnout it read", () => {
    const [a, b] = attachRefs([ev("CHAPTER MEETING 11/10"), ev("Chapter meeting", { subtitle: "Mar 10 · 8 attended" })], index());
    expect(a.ref).toEqual({ type: "event", id: 40 });
    expect(b.ref).toEqual({ type: "event", id: 31 });
    expect(b.event).toEqual({ date: "2026-03-10", turnout: { attended: 8, absent: 1, excused: 0 } });
  });

  it("refuses a date that matches none of them", () => {
    expect(attachRefs([ev("Chapter Meeting", { date: "2026-05-01" })], index())[0].ref).toBeUndefined();
  });

  it("a uniquely named event gets its facts too", () => {
    const ix = createRefIndex();
    ix.add("list_calendar_events", [{ id: 9, title: "Boba Fundraiser", date: "2026-05-14" }]);
    expect(attachRefs([ev("Boba Fundraiser")], ix)[0].event).toEqual({ date: "2026-05-14", turnout: null });
  });
});
