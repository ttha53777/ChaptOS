/**
 * Tests for lib/onboarding/terms.ts — the interview's term-model helper.
 * suggestTerms() feeds the "which term are we in right now?" chips, so its
 * dates must always be valid YYYY-MM-DD with start <= end (the createOrgInput
 * refinement rejects anything else), current-first.
 */

import { describe, expect, it } from "vitest";
import {
  TERM_MODELS,
  TERM_PERIOD_VOCAB,
  suggestTerms,
} from "@/lib/onboarding/terms";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe("suggestTerms", () => {
  it("every suggestion for every model is well-formed and ordered", () => {
    for (const model of TERM_MODELS) {
      for (const today of ["2026-01-02", "2026-07-10", "2026-12-31"]) {
        const suggestions = suggestTerms(model, today);
        expect(suggestions.length, `${model} @ ${today}`).toBeGreaterThanOrEqual(2);
        for (const t of suggestions) {
          expect(t.startDate).toMatch(DATE_RE);
          expect(t.endDate).toMatch(DATE_RE);
          expect(t.startDate <= t.endDate, `${model} ${t.label}`).toBe(true);
          expect(t.label.length).toBeGreaterThan(0);
          expect(t.label.length).toBeLessThanOrEqual(40);
        }
        // Chronological: each suggestion starts after the previous one.
        for (let i = 1; i < suggestions.length; i++) {
          expect(suggestions[i]!.startDate > suggestions[i - 1]!.startDate).toBe(true);
        }
      }
    }
  });

  it("mid-semester: the containing term comes first", () => {
    const [first] = suggestTerms("semester", "2026-07-10"); // mid-summer
    expect(first!.label).toBe("Summer 2026");
    const [fall] = suggestTerms("semester", "2026-10-01");
    expect(fall!.label).toBe("Fall 2026");
  });

  it("in a break between terms, the next upcoming term comes first", () => {
    // Jan 2 is before the Spring window opens (Jan 12).
    const [first] = suggestTerms("semester", "2026-01-02");
    expect(first!.label).toBe("Spring 2026");
    // Between Spring and Summer semesters (May 10).
    const [next] = suggestTerms("semester", "2026-05-10");
    expect(next!.label).toBe("Summer 2026");
  });

  it("late December rolls into next year's terms without running out", () => {
    const suggestions = suggestTerms("semester", "2026-12-31");
    expect(suggestions[0]!.label).toBe("Spring 2027");
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it("year-round offers this year and next as calendar years", () => {
    expect(suggestTerms("year-round", "2026-07-10")).toEqual([
      { label: "2026", startDate: "2026-01-01", endDate: "2026-12-31" },
      { label: "2027", startDate: "2027-01-01", endDate: "2027-12-31" },
    ]);
  });

  it("quarters resolve the containing quarter", () => {
    const [first] = suggestTerms("quarter", "2026-02-01");
    expect(first!.label).toBe("Winter 2026");
  });
});

describe("TERM_PERIOD_VOCAB", () => {
  it("maps every model to an explicit Period label", () => {
    expect(TERM_PERIOD_VOCAB).toEqual({
      semester: "Semester",
      quarter: "Quarter",
      season: "Season",
      "year-round": "Year",
    });
  });
});
