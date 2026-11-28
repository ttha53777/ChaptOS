/**
 * The Ask Chapt mark's face (lib/chat/mark-state.ts): the truth table that
 * maps widget facts to a state, and the timing rules that keep the face from
 * twitching. Pure — no DB, no network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DONE_MS, DWELL_MS, createMarkMachine, markStateFor, type MarkFacts, type MarkState, type MarkTurn } from "@/lib/chat/mark-state";

const facts = (over: Partial<MarkFacts> = {}): MarkFacts => ({ streaming: false, dictating: false, typed: false, turn: null, ...over });
const turn = (over: Partial<MarkTurn> = {}): MarkTurn => ({ content: "", ...over });
const answer = (over: NonNullable<MarkTurn["answer"]> = {}) => ({ ...over });

describe("markStateFor", () => {
  it("is idle with nothing going on", () => {
    expect(markStateFor(facts())).toBe("idle");
  });

  it("listens while dictating or while the composer has text", () => {
    expect(markStateFor(facts({ dictating: true }))).toBe("listening");
    expect(markStateFor(facts({ typed: true }))).toBe("listening");
  });

  it("thinks while a turn is in flight and nothing is being written", () => {
    expect(markStateFor(facts({ streaming: true, turn: turn() }))).toBe("thinking");
    expect(markStateFor(facts({ streaming: true, turn: turn({ composing: false }) }))).toBe("thinking");
    expect(markStateFor(facts({ streaming: true }))).toBe("thinking");
  });

  it("answers once the model writes: composing, a draft headline, prose or the answer", () => {
    expect(markStateFor(facts({ streaming: true, turn: turn({ composing: true }) }))).toBe("answering");
    expect(markStateFor(facts({ streaming: true, turn: turn({ draft: "Nine owe $1,240" }) }))).toBe("answering");
    expect(markStateFor(facts({ streaming: true, turn: turn({ content: "Nine" }) }))).toBe("answering");
    expect(markStateFor(facts({ streaming: true, turn: turn({ answer: answer() }) }))).toBe("answering");
  });

  it("a turn in flight wins over the composer", () => {
    expect(markStateFor(facts({ streaming: true, typed: true, turn: turn() }))).toBe("thinking");
  });

  it("is done when a settled turn answered (answer, prose or a drafted card)", () => {
    expect(markStateFor(facts({ turn: turn({ answer: answer() }) }))).toBe("done");
    expect(markStateFor(facts({ turn: turn({ content: "Here you go." }) }))).toBe("done");
    expect(markStateFor(facts({ turn: turn({ proposals: [{}] }) }))).toBe("done");
  });

  it("is unsure on a decline or an ask-back", () => {
    expect(markStateFor(facts({ turn: turn({ answer: answer({ shape: { type: "decline" } }) }) }))).toBe("unsure");
    expect(markStateFor(facts({ turn: turn({ answer: answer({ askback: { questions: [{}] } }) }) }))).toBe("unsure");
    // An empty ask-back is no ask-back.
    expect(markStateFor(facts({ turn: turn({ answer: answer({ askback: { questions: [] } }) }) }))).toBe("done");
    expect(markStateFor(facts({ turn: turn({ answer: answer({ shape: { type: "tally" } }) }) }))).toBe("done");
  });

  it("is offline when the turn failed — an error or a notice — even with an answer", () => {
    expect(markStateFor(facts({ turn: turn({ error: {} }) }))).toBe("offline");
    expect(markStateFor(facts({ turn: turn({ notice: { kind: "timeout" } }) }))).toBe("offline");
    expect(markStateFor(facts({ turn: turn({ notice: { kind: "cut_short" }, answer: answer() }) }))).toBe("offline");
  });

  it("is idle after Stop, and idle on a turn that never said anything", () => {
    expect(markStateFor(facts({ turn: turn({ stopped: true, content: "partial" }) }))).toBe("idle");
    expect(markStateFor(facts({ turn: turn() }))).toBe("idle");
  });

  it("typing the next question releases unsure and offline", () => {
    expect(markStateFor(facts({ typed: true, turn: turn({ error: {} }) }))).toBe("listening");
    expect(markStateFor(facts({ typed: true, turn: turn({ answer: answer({ shape: { type: "decline" } }) }) }))).toBe("listening");
  });
});

describe("createMarkMachine", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  function machine(initial: MarkState) {
    const seen: MarkState[] = [];
    const m = createMarkMachine(initial, s => seen.push(s));
    return { m, seen };
  }

  it("the first change after mount goes at once", () => {
    const { m, seen } = machine("idle");
    m.set("listening");
    expect(m.shown).toBe("listening");
    expect(seen).toEqual(["listening"]);
  });

  it("a 200ms flip never shows", () => {
    const { m, seen } = machine("idle");
    m.set("thinking");
    vi.advanceTimersByTime(600);
    m.set("answering");
    expect(m.shown).toBe("answering");
    vi.advanceTimersByTime(100);
    m.set("thinking"); // a tool call mid-reply
    vi.advanceTimersByTime(200);
    m.set("answering"); // and back to writing
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual(["thinking", "answering"]);
  });

  it("an ordinary change waits out the dwell, then shows the latest target", () => {
    const { m, seen } = machine("idle");
    m.set("thinking");
    vi.advanceTimersByTime(100);
    m.set("answering");
    expect(m.shown).toBe("thinking");
    vi.advanceTimersByTime(DWELL_MS - 100 - 1);
    expect(m.shown).toBe("thinking");
    vi.advanceTimersByTime(1);
    expect(m.shown).toBe("answering");
    expect(seen).toEqual(["thinking", "answering"]);
  });

  it("done, unsure and offline beat the dwell", () => {
    for (const urgent of ["done", "unsure", "offline"] as const) {
      const { m } = machine("idle");
      m.set("thinking");
      vi.advanceTimersByTime(50);
      m.set(urgent);
      expect(m.shown).toBe(urgent);
    }
  });

  it("done gives way to idle at 2.4s", () => {
    const { m, seen } = machine("idle");
    m.set("answering");
    vi.advanceTimersByTime(1000);
    m.set("done");
    expect(m.shown).toBe("done");
    vi.advanceTimersByTime(DONE_MS - 1);
    expect(m.shown).toBe("done");
    vi.advanceTimersByTime(1);
    expect(m.shown).toBe("idle");
    expect(seen).toEqual(["answering", "done", "idle"]);
  });

  it("starting on done (a thread reopened) shows idle, no hop", () => {
    const { m, seen } = machine("done");
    expect(m.shown).toBe("idle");
    m.set("done");
    vi.advanceTimersByTime(5000);
    expect(seen).toEqual([]);
  });

  it("back at done without a new answer stays idle (typed, then cleared)", () => {
    const { m, seen } = machine("done");
    m.set("listening");
    vi.advanceTimersByTime(1000);
    m.set("done");
    vi.advanceTimersByTime(DWELL_MS);
    expect(m.shown).toBe("idle");
    expect(seen).toEqual(["listening", "idle"]);
  });

  it("unsure and offline hold until something new is asked for", () => {
    const { m } = machine("idle");
    m.set("thinking");
    vi.advanceTimersByTime(800);
    m.set("offline");
    vi.advanceTimersByTime(60_000);
    expect(m.shown).toBe("offline");
    m.set("listening");
    vi.advanceTimersByTime(DWELL_MS);
    expect(m.shown).toBe("listening");
  });

  it("a new ask during the done hold takes over", () => {
    const { m } = machine("idle");
    m.set("answering");
    vi.advanceTimersByTime(800);
    m.set("done");
    vi.advanceTimersByTime(DWELL_MS);
    m.set("thinking");
    expect(m.shown).toBe("thinking");
    vi.advanceTimersByTime(DONE_MS);
    expect(m.shown).toBe("thinking");
  });

  it("dispose stops every timer", () => {
    const { m, seen } = machine("idle");
    m.set("thinking");
    m.set("answering");
    m.dispose();
    vi.advanceTimersByTime(10_000);
    expect(seen).toEqual(["thinking"]);
  });
});
