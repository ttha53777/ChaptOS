/**
 * Money arithmetic and formatting.
 *
 * Pure module, no DB. Worth pinning because five separate copies of this
 * rounding used to exist and the formatters disagreed with each other — `fmt$`
 * dropped the trailing zero, so a $1,234.50 balance rendered "$1,234.5" on the
 * roster dues column and the treasury rail.
 */

import { describe, expect, it } from "vitest";
import { CENT_EPSILON, atLeast, fmtUsd, money, toCents } from "@/lib/money";

describe("money", () => {
  it("rounds to cents", () => {
    expect(money(1234.5678)).toBe(1234.57);
    expect(money(0.005)).toBe(0.01);
    expect(money(100)).toBe(100);
  });

  it("normalises negative zero", () => {
    // Math.round(-3e-14 * 100) / 100 is -0, which is `=== 0` and so slips
    // through every guard, but is not Object.is-equal to 0 and renders as "-0".
    // A balance of minus nothing is not a thing.
    expect(Object.is(money(-0.00000000000003), 0)).toBe(true);
    expect(Object.is(money(-0), 0)).toBe(true);
  });

  it("leaves a real negative alone", () => {
    expect(money(-12.34)).toBe(-12.34);
    // Math.round breaks halves toward +Infinity, so a negative half rounds
    // toward zero: -12.345 becomes -12.34, not -12.35. Longstanding behaviour of
    // the helper this module consolidated, and harmless here — every balance the
    // app rounds is non-negative (the compare-and-set guards see to that).
    expect(money(-12.345)).toBe(-12.34);
  });
});

describe("toCents", () => {
  it("converts dollars to integer cents", () => {
    expect(toCents(25)).toBe(2500);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004
  });
});

describe("atLeast", () => {
  it("is half a cent below the amount", () => {
    expect(atLeast(200)).toBe(200 - CENT_EPSILON);
  });

  it("admits a balance that drifted just under, and refuses one that is genuinely short", () => {
    // The two sides of the tolerance, which is the whole point of it: float
    // drift must not refuse an honest payment, and a real one-cent overpayment
    // must still be refused.
    expect(199.99999999999997 >= atLeast(200)).toBe(true);
    expect(199.99 >= atLeast(200)).toBe(false);
  });
});

describe("fmtUsd", () => {
  it("keeps whole dollars whole", () => {
    expect(fmtUsd(200)).toBe("$200");
    expect(fmtUsd(0)).toBe("$0");
  });

  it("gives cents both digits — the bug fmt$ used to have", () => {
    expect(fmtUsd(1234.5)).toBe("$1,234.50");
    expect(fmtUsd(0.5)).toBe("$0.50");
  });

  it("groups thousands", () => {
    expect(fmtUsd(1234567)).toBe("$1,234,567");
  });
});
