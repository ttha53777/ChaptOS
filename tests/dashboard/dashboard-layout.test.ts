import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  DASH_PRESETS,
  MAX_DASH_NUMBERS,
  dropCard,
  normalizeDashboardLayout,
  nudgeCard,
  presetLayout,
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

  it("caps the headline numbers and keeps null as 'auto'", () => {
    const many = ["attendance", "dues", "gpa", "service", "members", "week", "tasks", "requests"];
    expect(normalizeDashboardLayout({ ...DEFAULT_DASHBOARD_LAYOUT, numbers: many })!.numbers).toHaveLength(MAX_DASH_NUMBERS);
    expect(normalizeDashboardLayout({ main: [], rail: [] })!.numbers).toBeNull();
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

  it("drops before/after a card or at the end of a column", () => {
    expect(dropCard(DEFAULT_DASHBOARD_LAYOUT, "activity", { card: "needs", after: false }).main).toEqual(["activity", "needs", "week", "members"]);
    const end = dropCard(DEFAULT_DASHBOARD_LAYOUT, "needs", { column: "rail" });
    expect(end.main).toEqual(["week", "members"]);
    expect(end.rail.at(-1)).toBe("needs");
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
    expect(setNumberSlot(nums, 3, "dues")).toEqual([...nums, "dues"]);
    expect(setNumberSlot(nums, 3, "week")).toEqual(nums);
    const full = ["attendance", "dues", "gpa", "service", "members", "week"] as DashStatId[];
    expect(setNumberSlot(full, 6, "tasks")).toEqual(full);
  });
});

describe("presets", () => {
  it("every preset resolves to a complete, valid layout", () => {
    for (const p of DASH_PRESETS) {
      const l = presetLayout(p);
      expect([...l.main, ...l.rail].sort()).toEqual(["activity", "ballot", "members", "needs", "treasury", "week"]);
    }
  });
  it("the Standard preset is the default", () => {
    expect(presetLayout(DASH_PRESETS[0])).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });
});
