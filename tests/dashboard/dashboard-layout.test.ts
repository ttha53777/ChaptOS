import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  DEFAULT_DASH_NUMBERS,
  MAX_DASH_NUMBERS,
  normalizeDashboardLayout,
  nudgeCard,
  placeCard,
  resolveDashboardLayout,
  setNumberSlot,
  setWidgetHidden,
  type DashCardId,
  type DashStatId,
} from "@/lib/dashboard-layout";

const all = () => true;

describe("normalizeDashboardLayout", () => {
  it("returns null for anything that isn't layout-shaped", () => {
    expect(normalizeDashboardLayout(null)).toBeNull();
    expect(normalizeDashboardLayout("x")).toBeNull();
    expect(normalizeDashboardLayout([])).toBeNull();
  });

  it("drops unknown ids, keeps the first of a duplicate, and re-appends missing cards to their default column", () => {
    const out = normalizeDashboardLayout({ main: ["week", "nope", "week"], rail: ["members", 3], hidden: ["health", "zzz", "health"], numbers: ["members", "metric:12", "metric:0", "bogus"] });
    expect(out).toEqual({
      main: ["week", "needs"],
      rail: ["members", "ballot", "treasury", "activity"],
      hidden: ["health"],
      numbers: ["members", "metric:12"],
    });
  });

  it("caps the headline numbers at three, keeping the first ones", () => {
    const many = ["attendance", "dues", "gpa", "service", "members", "week"];
    expect(MAX_DASH_NUMBERS).toBe(3);
    expect(normalizeDashboardLayout({ ...DEFAULT_DASHBOARD_LAYOUT, numbers: many })!.numbers).toEqual(["attendance", "dues", "gpa"]);
  });

  it("turns the old 'auto' numbers into the default three", () => {
    expect(normalizeDashboardLayout({ main: [], rail: [], numbers: null })!.numbers).toEqual(DEFAULT_DASH_NUMBERS);
    expect(normalizeDashboardLayout({ main: [], rail: [] })!.numbers).toEqual(DEFAULT_DASH_NUMBERS);
  });

  it("a stored layout that hid the old numbers band keeps an empty row, and the band id is dropped", () => {
    const out = normalizeDashboardLayout({ main: [], rail: [], hidden: ["numbers", "health"], numbers: ["members"] })!;
    expect(out.numbers).toEqual([]);
    expect(out.hidden).toEqual(["health"]);
  });

  it("resolves a never-customized org to the default", () => {
    expect(resolveDashboardLayout(null)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });
});

describe("moves", () => {
  it("nudges past cards that aren't visible so every press moves the card", () => {
    const visible = (k: DashCardId) => k !== "treasury";
    const l = { ...DEFAULT_DASHBOARD_LAYOUT, rail: ["ballot", "week", "treasury", "activity"] as DashCardId[] };
    expect(nudgeCard(l, "activity", "up", visible).rail).toEqual(["ballot", "activity", "week", "treasury"]);
  });

  it("returns the same object for a move off the end", () => {
    expect(nudgeCard(DEFAULT_DASHBOARD_LAYOUT, "needs", "up", all)).toBe(DEFAULT_DASHBOARD_LAYOUT);
  });

  it("swaps a card into the other column at the same visual height", () => {
    const out = nudgeCard(DEFAULT_DASHBOARD_LAYOUT, "members", "swap", all);
    expect(out.main).toEqual(["needs", "week"]);
    expect(out.rail).toEqual(["ballot", "treasury", "members", "activity"]);
  });

  it("places a card at a visible slot, skipping cards that aren't shown", () => {
    const visible = (k: DashCardId) => k !== "ballot";
    // rail = ballot (not shown), treasury, activity → slot 0 is before treasury
    const out = placeCard(DEFAULT_DASHBOARD_LAYOUT, "week", "rail", 0, visible);
    expect(out.main).toEqual(["needs", "members"]);
    expect(out.rail).toEqual(["ballot", "week", "treasury", "activity"]);
    expect(placeCard(DEFAULT_DASHBOARD_LAYOUT, "needs", "rail", 99, visible).rail.at(-1)).toBe("needs");
  });

  it("placing a hidden card brings it back", () => {
    const h = setWidgetHidden(DEFAULT_DASHBOARD_LAYOUT, "activity", true);
    const out = placeCard(h, "activity", "main", 1, all);
    expect(out.hidden).toEqual([]);
    expect(out.main).toEqual(["needs", "activity", "week", "members"]);
  });

  it("returns the same object when a card is dropped back where it was", () => {
    expect(placeCard(DEFAULT_DASHBOARD_LAYOUT, "week", "main", 1, all)).toBe(DEFAULT_DASHBOARD_LAYOUT);
  });

  it("hides and shows without duplicating", () => {
    const h = setWidgetHidden(DEFAULT_DASHBOARD_LAYOUT, "activity", true);
    expect(setWidgetHidden(h, "activity", true)).toBe(h);
    expect(setWidgetHidden(h, "activity", false).hidden).toEqual([]);
  });
});

describe("setNumberSlot", () => {
  const nums: DashStatId[] = ["members", "week", "tasks"];
  it("trades places when the stat is already shown elsewhere", () => {
    expect(setNumberSlot(nums, 0, "tasks")).toEqual(["tasks", "week", "members"]);
  });
  it("appends into a new slot, never twice, never past the cap", () => {
    expect(setNumberSlot(["members", "week"], 2, "dues")).toEqual(["members", "week", "dues"]);
    expect(setNumberSlot(["members", "week"], 2, "week")).toEqual(["members", "week"]);
    const full = ["attendance", "dues", "gpa"] as DashStatId[];
    expect(setNumberSlot(full, 3, "tasks")).toEqual(full);
  });
});
