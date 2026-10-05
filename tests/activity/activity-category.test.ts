import { describe, expect, it } from "vitest";
import { activityCategoryFor, pairActivityCategories } from "@/lib/activity-category";

const at = (s: number) => new Date(Date.UTC(2026, 9, 4, 12, 0, 0) + s * 1000);

describe("activityCategoryFor", () => {
  it("maps an action by its subject", () => {
    expect(activityCategoryFor("dues.paid")).toBe("dues");
    expect(activityCategoryFor("reimbursement.created")).toBe("request");
    expect(activityCategoryFor("treasury.opening_balance.set")).toBe("treasury");
    expect(activityCategoryFor("org.config.updated")).toBe("settings");
  });
  it("gives feed-silent actions no category", () => {
    expect(activityCategoryFor("billing.tier_changed")).toBeNull();
    expect(activityCategoryFor("assistant.feedback")).toBeNull();
    expect(activityCategoryFor("nonsense")).toBeNull();
  });
});

describe("pairActivityCategories", () => {
  it("pairs a row with the event its own actor emitted just before it", () => {
    const out = pairActivityCategories(
      [{ id: 1, actorId: 7, timestamp: at(0.2) }],
      [
        { action: "dues.paid", actorId: 7, occurredAt: at(0) },
        { action: "task.created", actorId: 8, occurredAt: at(0.1) },
      ],
    );
    expect(out.get(1)).toBe("dues");
  });

  it("lines a same-second burst up one-to-one", () => {
    const out = pairActivityCategories(
      [
        { id: 1, actorId: 7, timestamp: at(0.05) },
        { id: 2, actorId: 7, timestamp: at(0.15) },
      ],
      [
        { action: "excuse.approved", actorId: 7, occurredAt: at(0) },
        { action: "reimbursement.approved", actorId: 7, occurredAt: at(0.1) },
      ],
    );
    expect(out.get(1)).toBe("attendance");
    expect(out.get(2)).toBe("request");
  });

  it("skips feed-silent events instead of pairing with them", () => {
    const out = pairActivityCategories(
      [{ id: 1, actorId: 7, timestamp: at(0.2) }],
      [
        { action: "party.completed", actorId: 7, occurredAt: at(0) },
        { action: "billing.tier_changed", actorId: 7, occurredAt: at(0.1) },
      ],
    );
    expect(out.get(1)).toBe("parties");
  });

  it("leaves a row with no event nearby untagged rather than guessing", () => {
    const out = pairActivityCategories(
      [{ id: 1, actorId: 7, timestamp: at(60) }, { id: 2, actorId: null, timestamp: at(0) }],
      [{ action: "dues.paid", actorId: 7, occurredAt: at(0) }],
    );
    expect(out.has(1)).toBe(false);
    expect(out.has(2)).toBe(false);
  });
});
