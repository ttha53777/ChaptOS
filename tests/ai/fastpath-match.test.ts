// Pure-matcher tests for the chat fast-path. These exercise the deterministic
// intent table (regex/keyword precision) with NO DB and NO OpenAI call — the
// part most likely to mis-fire. Formatter + DB behavior is covered separately
// by the live-DB eval harness (scripts/eval-ask-the-chapter.ts).

import { describe, it, expect } from "vitest";
import { matchIntent } from "@/lib/ai-fastpath";

describe("fast-path matcher — hits", () => {
  it("routes dues-owed phrasings", () => {
    for (const q of [
      "who hasn't paid dues?",
      "Who haven't paid dues",
      "who owes dues?",
      "which brothers have outstanding dues",
      "who has unpaid dues",
    ]) {
      const m = matchIntent(q);
      expect(m, q).not.toBeNull();
      expect(m!.pattern).toBe("dues-owed");
      expect(m!.tool).toBe("list_brothers");
      expect(m!.args).toEqual({ owes_dues_only: true });
    }
  });

  it("routes at-risk phrasings", () => {
    for (const q of ["who's at risk?", "Who is at risk", "show me at-risk brothers"]) {
      const m = matchIntent(q);
      expect(m, q).not.toBeNull();
      expect(m!.pattern).toBe("at-risk");
      expect(m!.args).toEqual({ status: "At Risk" });
    }
  });

  it("routes treasury balance", () => {
    for (const q of ["what's our treasury balance?", "treasury balance", "how much is in the treasury"]) {
      const m = matchIntent(q);
      expect(m, q).not.toBeNull();
      expect(m!.pattern).toBe("treasury-balance");
      expect(m!.tool).toBe("get_treasury");
    }
  });

  it("routes this-week events with computed week bounds", () => {
    const m = matchIntent("what's on this week?");
    expect(m).not.toBeNull();
    expect(m!.pattern).toBe("this-week-events");
    expect(m!.tool).toBe("list_calendar_events");
    // bounds are real ISO dates, ascending
    expect(m!.args.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m!.args.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(m!.args.start) <= String(m!.args.end)).toBe(true);
  });
});

describe("fast-path matcher — abstains (must fall through to the LLM)", () => {
  it("does not fire on ambiguous or out-of-scope questions", () => {
    for (const q of [
      "how are we doing on dues?",        // aggregate framing — let the model decide
      "what's the weather?",              // out of scope
      "who has the best GPA and lowest dues?", // multi-metric, not a single obvious call
      "tell me about the chapter",        // open-ended
      "when is the next party?",          // date inference — not fast-pathable yet
      "",                                 // empty
      "   ",                              // whitespace only
    ]) {
      expect(matchIntent(q), q).toBeNull();
    }
  });

  it("does not confuse 'budget balance' with treasury", () => {
    expect(matchIntent("what's our budget balance?")).toBeNull();
  });
});
