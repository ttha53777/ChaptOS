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
import type { RawSetupRecommendation } from "@/lib/ai";

const ALL_WIDGET_IDS = WORKFLOW_FEATURES.operations.map(f => f.id);

function raw(over: Partial<RawSetupRecommendation> = {}): RawSetupRecommendation {
  return {
    enabledWorkflows: [],
    shownWidgets: [],
    vocabulary: {},
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
