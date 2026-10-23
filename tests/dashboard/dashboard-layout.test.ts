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
      top: ["announcement"],
      main: ["week", "needs"],
      rail: ["members", "next", "ballot", "treasury", "activity", "docs"],
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

  it("puts the pinned note back in the top spot for a layout stored when it was a band, keeping it hidden", () => {
    const out = normalizeDashboardLayout({ main: ["needs"], rail: ["activity"], hidden: ["announcement"] })!;
    expect(out.top).toEqual(["announcement"]);
    expect(out.hidden).toEqual(["announcement"]);
  });

  it("lets only the pinned note sit in the top spot", () => {
    const out = normalizeDashboardLayout({ top: ["week", "announcement"], main: [], rail: [] })!;
    expect(out.top).toEqual(["announcement"]);
    expect(out.main).toContain("week");
  });

  it("keeps the pinned note in a column when the org moved it there", () => {
    const out = normalizeDashboardLayout({ top: [], main: ["announcement", "needs"], rail: [] })!;
    expect(out.top).toEqual([]);
    expect(out.main.slice(0, 2)).toEqual(["announcement", "needs"]);
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
    expect(out.rail).toEqual(["next", "ballot", "members", "treasury", "activity", "docs"]);
  });

  it("places a card at a visible slot, skipping cards that aren't shown", () => {
    const visible = (k: DashCardId) => k !== "ballot";
    const l = { ...DEFAULT_DASHBOARD_LAYOUT, rail: ["ballot", "treasury", "activity"] as DashCardId[] };
    // rail = ballot (not shown), treasury, activity → slot 0 is before treasury
    const out = placeCard(l, "week", "rail", 0, visible);
    expect(out.main).toEqual(["needs", "members"]);
    expect(out.rail).toEqual(["ballot", "week", "treasury", "activity"]);
    expect(placeCard(l, "needs", "rail", 99, visible).rail.at(-1)).toBe("needs");
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

  it("moves the pinned note between the top spot and a column, and nothing else onto the top", () => {
    const down = placeCard(DEFAULT_DASHBOARD_LAYOUT, "announcement", "rail", 1, all);
    expect(down.top).toEqual([]);
    expect(down.rail.slice(0, 2)).toEqual(["next", "announcement"]);
    expect(placeCard(down, "announcement", "top", 0, all).top).toEqual(["announcement"]);
    expect(placeCard(DEFAULT_DASHBOARD_LAYOUT, "week", "top", 0, all)).toBe(DEFAULT_DASHBOARD_LAYOUT);
  });

  it("keyboard: down from the top spot lands first in the wide column, up from there goes back", () => {
    const down = nudgeCard(DEFAULT_DASHBOARD_LAYOUT, "announcement", "down", all);
    expect(down.top).toEqual([]);
    expect(down.main[0]).toBe("announcement");
    expect(nudgeCard(down, "announcement", "up", all).top).toEqual(["announcement"]);
    expect(nudgeCard(DEFAULT_DASHBOARD_LAYOUT, "announcement", "up", all)).toBe(DEFAULT_DASHBOARD_LAYOUT);
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
