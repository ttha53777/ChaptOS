/**
 * Answer-row interaction grammar (app/components/chat/types):
 *
 *   1. rowAction — the single source of truth behind a row's affordance, its
 *      click handler and keyboard selection. A row the server resolved to a
 *      record opens it; one it couldn't falls back to the model's follow-up
 *      question; a row with neither is inert. Precedence matters: opening the
 *      record must beat spending a model turn re-deriving what the DB knows.
 *   2. stepRow — arrow-key selection skips inert rows, so the violet selection
 *      never lands somewhere Enter does nothing.
 *
 * Pure unit — no DB, no DOM, no OpenAI.
 */

import { describe, it, expect } from "vitest";
import { rowAction, stepRow } from "@/app/components/chat/types";
import type { AnswerRow } from "@/app/components/chat/types";

const peek = (title = "Andre Whitfield"): AnswerRow =>
  ({ kind: "person", title, ref: { type: "member", id: 1 } });
const ask = (title = "Marcus Steele"): AnswerRow =>
  ({ kind: "person", title, ask: "How much does Marcus still owe?" });
const inert = (title = "Jordan Ellis"): AnswerRow => ({ kind: "person", title });
/** An advisory row proposing an event to run — the idea panel's input. */
const idea = (title = "Weekly Brotherhood Dinner"): AnswerRow =>
  ({ kind: "generic", title, tier: "high", screen: { label: "Events", path: "/events" } });

describe("rowAction", () => {
  it("opens the record when the server attached a ref", () => {
    expect(rowAction(peek())).toBe("peek");
  });

  it("falls back to the follow-up question when there's no ref", () => {
    expect(rowAction(ask())).toBe("ask");
  });

  it("is null when the row resolved to neither", () => {
    expect(rowAction(inert())).toBeNull();
  });

  it("prefers the record over the follow-up when a row carries both", () => {
    // The whole point of the peek: a ref answers from data already fetched,
    // where `ask` would spend a model turn re-deriving it.
    const both: AnswerRow = { ...ask(), ref: { type: "member", id: 4 } };
    expect(rowAction(both)).toBe("peek");
  });

  // ── Suggested events ─────────────────────────────────────────────────────
  // An advisory row pointing at Events with no record behind it is a PROPOSED
  // event, and opens the idea panel rather than navigating to an empty calendar.

  it("opens the idea panel for an advisory events row", () => {
    expect(rowAction(idea())).toBe("idea");
  });

  it("still navigates for an events row that isn't advisory", () => {
    // No tier — a plain pointer at the screen, not a recommendation to run
    // something. Nothing to draft, so the arrow still means "go there".
    const { tier: _tier, ...untiered } = idea();
    expect(rowAction(untiered as AnswerRow)).toBe("nav");
  });

  it("still navigates for advisory rows about other screens", () => {
    const dues: AnswerRow = { ...idea(), screen: { label: "Dues", path: "/treasury/dues" } };
    expect(rowAction(dues)).toBe("nav");
  });

  it("prefers the existing record over drafting a new event", () => {
    // A row the server matched to an event that ALREADY exists is a record to
    // look at — drafting a second one from it would duplicate the calendar.
    const existing: AnswerRow = { ...idea(), ref: { type: "event", id: 9 } };
    expect(rowAction(existing)).toBe("peek");
  });
});

describe("stepRow", () => {
  const rows = [peek(), inert(), ask(), inert()];

  it("lands on the first actionable row when nothing is selected", () => {
    expect(stepRow(rows, -1, 1)).toBe(0);
    expect(stepRow(rows, -1, -1)).toBe(0);
  });

  it("skips over inert rows going down", () => {
    expect(stepRow(rows, 0, 1)).toBe(2);
  });

  it("skips over inert rows going up", () => {
    expect(stepRow(rows, 2, -1)).toBe(0);
  });

  it("holds position rather than falling off either end", () => {
    expect(stepRow(rows, 2, 1)).toBe(2);  // only inert rows remain below
    expect(stepRow(rows, 0, -1)).toBe(0);
  });

  it("selects nothing when no row can be acted on", () => {
    expect(stepRow([inert(), inert()], -1, 1)).toBe(-1);
  });

  it("handles an empty answer", () => {
    expect(stepRow([], -1, 1)).toBe(-1);
  });

  it("starts from the first row when selection is stale-negative mid-list", () => {
    // -1 is the "no selection" sentinel the widget resets to between answers.
    expect(stepRow([inert(), peek()], -1, 1)).toBe(1);
  });
});
