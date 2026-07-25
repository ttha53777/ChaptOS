/**
 * The reasoning ledger's two halves.
 *
 * Server (lib/ai-ledger): when a streamed tool_call name may be announced as a
 * step, and which raw index that step is keyed to. Both exist because getting
 * them wrong is silent — a mis-keyed step never settles, and a half-streamed
 * name posts the wrong verb against the wrong record.
 *
 * Client (app/components/chat/intent): the guessed rows shown while the model
 * decides, and the rules that stop them outliving the guess.
 */

import { describe, it, expect } from "vitest";
import { assembleToolCalls, stepId, stepNameSettled, type ToolCallSlot } from "@/lib/ai-ledger";
import { TOOL_UI } from "@/lib/ai-tools";
import {
  dropProvisional,
  intentFor,
  planFor,
  reconcileStep,
  settleLedger,
} from "@/app/components/chat/intent";
import type { LedgerStep } from "@/app/components/chat/types";

const slot = (over: Partial<ToolCallSlot> = {}): ToolCallSlot => ({ id: "call_1", name: "", argsBuf: "", ...over });

describe("stepNameSettled", () => {
  it("holds back a name that has no arguments yet", () => {
    // The opening delta of a tool call: name present, arguments not started.
    expect(stepNameSettled(slot({ name: "list_brothers" }), TOOL_UI)).toBe(false);
  });

  it("announces once arguments have started", () => {
    expect(stepNameSettled(slot({ name: "list_brothers", argsBuf: "{" }), TOOL_UI)).toBe(true);
  });

  it("refuses a name that is only a prefix of a real tool", () => {
    // get_brother is a strict prefix of get_brother_attendance: if a fragmented
    // name were trusted, an attendance lookup would post "Looking up a member"
    // against the Roster. Both tools must exist for this test to mean anything.
    expect(TOOL_UI.get_brother).toBeDefined();
    expect(TOOL_UI.get_brother_attendance).toBeDefined();
    expect(stepNameSettled(slot({ name: "get_brother_atten", argsBuf: "{" }), TOOL_UI)).toBe(false);
  });

  it("refuses an unknown tool rather than inventing a verb for it", () => {
    expect(stepNameSettled(slot({ name: "not_a_tool", argsBuf: "{}" }), TOOL_UI)).toBe(false);
  });
});

describe("assembleToolCalls", () => {
  it("keys every call to its raw delta index, not its position", () => {
    // Index 1 never received a name (a delta carrying only an id). Compacting
    // here would renumber index 2 to position 1, and its step_done — already
    // addressed to "0:2" on the wire — would never match anything again.
    const byIndex = new Map<number, ToolCallSlot>([
      [0, slot({ id: "a", name: "list_brothers", argsBuf: "{}" })],
      [1, slot({ id: "b", name: "", argsBuf: "" })],
      [2, slot({ id: "c", name: "get_treasury", argsBuf: "{}" })],
    ]);

    const calls = assembleToolCalls(byIndex);

    expect(calls.map(c => c.idx)).toEqual([0, 2]);
    expect(calls.map(c => stepId(0, c.idx))).toEqual(["0:0", "0:2"]);
  });

  it("returns calls in index order however the deltas arrived", () => {
    const byIndex = new Map<number, ToolCallSlot>([
      [2, slot({ name: "get_budget", argsBuf: "{}" })],
      [0, slot({ name: "list_brothers", argsBuf: "{}" })],
      [1, slot({ name: "get_treasury", argsBuf: "{}" })],
    ]);
    expect(assembleToolCalls(byIndex).map(c => c.name))
      .toEqual(["list_brothers", "get_treasury", "get_budget"]);
  });
});

describe("the announce gate, replayed over a real delta sequence", () => {
  /** Replays deltas the way the route does and records what it would announce. */
  function announce(deltas: Array<{ index: number; name?: string; args?: string }>) {
    const byIndex = new Map<number, ToolCallSlot>();
    const sent = new Set<number>();
    const steps: string[] = [];
    for (const d of deltas) {
      let s = byIndex.get(d.index);
      if (!s) { s = slot({ id: `call_${d.index}` }); byIndex.set(d.index, s); }
      if (d.name) s.name = d.name;
      if (d.args) s.argsBuf += d.args;
      if (!sent.has(d.index) && stepNameSettled(s, TOOL_UI)) {
        steps.push(`${stepId(0, d.index)} ${TOOL_UI[s.name].verb}`);
        sent.add(d.index);
      }
    }
    return steps;
  }

  it("announces each call once, in the order the model names them", () => {
    // Two parallel calls: the second name only arrives after the first call's
    // arguments have streamed — which is what gives the ledger its cascade.
    const steps = announce([
      { index: 0, name: "list_brothers" },
      { index: 0, args: "{\"owes" },
      { index: 0, args: "_dues_only\":true}" },
      { index: 1, name: "get_treasury" },
      { index: 1, args: "{}" },
    ]);
    expect(steps).toEqual(["0:0 Reading the roster", "0:1 Reading the treasury"]);
  });

  it("waits out a name split across deltas instead of posting the prefix", () => {
    const steps = announce([
      { index: 0, name: "get_brother" },
      { index: 0, name: "get_brother_attendance" },
      { index: 0, args: "{}" },
    ]);
    expect(steps).toEqual(["0:0 Checking attendance"]);
  });
});

// ── Client: the guessed plan ────────────────────────────────────────────────

describe("planFor / intentFor", () => {
  it("guesses the record a plain question is about", () => {
    expect(planFor("How are we doing on dues?").map(s => s.source)).toEqual(["Roster"]);
    expect(intentFor("How are we doing on dues?")).toBe("Reading the chapter's dues…");
  });

  it("guesses nothing, and says nothing specific, when it cannot tell", () => {
    expect(planFor("what should we do about the thing")).toEqual([]);
    expect(intentFor("what should we do about the thing")).toBe("Searching the records…");
  });

  it("only ever guesses pending rows, never a finding", () => {
    const guessed = planFor("Who missed the last two meetings?");
    expect(guessed.length).toBeGreaterThan(0);
    for (const s of guessed) {
      expect(s.status).toBe("pending");
      expect(s.provisional).toBe(true);
      expect(s.finding).toBeUndefined();
    }
  });
});

describe("reconcileStep", () => {
  const real = (id: string, source: string): LedgerStep =>
    ({ id, verb: "Reading the roster", source, status: "pending" });

  it("replaces a guess about the same record in place", () => {
    const steps = planFor("How are we doing on dues?"); // [Roster]
    const next = reconcileStep(steps, real("0:0", "Roster"));
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("0:0");
    expect(next[0].provisional).toBeUndefined();
  });

  it("appends a step about a record nobody guessed", () => {
    const steps = planFor("How are we doing on dues?");
    const next = reconcileStep(steps, real("0:0", "Budget"));
    expect(next.map(s => s.source)).toEqual(["Roster", "Budget"]);
  });
});

describe("settleLedger", () => {
  it("drops guesses and never-run steps, and settles what was still spinning", () => {
    const steps: LedgerStep[] = [
      { id: "guess:0", verb: "Reading the roster", source: "Roster", status: "pending", provisional: true },
      { id: "0:0", verb: "Reading the roster", source: "Roster", status: "done", finding: "34 members" },
      { id: "0:1", verb: "Reading the treasury", source: "Treasury", status: "active" },
      { id: "0:2", verb: "Opening the budget", source: "Budget", status: "pending" },
    ];
    const settled = settleLedger(steps);
    expect(settled.map(s => s.id)).toEqual(["0:0", "0:1"]);
    expect(settled.every(s => s.status === "done")).toBe(true);
  });

  it("returns the same array when there is nothing to settle", () => {
    // Runs on every streamed prose delta — a fresh array each time would
    // rerender the whole thread per token.
    const steps: LedgerStep[] = [{ id: "0:0", verb: "Reading the roster", status: "done" }];
    expect(settleLedger(steps)).toBe(steps);
  });
});

describe("dropProvisional", () => {
  it("keeps only what the model actually called", () => {
    const steps: LedgerStep[] = [
      { id: "0:0", verb: "Reading the roster", status: "active" },
      { id: "guess:1", verb: "Opening the budget", status: "pending", provisional: true },
    ];
    expect(dropProvisional(steps).map(s => s.id)).toEqual(["0:0"]);
  });
});
