/**
 * Unit tests for the sidebar nav-order helpers (lib/nav-order.ts). Pure
 * functions, no DB — covers the sparse/advisory ordering contract the sidebar
 * and the org-config service both rely on.
 */

import { describe, expect, it } from "vitest";
import { applyNavOrder, normalizeNavOrder, NAV_LABELS } from "@/lib/nav-order";

describe("applyNavOrder", () => {
  const group = ["Docs", "Instagram", "Programming", "Service", "Parties", "Treasury"];

  it("returns the default order unchanged for an empty navOrder", () => {
    expect(applyNavOrder(group, [])).toEqual(group);
  });

  it("moves ordered labels to the front in the stored order", () => {
    expect(applyNavOrder(group, ["Treasury", "Docs"])).toEqual([
      "Treasury",
      "Docs",
      "Instagram",
      "Programming",
      "Service",
      "Parties",
    ]);
  });

  it("appends labels the order doesn't mention in their default position (sparse)", () => {
    // Only Service is reordered; everything else keeps default order behind it.
    expect(applyNavOrder(group, ["Service"])).toEqual([
      "Service",
      "Docs",
      "Instagram",
      "Programming",
      "Parties",
      "Treasury",
    ]);
  });

  it("ignores labels not in this group (one flat order drives every group)", () => {
    // "Dashboard" belongs to another group; it must not appear here.
    expect(applyNavOrder(group, ["Dashboard", "Treasury"])).toEqual([
      "Treasury",
      "Docs",
      "Instagram",
      "Programming",
      "Service",
      "Parties",
    ]);
  });

  it("is idempotent: applying the produced order again is a no-op", () => {
    const once = applyNavOrder(group, ["Treasury", "Docs"]);
    expect(applyNavOrder(group, once)).toEqual(once);
  });
});

describe("normalizeNavOrder", () => {
  it("drops unknown labels, blanks, and duplicates while preserving order", () => {
    expect(
      normalizeNavOrder(["Treasury", "  ", "Treasury", "Nonsense", " Docs "], NAV_LABELS),
    ).toEqual(["Treasury", "Docs"]);
  });

  it("returns an empty list when nothing is valid", () => {
    expect(normalizeNavOrder(["Bogus", ""], NAV_LABELS)).toEqual([]);
  });
});
