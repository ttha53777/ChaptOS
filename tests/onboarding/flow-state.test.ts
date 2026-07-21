/**
 * app/create/_components/flow-state.ts pure-function tests.
 *
 * slugify() backs the Blueprint step's editable URL field — every keystroke
 * runs through it, and its output is what gets submitted as CreateOrgInput.slug
 * if the founder never touches the field again. Regression test for the bug
 * where a slug longer than MAX_SLUG_LEN passed the client's only length guard
 * (a `< 3` check) and reached POST /api/orgs, which 400'd with a raw ZodError
 * ("Validation failed") instead of the friendly slug-length message.
 */

import { describe, expect, it } from "vitest";
import { draftEventTypes, flowReducer, slugify } from "@/app/create/_components/flow-state";
import { MAX_SLUG_LEN } from "@/lib/slug-rules";
import { createOrgInput } from "@/lib/validation/org";
import { emptyDraft, type Draft } from "@/lib/onboarding/draft";
import { starterEventTypes } from "@/lib/onboarding/event-types";
import { BUILTIN_EVENT_TYPES } from "@/lib/event-types";
import { getOrgType } from "@/lib/org-types";

describe("flow-state: slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Lambda Phi Epsilon")).toBe("lambda-phi-epsilon");
  });

  it("strips leading/trailing separators", () => {
    expect(slugify("  Foo!! Bar  ")).toBe("foo-bar");
  });

  it("truncates to MAX_SLUG_LEN so it always parses under createOrgInput", () => {
    const long = "x".repeat(MAX_SLUG_LEN + 40);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LEN);
    expect(
      createOrgInput.safeParse({
        name: "Test Org",
        slug: result,
        orgType: "fraternity",
        founderName: "Alex",
      }).success,
    ).toBe(true);
  });
});

/* ─── Timeline step: the event-type resolver + its reducer actions ──────────
   draftEventTypes is the single resolver the step, its preview, the blueprint
   chips and the payload mapper all read — so these assertions are what keeps
   "what the founder saw" and "what provisionOrg writes" the same thing. */

/** A fraternity draft as the interview would leave it (tasks OFF). */
function fratDraft(): Draft {
  const template = getOrgType("fraternity")!;
  return {
    ...emptyDraft(),
    name: "Kappa Sigma",
    kind: "fraternity",
    interviewDone: true,
    enabledWorkflows: [...template.enabledWorkflows],
  };
}

describe("draftEventTypes", () => {
  it("resolves built-ins then the org type's starters, in order", () => {
    const rows = draftEventTypes(fratDraft());
    expect(rows.filter(r => r.builtin).map(r => r.slug)).toEqual(BUILTIN_EVENT_TYPES.map(t => t.slug));
    expect(rows.filter(r => !r.builtin).map(r => r.slug)).toEqual(
      getOrgType("fraternity")!.eventTypeSeeds!.map(s => s.slug),
    );
  });

  it("ghosts a type whose gating page is off, and keeps the row", () => {
    // A fraternity starts with tasks OFF, so Deadline is present but inactive —
    // the row still exists because provisionOrg seeds it either way.
    const rows = draftEventTypes(fratDraft());
    const deadline = rows.find(r => r.slug === "deadline")!;
    expect(deadline.active).toBe(false);
    expect(rows.filter(r => !r.active).map(r => r.slug)).toEqual(["deadline"]);

    const withTasks = draftEventTypes({
      ...fratDraft(),
      enabledWorkflows: [...fratDraft().enabledWorkflows, "tasks"],
    });
    expect(withTasks.find(r => r.slug === "deadline")!.active).toBe(true);
  });

  it("a hand-added type stays active regardless of pages", () => {
    const bare: Draft = { ...fratDraft(), enabledWorkflows: ["operations"] };
    const added = flowReducer(bare, {
      type: "addEventType", label: "Rush Week", color: "#3f6ea3", colorDark: "#8fb0d6",
    });
    const rows = draftEventTypes(added);
    expect(rows.find(r => r.slug === "rush-week")).toMatchObject({ active: true, workflowId: null });
    // The starters, being events-gated, ghost out on the same draft.
    expect(rows.find(r => r.slug === "social")!.active).toBe(false);
  });

  it("the chapter label follows the org's word for meetings until renamed", () => {
    const club: Draft = { ...fratDraft(), kind: "club", vocab: {} };
    expect(draftEventTypes(club).find(r => r.slug === "chapter")!.label).toBe("Meetings");

    const named: Draft = { ...club, vocab: { Meetings: "General Body" } };
    expect(draftEventTypes(named).find(r => r.slug === "chapter")!.label).toBe("General Body");

    const renamed = flowReducer(named, { type: "renameEventType", slug: "chapter", label: "Ritual" });
    expect(draftEventTypes(renamed).find(r => r.slug === "chapter")!.label).toBe("Ritual");
  });
});

describe("flowReducer: event types", () => {
  it("renaming a built-in writes a sparse override, not a materialized list", () => {
    const next = flowReducer(fratDraft(), { type: "renameEventType", slug: "chapter", label: "Ritual" });
    expect(next.eventTypes.builtins).toEqual({ chapter: { label: "Ritual" } });
    // Editing a BUILT-IN must not lock in the custom list — the founder hasn't
    // touched it, so the org type's starters should still be the answer.
    expect(next.eventTypes.customs).toBeNull();
  });

  it("editing a custom materializes the starter list once", () => {
    const next = flowReducer(fratDraft(), { type: "renameEventType", slug: "social", label: "Mixer" });
    expect(next.eventTypes.customs).not.toBeNull();
    expect(next.eventTypes.customs!.map(c => c.slug)).toEqual(
      starterEventTypes("fraternity").map(c => c.slug),
    );
    expect(next.eventTypes.customs!.find(c => c.slug === "social")!.label).toBe("Mixer");
  });

  it("recoloring moves both halves of the palette pair", () => {
    const built = flowReducer(fratDraft(), {
      type: "recolorEventType", slug: "service", color: "#6d28d9", colorDark: "#a78bfa",
    });
    expect(built.eventTypes.builtins.service).toEqual({ color: "#6d28d9", colorDark: "#a78bfa" });

    const custom = flowReducer(fratDraft(), {
      type: "recolorEventType", slug: "social", color: "#6d28d9", colorDark: "#a78bfa",
    });
    expect(custom.eventTypes.customs!.find(c => c.slug === "social")).toMatchObject({
      color: "#6d28d9", colorDark: "#a78bfa",
    });
  });

  it("de-dupes an added slug against built-ins and existing customs", () => {
    let draft = fratDraft();
    // "Chapter" would shadow the built-in; "Social" collides with a starter.
    draft = flowReducer(draft, { type: "addEventType", label: "Chapter", color: "#1", colorDark: "#2" });
    draft = flowReducer(draft, { type: "addEventType", label: "Social", color: "#1", colorDark: "#2" });
    draft = flowReducer(draft, { type: "addEventType", label: "Social", color: "#1", colorDark: "#2" });
    const slugs = draftEventTypes(draft).map(r => r.slug);
    expect(slugs.filter(s => s === "chapter")).toHaveLength(1);
    expect(slugs).toContain("chapter-2");
    expect(slugs).toContain("social-2");
    expect(slugs).toContain("social-3");
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("removing every custom is a real answer, not a reset to the starters", () => {
    let draft = fratDraft();
    for (const seed of starterEventTypes("fraternity")) {
      draft = flowReducer(draft, { type: "removeEventType", slug: seed.slug });
    }
    expect(draft.eventTypes.customs).toEqual([]);
    expect(draftEventTypes(draft).every(r => r.builtin)).toBe(true);
  });

  it("ignores a blank rename and a blank add", () => {
    const base = fratDraft();
    expect(flowReducer(base, { type: "renameEventType", slug: "chapter", label: "   " })).toBe(base);
    expect(flowReducer(base, { type: "addEventType", label: "  ", color: "#1", colorDark: "#2" })).toBe(base);
  });

  it("changing the kind resets to the new template's starters", () => {
    const edited = flowReducer(fratDraft(), { type: "renameEventType", slug: "social", label: "Mixer" });
    expect(edited.eventTypes.customs).not.toBeNull();

    const switched = flowReducer(edited, { type: "setKind", kind: "team" });
    expect(switched.eventTypes).toEqual({ builtins: {}, customs: null });
    expect(draftEventTypes(switched).filter(r => !r.builtin).map(r => r.slug)).toEqual(
      getOrgType("sports-team")!.eventTypeSeeds!.map(s => s.slug),
    );
  });
});
