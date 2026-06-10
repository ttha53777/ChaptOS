/**
 * Contract tests for validateRecommendation() — the server-side guard that turns
 * the AI's UNTRUSTED raw output into a safe setup recommendation. This is the
 * security-critical seam: a hallucinated workflow id, widget id, or vocab key
 * must never survive to the client or to a config write. Pure function, no model.
 */

import { describe, expect, it } from "vitest";
import { validateRecommendation } from "@/app/api/ai/recommend-setup/route";
import { ALL_WORKFLOWS } from "@/lib/org-types";
import { WORKFLOW_FEATURES } from "@/lib/workflow-features";
import { PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_THRESHOLDS } from "@/lib/thresholds";
import type { RawSetupRecommendation } from "@/lib/ai";

const ALL_WIDGET_IDS = WORKFLOW_FEATURES.operations.map(f => f.id);

function raw(over: Partial<RawSetupRecommendation> = {}): RawSetupRecommendation {
  return {
    enabledWorkflows: [],
    shownWidgets: [],
    vocabulary: {},
    thresholds: {},
    roles: [],
    rationale: "",
    ...over,
  };
}

describe("validateRecommendation: workflows", () => {
  it("keeps only real workflow ids and drops hallucinated ones", () => {
    const out = validateRecommendation(raw({
      enabledWorkflows: ["members", "finance", "not-a-workflow", "events"],
    }));
    expect(out.enabledWorkflows).toContain("members");
    expect(out.enabledWorkflows).toContain("finance");
    expect(out.enabledWorkflows).toContain("events");
    expect(out.enabledWorkflows as string[]).not.toContain("not-a-workflow");
    // Every surviving id is a real workflow.
    for (const w of out.enabledWorkflows) {
      expect(ALL_WORKFLOWS as readonly string[]).toContain(w);
    }
  });

  it("always includes the always-on operations workflow even if omitted", () => {
    const out = validateRecommendation(raw({ enabledWorkflows: ["docs"] }));
    expect(out.enabledWorkflows).toContain("operations");
  });
});

describe("validateRecommendation: widgets → disabledFeatures inversion", () => {
  it("hides every widget the model did not list as shown", () => {
    // Show only two widgets; the rest must be disabled.
    const shown = ["announcement", "brother-tracking"];
    const out = validateRecommendation(raw({ shownWidgets: shown }));
    const disabled = out.disabledFeatures.operations ?? [];
    const expectedHidden = ALL_WIDGET_IDS.filter(id => !shown.includes(id));
    expect(new Set(disabled)).toEqual(new Set(expectedHidden));
    // The shown ones are NOT in the disabled list.
    expect(disabled).not.toContain("announcement");
    expect(disabled).not.toContain("brother-tracking");
  });

  it("ignores bogus widget ids in shownWidgets (a fake id can't 'show' anything)", () => {
    // A hallucinated shown id shouldn't accidentally keep a real widget visible.
    const out = validateRecommendation(raw({ shownWidgets: ["not-a-widget", "health"] }));
    const disabled = out.disabledFeatures.operations ?? [];
    // health is shown → not disabled; everything else (real) is disabled.
    expect(disabled).not.toContain("health");
    expect(new Set(disabled)).toEqual(new Set(ALL_WIDGET_IDS.filter(id => id !== "health")));
  });

  it("disables all widgets when none are shown", () => {
    const out = validateRecommendation(raw({ shownWidgets: [] }));
    expect(new Set(out.disabledFeatures.operations ?? [])).toEqual(new Set(ALL_WIDGET_IDS));
  });

  it("emits no disabledFeatures entry when every widget is shown", () => {
    const out = validateRecommendation(raw({ shownWidgets: [...ALL_WIDGET_IDS] }));
    expect(out.disabledFeatures.operations).toBeUndefined();
  });
});

describe("validateRecommendation: vocabulary", () => {
  it("keeps only known vocab keys and trims/caps values", () => {
    const out = validateRecommendation(raw({
      vocabulary: {
        Member: "  Volunteer  ",            // known → trimmed
        NotAKey: "whatever",                 // unknown → dropped
        Service: "Volunteering",             // known
        Dues: "   ",                         // blank after trim → dropped
        Period: "x".repeat(60),              // capped to 40
      },
    }));
    expect(out.vocabularyOverrides.Member).toBe("Volunteer");
    expect(out.vocabularyOverrides.Service).toBe("Volunteering");
    expect(out.vocabularyOverrides).not.toHaveProperty("NotAKey");
    expect(out.vocabularyOverrides).not.toHaveProperty("Dues");
    expect(out.vocabularyOverrides.Period?.length).toBe(40);
  });
});

describe("validateRecommendation: rationale", () => {
  it("caps the rationale length", () => {
    const out = validateRecommendation(raw({ rationale: "y".repeat(500) }));
    expect(out.rationale.length).toBe(200);
  });
});

describe("validateRecommendation: thresholds", () => {
  it("clamps out-of-range values back to defaults and fills missing keys", () => {
    const out = validateRecommendation(raw({
      thresholds: {
        attendanceAtRisk: 80,     // valid → kept
        attendanceWatch: 999,     // out of [0,100] → default
        gpaAtRisk: 5,             // out of [0,4] → default
        // gpaWatch + serviceHoursGoal omitted → defaults
      },
    }));
    expect(out.thresholds.attendanceAtRisk).toBe(80);
    expect(out.thresholds.attendanceWatch).toBe(DEFAULT_THRESHOLDS.attendanceWatch);
    expect(out.thresholds.gpaAtRisk).toBe(DEFAULT_THRESHOLDS.gpaAtRisk);
    expect(out.thresholds.gpaWatch).toBe(DEFAULT_THRESHOLDS.gpaWatch);
    expect(out.thresholds.serviceHoursGoal).toBe(DEFAULT_THRESHOLDS.serviceHoursGoal);
  });

  it("returns all defaults for an empty thresholds object", () => {
    const out = validateRecommendation(raw({ thresholds: {} }));
    expect(out.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe("validateRecommendation: roles", () => {
  it("maps permission names to a bitfield, dropping unknown names", () => {
    const out = validateRecommendation(raw({
      roles: [{ name: "Treasurer", rank: 50, permissions: ["MANAGE_TREASURY", "NOT_A_PERM"], color: "#10B981" }],
    }));
    expect(out.roles).toHaveLength(1);
    expect(out.roles[0]!.permissions).toBe(PERMISSIONS.MANAGE_TREASURY);
  });

  it("clamps rank into [0, 90] so it stays below the founder's rank-100 role", () => {
    const out = validateRecommendation(raw({
      roles: [
        { name: "TooHigh", rank: 100, permissions: [], color: "#fff000" },
        { name: "WayHigh", rank: 250, permissions: [], color: "#fff000" },
        { name: "Negative", rank: -5, permissions: [], color: "#fff000" },
      ],
    }));
    expect(out.roles.every(r => r.rank <= 90 && r.rank >= 0)).toBe(true);
    expect(out.roles.find(r => r.name === "TooHigh")!.rank).toBe(90);
    expect(out.roles.find(r => r.name === "Negative")!.rank).toBe(0);
  });

  it("drops nameless roles and defaults a bad color", () => {
    const out = validateRecommendation(raw({
      roles: [
        { name: "   ", rank: 10, permissions: [], color: "#10B981" },        // dropped
        { name: "Captain", rank: 80, permissions: [], color: "not-a-color" }, // color → default
      ],
    }));
    expect(out.roles).toHaveLength(1);
    expect(out.roles[0]!.name).toBe("Captain");
    expect(out.roles[0]!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("never includes a rank-100 founder role (apply step owns that)", () => {
    const out = validateRecommendation(raw({
      roles: [{ name: "President", rank: 100, permissions: Object.keys(PERMISSIONS), color: "#F59E0B" }],
    }));
    expect(out.roles.every(r => r.rank < 100)).toBe(true);
  });
});
