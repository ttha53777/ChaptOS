/**
 * The answer guard's decisions (lib/ai-answer-guard): which rounds are tool
 * rounds, and what a forced answer round asks for. The loop wiring itself is
 * exercised end to end by the eval harness, which runs the same guard.
 */
import { describe, it, expect } from "vitest";
import { isToolRound, roundOptions, MAX_ITERS } from "@/lib/ai-answer-guard";
import { MAX_COMPLETION_TOKENS } from "@/lib/ai";
import { ANSWER_TOOL } from "@/lib/ai-tools";

describe("isToolRound", () => {
  it("runs the calls of a normal tool round", () => {
    expect(isToolRound("tool_calls", 2)).toBe(true);
  });

  it("runs a forced compose_answer, which finishes with stop rather than tool_calls", () => {
    expect(isToolRound("stop", 1)).toBe(true);
  });

  it("never runs half-written calls from a round cut off by the length cap", () => {
    expect(isToolRound("length", 1)).toBe(false);
  });

  it("treats a round with no calls as the final message", () => {
    expect(isToolRound("stop", 0)).toBe(false);
    expect(isToolRound(null, 0)).toBe(false);
  });
});

describe("roundOptions", () => {
  it("leaves ordinary rounds to the model at the usual cap", () => {
    expect(roundOptions(false)).toEqual({ tool_choice: "auto", max_completion_tokens: MAX_COMPLETION_TOKENS });
  });

  it("forces compose_answer with more room when the round must answer", () => {
    expect(roundOptions(true)).toEqual({
      tool_choice: { type: "function", function: { name: ANSWER_TOOL } },
      max_completion_tokens: MAX_COMPLETION_TOKENS * 2,
    });
  });

  it("keeps the route's round budget", () => {
    expect(MAX_ITERS).toBe(10);
  });
});
