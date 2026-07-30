/**
 * Price-band math. Pure — no DB, no Stripe.
 *
 * Boundaries get their own assertions because the original spec was written as
 * overlapping ranges ("5-50" and "50-120" both contain 50), and an off-by-one
 * here is the difference between a $25 invoice and a $65 one.
 */

import { describe, expect, it } from "vitest";
import {
  BILLING_BANDS,
  SELF_SERVE_MAX,
  formatPrice,
  formatRange,
  needsQuote,
  priceForCount,
  stripeTiers,
  tierForCount,
} from "@/lib/billing/tiers";

describe("tierForCount", () => {
  it.each([
    [1, "free"], [2, "free"], [4, "free"],
    [5, "standard"], [25, "standard"], [50, "standard"],
    [51, "pro"], [100, "pro"], [120, "pro"],
    [121, "custom"], [500, "custom"],
  ])("count %i is the %s band", (count, tier) => {
    expect(tierForCount(count).id).toBe(tier);
  });

  it("treats zero and negatives as a single member rather than throwing", () => {
    // An org always has at least its founder; a 0 here means a miscount
    // upstream, and free is the safe way to be wrong.
    expect(tierForCount(0).id).toBe("free");
    expect(tierForCount(-5).id).toBe("free");
  });

  it("floors fractional counts", () => {
    expect(tierForCount(4.9).id).toBe("free");
    expect(tierForCount(5.1).id).toBe("standard");
  });
});

describe("priceForCount", () => {
  it.each([
    [4, 0], [5, 2500], [50, 2500], [51, 6500], [120, 6500],
  ])("count %i costs %i cents", (count, cents) => {
    expect(priceForCount(count)).toBe(cents);
  });

  it("has no self-serve price above the ceiling", () => {
    expect(priceForCount(121)).toBeNull();
  });
});

describe("needsQuote", () => {
  it("flips exactly at the ceiling", () => {
    expect(needsQuote(SELF_SERVE_MAX)).toBe(false);
    expect(needsQuote(SELF_SERVE_MAX + 1)).toBe(true);
  });
});

describe("formatting", () => {
  it("renders prices without stray decimals", () => {
    expect(formatPrice(0)).toBe("$0");
    expect(formatPrice(2500)).toBe("$25");
    expect(formatPrice(6500)).toBe("$65");
    expect(formatPrice(null)).toBe("Custom");
  });

  it("renders an unbounded band as N+", () => {
    expect(formatRange(BILLING_BANDS[0])).toBe("1–4 members");
    expect(formatRange(BILLING_BANDS[BILLING_BANDS.length - 1])).toBe("121+ members");
  });
});

describe("stripeTiers", () => {
  const tiers = stripeTiers();

  it("prices every band through flat_amount, never unit_amount", () => {
    // This is what makes volume tiering behave as a flat fee per band:
    // total = (quantity x unit_amount) + flat_amount, so unit_amount must be 0.
    for (const t of tiers) expect(t.unit_amount).toBe(0);
    expect(tiers.map(t => t.flat_amount ?? 0)).toEqual([0, 2500, 6500, 6500]);
  });

  it("ends with an inf fallback tier", () => {
    // Stripe does not document what happens when a quantity exceeds the last
    // up_to. Without this tier, an org growing past 120 could make every
    // seat-sync call start failing at exactly the wrong moment.
    expect(tiers[tiers.length - 1].up_to).toBe("inf");
  });

  it("keeps the fallback at the top self-serve rate", () => {
    const last = tiers[tiers.length - 1];
    const topPriced = tiers[tiers.length - 2];
    expect(last.flat_amount).toBe(topPriced.flat_amount);
  });

  it("has ascending, band-aligned bounds", () => {
    expect(tiers.map(t => t.up_to)).toEqual([4, 50, 120, "inf"]);
  });
});
