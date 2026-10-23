import { describe, expect, it } from "vitest";
import { formatDollars, kindOf, stageOf, toCents } from "@/lib/fundraisers";

describe("kindOf", () => {
  it("reads the kind off the name", () => {
    expect(kindOf("Halloween Bake Sale")).toBe("bake");
    expect(kindOf("Boba sale")).toBe("drink");
    expect(kindOf("Fall car wash")).toBe("wash");
    expect(kindOf("Homecoming raffle")).toBe("raffle");
    expect(kindOf("Trivia night")).toBe("other");
  });
});

describe("stageOf", () => {
  it("is ready from the day of the sale, until wrapped", () => {
    expect(stageOf({ date: "2026-10-23", wrapped: false }, "2026-10-22")).toBe("planning");
    expect(stageOf({ date: "2026-10-22", wrapped: false }, "2026-10-22")).toBe("ready");
    expect(stageOf({ date: "2026-10-01", wrapped: false }, "2026-10-22")).toBe("ready");
    expect(stageOf({ date: "2026-10-01", wrapped: true }, "2026-10-22")).toBe("wrapped");
  });
});

describe("money", () => {
  it("keeps whole dollars whole and cents only when there are cents", () => {
    expect(formatDollars(387)).toBe("$387");
    expect(formatDollars(12.5)).toBe("$12.50");
    expect(formatDollars(-14)).toBe("−$14");
    expect(formatDollars(1234)).toBe("$1,234");
  });
  it("rounds to cents", () => {
    expect(toCents(31.4)).toBe(3140);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});
