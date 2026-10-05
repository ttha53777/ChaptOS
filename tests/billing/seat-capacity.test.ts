import { describe, expect, it } from "vitest";
import { seatCapacity } from "@/lib/billing/plans";
import { SELF_SERVE_MAX } from "@/lib/billing/tiers";

describe("seatCapacity", () => {
  it("is the four free seats with no subscription, or one not in good standing", () => {
    expect(seatCapacity(2, null)).toBe(4);
    expect(seatCapacity(9, { status: "past_due", billingMode: "automatic" })).toBe(4);
    expect(seatCapacity(9, { status: "canceled", billingMode: "selected", selectedPlan: "pro" })).toBe(4);
  });
  it("is the purchased band for a selected plan in good standing", () => {
    expect(seatCapacity(9, { status: "active", billingMode: "selected", selectedPlan: "standard" })).toBe(50);
    expect(seatCapacity(9, { status: "active", billingMode: "selected", selectedPlan: "pro" })).toBe(120);
  });
  it("is the self-serve ceiling for an automatic subscription in good standing", () => {
    expect(seatCapacity(9, { status: "active", billingMode: "automatic" })).toBe(SELF_SERVE_MAX);
  });
});
