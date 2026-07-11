/**
 * Integrity tests for KIND_VARIANTS — the activity-profile modifiers the
 * interview's disambiguation question applies on top of the kind's base
 * template — and for how flowReducer applies them (setVariant must be
 * idempotent and recompute from the base, never stack deltas).
 */

import { describe, expect, it } from "vitest";
import {
  BUILTIN_METRIC_DEFAULTS,
  KIND_IDS,
  KIND_TO_TYPE,
  KIND_VARIANTS,
} from "@/lib/onboarding/kinds";
import { emptyDraft, type Draft } from "@/lib/onboarding/draft";
import { flowReducer } from "@/app/create/_components/flow-state";
import { ALL_WORKFLOWS, ALWAYS_ON_WORKFLOWS, getOrgType } from "@/lib/org-types";
import { PERMISSIONS } from "@/lib/permissions";

describe("KIND_VARIANTS integrity", () => {
  it("every modifier references only real workflow ids, never always-on removals", () => {
    for (const [kind, variants] of Object.entries(KIND_VARIANTS)) {
      for (const v of variants ?? []) {
        for (const w of [...(v.addWorkflows ?? []), ...(v.removeWorkflows ?? [])]) {
          expect(ALL_WORKFLOWS, `${kind}:${v.id} → ${w}`).toContain(w);
        }
        for (const w of v.removeWorkflows ?? []) {
          expect(ALWAYS_ON_WORKFLOWS, `${kind}:${v.id} removes always-on ${w}`).not.toContain(w);
        }
      }
    }
  });

  it("every added seat carries only real permission names", () => {
    for (const [kind, variants] of Object.entries(KIND_VARIANTS)) {
      for (const v of variants ?? []) {
        for (const seat of v.seatAdd ?? []) {
          for (const p of seat.permissions) {
            expect(Object.keys(PERMISSIONS), `${kind}:${v.id} seat ${seat.title}`).toContain(p);
          }
        }
      }
    }
  });

  it("every seatRemove names a real seat in the kind's base template (and never the founder)", () => {
    for (const [kind, variants] of Object.entries(KIND_VARIANTS)) {
      const template = getOrgType(KIND_TO_TYPE[kind as keyof typeof KIND_TO_TYPE])!;
      const titles = new Set(template.roleSeeds.filter(r => !r.all).map(r => r.name));
      for (const v of variants ?? []) {
        for (const title of v.seatRemove ?? []) {
          expect(titles, `${kind}:${v.id} removes unknown seat "${title}"`).toContain(title);
        }
      }
    }
  });

  it("fraternity/arts keep a true no-delta default variant (the template shape)", () => {
    for (const kind of ["fraternity", "arts"] as const) {
      const first = KIND_VARIANTS[kind]![0]!;
      expect(first.addWorkflows ?? []).toHaveLength(0);
      expect(first.removeWorkflows ?? []).toHaveLength(0);
      expect(first.seatRemove ?? []).toHaveLength(0);
    }
  });

  it("BUILTIN_METRIC_DEFAULTS covers every kind", () => {
    for (const kind of KIND_IDS) expect(BUILTIN_METRIC_DEFAULTS[kind]).toBeDefined();
  });
});

describe("flowReducer: setVariant", () => {
  function draftWithKind(kind: (typeof KIND_IDS)[number]): Draft {
    return flowReducer(emptyDraft(), { type: "setKind", kind });
  }

  it("applies the professional-fraternity modifier: workflows, seats, metrics", () => {
    const draft = flowReducer(draftWithKind("fraternity"), { type: "setVariant", variant: "professional" });
    expect(draft.variant).toBe("professional");
    expect(draft.enabledWorkflows).not.toContain("parties");
    expect(draft.enabledWorkflows).not.toContain("service");
    expect(draft.enabledWorkflows).toContain("tasks");
    const titles = draft.seats.map(s => s.title);
    expect(titles).not.toContain("Social");
    expect(titles).not.toContain("PR");
    expect(titles).toContain("VP Professional Development");
    expect(titles).toContain("VP Membership");
    // The founder seat survives every variant.
    expect(draft.seats.some(s => s.all)).toBe(true);
    expect(draft.metrics.serviceHours).toBe(false);
    expect(draft.metrics.gpa).toBe(true);
  });

  it("is idempotent and switch-safe: re-applying or changing variants never stacks", () => {
    const base = draftWithKind("fraternity");
    const once = flowReducer(base, { type: "setVariant", variant: "professional" });
    const twice = flowReducer(once, { type: "setVariant", variant: "professional" });
    expect(twice.enabledWorkflows).toEqual(once.enabledWorkflows);
    expect(twice.seats).toEqual(once.seats);
    // Switching to another variant, then back, lands on the same state.
    const detour = flowReducer(flowReducer(once, { type: "setVariant", variant: "service" }), {
      type: "setVariant",
      variant: "professional",
    });
    expect(detour.enabledWorkflows).toEqual(once.enabledWorkflows);
    expect(detour.seats).toEqual(once.seats);
  });

  it("the default variant equals the untouched template", () => {
    const base = draftWithKind("fraternity");
    const social = flowReducer(base, { type: "setVariant", variant: "social" });
    expect(social.enabledWorkflows).toEqual(base.enabledWorkflows);
    expect(social.seats).toEqual(base.seats);
  });

  it("preserves custom metrics across a variant switch", () => {
    let draft = draftWithKind("club");
    draft = flowReducer(draft, { type: "addCustomMetric", name: "Chapter Points", unit: "pts" });
    draft = flowReducer(draft, { type: "setVariant", variant: "cultural" });
    expect(draft.metrics.custom).toEqual([{ name: "Chapter Points", unit: "pts" }]);
    expect(draft.metrics.attendance).toBe(false); // cultural flips attendance off
  });

  it("setKind resets the variant and metric flags to the new kind's defaults", () => {
    let draft = flowReducer(draftWithKind("fraternity"), { type: "setVariant", variant: "professional" });
    draft = flowReducer(draft, { type: "setKind", kind: "team" });
    expect(draft.variant).toBeNull();
    expect(draft.metrics.gpa).toBe(false);
    expect(draft.metrics.attendance).toBe(true);
  });
});

describe("flowReducer: metrics + founder title", () => {
  it("applyAiPicks toggles workflows and vocab but never drops always-on", () => {
    const base = flowReducer(emptyDraft(), { type: "setKind", kind: "fraternity" });
    const next = flowReducer(base, {
      type: "applyAiPicks",
      picks: {
        addWorkflows: ["communications"],
        removeWorkflows: ["parties", "operations"],
        vocab: { Member: "Knight" },
      },
    });
    expect(next.enabledWorkflows).toContain("communications");
    expect(next.enabledWorkflows).not.toContain("parties");
    expect(next.enabledWorkflows).toContain("operations"); // always-on survives
    expect(next.vocab.Member).toBe("Knight");
  });

  it("setFounderTitle renames only the founder seat", () => {
    const base = flowReducer(emptyDraft(), { type: "setKind", kind: "fraternity" });
    const next = flowReducer(base, { type: "setFounderTitle", title: "VP Operations" });
    expect(next.seats.find(s => s.all)!.title).toBe("VP Operations");
    expect(next.seats.filter(s => !s.all)).toEqual(base.seats.filter(s => !s.all));
    // Blank titles are ignored (the seat must keep a valid name).
    expect(flowReducer(next, { type: "setFounderTitle", title: "  " }).seats.find(s => s.all)!.title).toBe(
      "VP Operations",
    );
  });

  it("addCustomMetric trims, caps at 5, and rejects empties", () => {
    let draft = flowReducer(emptyDraft(), { type: "setKind", kind: "club" });
    draft = flowReducer(draft, { type: "addCustomMetric", name: "  Points  ", unit: "  pts " });
    expect(draft.metrics.custom).toEqual([{ name: "Points", unit: "pts" }]);
    expect(flowReducer(draft, { type: "addCustomMetric", name: "   ", unit: null }).metrics.custom).toHaveLength(1);
    for (let i = 0; i < 6; i++) draft = flowReducer(draft, { type: "addCustomMetric", name: `M${i}`, unit: null });
    expect(draft.metrics.custom).toHaveLength(5);
  });
});
