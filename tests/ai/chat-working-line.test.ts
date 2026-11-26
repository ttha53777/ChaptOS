/**
 * The working line's words and chips (app/components/chat/working-status) and
 * the question marks (intent.keywordsFor).
 *
 * The rules worth pinning are the honesty ones: a guess never reads as a
 * result, the status never claims progress that hasn't happened, and a
 * settled turn only lists what was actually read.
 */

import { describe, it, expect } from "vitest";
import { chipsFor, fmtElapsed, statusFor, QUESTION_BEAT_MS, type StatusInput } from "@/app/components/chat/working-status";
import { intentFor, keywordsFor, planFor, settleHalted } from "@/app/components/chat/intent";
import type { LedgerStep } from "@/app/components/chat/types";

const step = (id: string, over: Partial<LedgerStep> = {}): LedgerStep => ({
  id, verb: "Reading the roster", source: "Roster", status: "pending", ...over,
});
const live = (over: Partial<StatusInput> = {}): StatusInput => ({
  steps: [], intent: "Reading the chapter's dues…", live: true, elapsedMs: 0, answered: false, ...over,
});
const marked = (q: string) => keywordsFor(q).map(([s, e]) => q.slice(s, e));

describe("chipsFor", () => {
  it("shows a guess as likely, with no finding", () => {
    const [c] = chipsFor(planFor("who owes dues?"));
    expect(c).toMatchObject({ label: "Roster", state: "likely", reads: 0 });
    expect(c.finding).toBeUndefined();
  });

  it("walks queued → reading → read", () => {
    expect(chipsFor([step("1")])[0].state).toBe("queued");
    expect(chipsFor([step("1", { status: "active" })])[0].state).toBe("reading");
    expect(chipsFor([step("1", { status: "done", finding: "6 owe · $1,150" })])[0])
      .toMatchObject({ state: "read", finding: "6 owe · $1,150", reads: 1 });
  });

  it("folds several reads of one record into one chip", () => {
    const chips = chipsFor([
      step("1", { verb: "Looking up a member", status: "done", finding: "Marcus Lee" }),
      step("2", { verb: "Looking up a member", status: "active" }),
    ]);
    expect(chips).toHaveLength(1);
    // Still reading: one of its lookups hasn't returned.
    expect(chips[0]).toMatchObject({ state: "reading", finding: "Marcus Lee", reads: 1 });
  });

  it("keeps records in the order they first appeared", () => {
    const chips = chipsFor([
      step("1", { source: "Events", verb: "Scanning the calendar" }),
      step("2", { source: "Attendance", verb: "Pulling attendance" }),
      step("3", { source: "Events", verb: "Scanning the calendar" }),
    ]);
    expect(chips.map(c => c.label)).toEqual(["Events", "Attendance"]);
  });

  it("labels a sourceless step by its verb", () => {
    expect(chipsFor([step("1", { source: undefined, verb: "Thinking it over" })])[0].label).toBe("Thinking it over");
  });
});

describe("statusFor — live", () => {
  it("reads the question first, then says what the question is about", () => {
    expect(statusFor(live({ elapsedMs: 200 }))).toEqual({ text: "Reading your question", tone: "think" });
    expect(statusFor(live({ elapsedMs: QUESTION_BEAT_MS + 1 }))?.text).toBe("Reading the chapter's dues…");
  });

  it("doesn't treat a guess as progress", () => {
    // Guesses alone: still deciding, no count, no verb borrowed from the guess.
    const q = "who missed the meeting?";
    const s = statusFor(live({ steps: planFor(q), intent: intentFor(q), elapsedMs: 4000 }));
    expect(s).toEqual({ text: "Cross-checking attendance…", tone: "think" });
  });

  it("names the one record in hand, counting only once there's more than one", () => {
    expect(statusFor(live({ steps: [step("1", { status: "active" })] }))?.text).toBe("Reading the roster…");
    const two = [
      step("1", { source: "Events", verb: "Scanning the calendar", status: "done", finding: "3 events" }),
      step("2", { source: "Attendance", verb: "Pulling attendance", status: "active" }),
    ];
    expect(statusFor(live({ steps: two }))?.text).toBe("Pulling attendance… · 2 of 2");
  });

  it("names every record of a parallel batch", () => {
    const batch = [
      step("1", { source: "Budget", verb: "Opening the budget", status: "active" }),
      step("2", { source: "Treasury · ledger", verb: "Summing the ledger", status: "active" }),
      step("3", { source: "Events", verb: "Scanning the calendar" }),
    ];
    expect(statusFor(live({ steps: batch }))?.text).toBe("Reading Budget and Treasury · ledger… · 2 of 3");
  });

  it("names the next record when the batch is named but not started", () => {
    expect(statusFor(live({ steps: [step("1")] }))).toEqual({ text: "Reading the roster…", tone: "read" });
  });

  it("doesn't claim to be writing while the model may still read more", () => {
    const s = statusFor(live({ steps: [step("1", { status: "done", finding: "34 members" })] }));
    expect(s).toEqual({ text: "Going over what it read", tone: "think" });
  });

  it("is writing once the server says so, or once anything has arrived", () => {
    expect(statusFor(live({ composing: true }))).toEqual({ text: "Writing the answer", tone: "compose" });
    expect(statusFor(live({ answered: true }))?.tone).toBe("compose");
  });
});

describe("statusFor — settled", () => {
  const read = [
    step("1", { source: "Events", status: "done", finding: "3 events" }),
    step("2", { source: "Attendance", status: "done", finding: "28 of 34 attended" }),
  ];
  const settled = (over: Partial<StatusInput>) => statusFor(live({ live: false, answered: true, ...over }));

  it("becomes the trace: records read and how long it took", () => {
    expect(settled({ steps: read, elapsedMs: 11_400 })).toEqual({ text: "Read 2 records in 11.4s", tone: "done" });
    expect(settled({ steps: [read[0]], elapsedMs: 900 })?.text).toBe("Read 1 record in 0.9s");
  });

  it("says in a word that the turn didn't finish, keeping its line", () => {
    expect(settled({ steps: read, elapsedMs: 5000, stopped: true })).toEqual({ text: "Stopped after 2 records", tone: "halt" });
    expect(settled({ steps: [], elapsedMs: 900, stopped: true, answered: false })).toEqual({ text: "Stopped", tone: "halt" });
    expect(settled({ steps: [read[0]], elapsedMs: 5000, failed: true })).toEqual({ text: "Didn't finish · read 1 record", tone: "halt" });
  });

  it("counts only what was read, never a leftover guess", () => {
    expect(settled({ steps: [...planFor("who owes dues?"), read[0]], elapsedMs: 3000 })?.text).toBe("Read 1 record in 3.0s");
  });

  it("says how long a tool-less answer took, and nothing when it can't", () => {
    expect(settled({ elapsedMs: 2100 })?.text).toBe("Answered in 2.1s");
    // A turn from before elapsed time was recorded.
    expect(settled({ elapsedMs: undefined })).toBeNull();

  });
});

describe("settleHalted", () => {
  it("keeps only reads that returned — an interrupted read isn't listed as read", () => {
    const kept = settleHalted([
      ...planFor("who owes dues?"),
      step("1", { status: "done", finding: "34 members" }),
      step("2", { source: "Treasury", status: "active" }),
      step("3", { source: "Budget" }),
    ]);
    expect(kept.map(s => s.id)).toEqual(["1"]);
  });
});

describe("fmtElapsed", () => {
  it("formats seconds, then minutes", () => {
    expect(fmtElapsed(0)).toBe("0.0s");
    expect(fmtElapsed(59_940)).toBe("59.9s");
    expect(fmtElapsed(65_000)).toBe("1m 05s");
  });
});

describe("keywordsFor", () => {
  it("marks the words the winning guess keyed on, as typed", () => {
    expect(marked("Who still OWES dues?")).toEqual(["OWES", "dues"]);
  });

  it("widens a term to the whole word it sits in", () => {
    // "due" is a dues term; it must mark the word, not three letters of it.
    expect(marked("Anything due Friday? Dues too")).toEqual(["due", "Dues"]);
  });

  it("maps punctuation-split terms back to the original text", () => {
    expect(marked("I can't make Monday")).toEqual(["can't make"]);
  });

  it("marks nothing when no guess matched", () => {
    expect(keywordsFor("tell me a joke")).toEqual([]);
    expect(keywordsFor("")).toEqual([]);
  });

  it("only marks the winning guess's terms", () => {
    // Excuse outranks attendance; "missed" is an attendance term and stays unmarked.
    expect(marked("I can't make it, I missed the bus")).toEqual(["can't make"]);
  });
});
