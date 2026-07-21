/**
 * Pure-function tests for the /create draft: the localStorage round-trip
 * (parseDraft) and the draft → POST /api/orgs mapping (draftToCreateOrgInput).
 *
 * The headline invariant: for EVERY interview kind × variant, the mapped
 * payload parses under the real createOrgInput schema. This is the regression
 * test for the founder-rank bug (templates store the founder seed at rank 100;
 * the schema caps seeds at 99 — the old flow sent 100 verbatim and 400'd).
 */

import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  defaultMetrics,
  draftToCreateOrgInput,
  emptyDraft,
  parseDraft,
  type Draft,
} from "@/lib/onboarding/draft";
import { KIND_IDS, KIND_TO_TYPE, KIND_VARIANTS, matchKind, matchVariant } from "@/lib/onboarding/kinds";
import { matchTermModel } from "@/lib/onboarding/terms";
import { seatsFromTemplate } from "@/lib/onboarding/seats";
import { createOrgInput } from "@/lib/validation/org";
import { getOrgType } from "@/lib/org-types";
import { BUILTIN_EVENT_TYPES } from "@/lib/event-types";

/** A completed draft for a kind, as the flow would hold it entering Build. */
function draftFor(kind: (typeof KIND_IDS)[number], variant: string | null = null): Draft {
  const template = getOrgType(KIND_TO_TYPE[kind])!;
  return {
    ...emptyDraft(),
    step: "build",
    name: "Kappa Sigma",
    kind,
    variant,
    founderName: "Alex Founder",
    interviewDone: true,
    enabledWorkflows: [...template.enabledWorkflows],
    metrics: { ...defaultMetrics(kind), custom: [{ name: "Chapter Points", unit: "pts" }] },
    seats: seatsFromTemplate(KIND_TO_TYPE[kind]),
  };
}

describe("draftToCreateOrgInput", () => {
  it("output parses under createOrgInput for every kind × variant (founder-rank regression)", () => {
    for (const kind of KIND_IDS) {
      const variants = [null, ...(KIND_VARIANTS[kind] ?? []).map(v => v.id)];
      for (const variant of variants) {
        const result = createOrgInput.safeParse(draftToCreateOrgInput(draftFor(kind, variant)));
        expect(
          result.success,
          `${kind}/${variant}: ${result.success ? "" : result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        ).toBe(true);
      }
    }
  });

  it("marks exactly one founder seed, clamped below rank 100", () => {
    const { blueprint } = draftToCreateOrgInput(draftFor("fraternity"));
    const founders = blueprint!.roleSeeds!.filter(r => r.all);
    expect(founders).toHaveLength(1);
    expect(founders[0]!.rank).toBeLessThan(100);
    for (const seed of blueprint!.roleSeeds!) expect(seed.rank).toBeLessThanOrEqual(99);
  });

  it("resolves kind to the real org type", () => {
    expect(draftToCreateOrgInput(draftFor("sorority")).orgType).toBe("fraternity");
    expect(draftToCreateOrgInput(draftFor("team")).orgType).toBe("sports-team");
    expect(draftToCreateOrgInput(draftFor("other")).orgType).toBe("generic-org");
  });

  it("sorority layers Member: Sister over the fraternity template", () => {
    const { blueprint } = draftToCreateOrgInput(draftFor("sorority"));
    expect(blueprint!.vocabularyOverrides!.Member).toBe("Sister");
  });

  it("the founder's explicit vocab edits win over the kind delta", () => {
    const draft = { ...draftFor("sorority"), vocab: { Member: "Sib" } };
    const { blueprint } = draftToCreateOrgInput(draft);
    expect(blueprint!.vocabularyOverrides!.Member).toBe("Sib");
  });

  it("drops unknown vocab keys from a tampered draft", () => {
    const draft = { ...draftFor("fraternity"), vocab: { Member: "Bro", Bogus: "Nope" } };
    const { blueprint } = draftToCreateOrgInput(draft);
    expect(blueprint!.vocabularyOverrides!.Member).toBe("Bro");
    expect(blueprint!.vocabularyOverrides).not.toHaveProperty("Bogus");
  });

  it("normalizes workflows: dedupes and forces operations on", () => {
    const draft = { ...draftFor("fraternity") };
    draft.enabledWorkflows = ["members", "members", "finance"];
    const { blueprint } = draftToCreateOrgInput(draft);
    expect(blueprint!.enabledWorkflows).toEqual(["members", "finance", "operations"]);
  });

  it("derives the slug from the name unless explicitly overridden", () => {
    expect(draftToCreateOrgInput(draftFor("fraternity")).slug).toBe("kappa-sigma");
    const pinned = { ...draftFor("fraternity"), slug: "ks-mu" };
    expect(draftToCreateOrgInput(pinned).slug).toBe("ks-mu");
  });

  it("founder name falls back: draft answer → caller fallback → Founder", () => {
    expect(draftToCreateOrgInput(draftFor("club")).founderName).toBe("Alex Founder");
    const blank = { ...draftFor("club"), founderName: "  " };
    expect(draftToCreateOrgInput(blank, "Google Name").founderName).toBe("Google Name");
    expect(draftToCreateOrgInput(blank).founderName).toBe("Founder");
  });

  it("skips seats whose title was blanked out", () => {
    const draft = draftFor("fraternity");
    draft.seats = [...draft.seats, { title: "   ", color: "#10B981", permissions: [] }];
    const { blueprint } = draftToCreateOrgInput(draft);
    expect(blueprint!.roleSeeds!.every(r => r.name.length > 0)).toBe(true);
  });

  it("never sends blueprint.term — the term is set post-creation in the workspace", () => {
    // Term collection moved out of /create to the SemesterGate first-run prompt,
    // so the mapper omits blueprint.term entirely; the org is provisioned with no
    // active Semester and lands on the gate. blueprint.term stays optional
    // server-side, so the payload still parses.
    const { blueprint } = draftToCreateOrgInput(draftFor("fraternity"));
    expect(blueprint!.term).toBeUndefined();
    expect(createOrgInput.safeParse(draftToCreateOrgInput(draftFor("fraternity"))).success).toBe(true);
  });

  it("always sends blueprint.metrics: builtin flags + custom definitions", () => {
    const { blueprint } = draftToCreateOrgInput(draftFor("team"));
    // Team kind defaults: attendance only.
    expect(blueprint!.metrics).toEqual({
      builtins: { attendance: true, gpa: false, duesOwed: false, serviceHours: false },
      custom: [{ name: "Chapter Points", unit: "pts" }],
    });
  });
});

describe("draftToCreateOrgInput: event types", () => {
  it("always sends the full built-in set, in registry order", () => {
    const { blueprint } = draftToCreateOrgInput(draftFor("fraternity"));
    expect(blueprint!.eventTypes!.builtins!.map(t => t.slug)).toEqual(
      BUILTIN_EVENT_TYPES.map(t => t.slug),
    );
    for (const t of blueprint!.eventTypes!.builtins!) {
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.colorDark).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("labels the chapter type with the org's word for meetings", () => {
    // A fraternity says "Chapter"; a club says "Meetings"; an explicit vocab
    // edit wins over both. This is the whole reason `builtins` is always sent.
    const label = (kind: Parameters<typeof draftFor>[0], vocab: Record<string, string> = {}) =>
      draftToCreateOrgInput({ ...draftFor(kind), vocab }).blueprint!.eventTypes!.builtins!
        .find(t => t.slug === "chapter")!.label;

    expect(label("fraternity")).toBe("Chapter");
    expect(label("club")).toBe("Meetings");
    expect(label("club", { Meetings: "General Body" })).toBe("General Body");
  });

  it("an explicit rename pins the chapter label against later vocab edits", () => {
    const draft: Draft = {
      ...draftFor("fraternity"),
      vocab: { Meetings: "General Body" },
      eventTypes: { builtins: { chapter: { label: "Ritual" } }, customs: null },
    };
    const chapter = draftToCreateOrgInput(draft).blueprint!.eventTypes!.builtins!
      .find(t => t.slug === "chapter")!;
    expect(chapter.label).toBe("Ritual");
  });

  it("omits customs until the founder edits them, so the template still seeds", () => {
    // The three-state that matters: null = 'use the org type's starters'. Sending
    // an empty array instead would silently strip every starter for anyone who
    // walked past the step.
    const { blueprint } = draftToCreateOrgInput(draftFor("fraternity"));
    expect(blueprint!.eventTypes!.customs).toBeUndefined();
  });

  it("sends an explicit custom list once edited — including an empty one", () => {
    const cleared: Draft = {
      ...draftFor("fraternity"),
      eventTypes: { builtins: {}, customs: [] },
    };
    expect(draftToCreateOrgInput(cleared).blueprint!.eventTypes!.customs).toEqual([]);

    const edited: Draft = {
      ...draftFor("fraternity"),
      eventTypes: {
        builtins: {},
        customs: [
          { slug: "social", label: "Social", color: "#9a7224", colorDark: "#ddb36a", workflowId: "events" },
          { slug: "rush-week", label: "Rush Week", color: "#3f6ea3", colorDark: "#8fb0d6", workflowId: null },
        ],
      },
    };
    const customs = draftToCreateOrgInput(edited).blueprint!.eventTypes!.customs!;
    expect(customs.map(t => t.slug)).toEqual(["social", "rush-week"]);
    // Starters follow the Events page; a hand-added type is ungated.
    expect(customs.find(t => t.slug === "social")!.workflowId).toBe("events");
    expect(customs.find(t => t.slug === "rush-week")!.workflowId).toBeNull();
  });

  it("a recolored built-in carries both halves of the palette pair", () => {
    const draft: Draft = {
      ...draftFor("fraternity"),
      eventTypes: {
        builtins: { service: { color: "#6d28d9", colorDark: "#a78bfa" } },
        customs: null,
      },
    };
    const service = draftToCreateOrgInput(draft).blueprint!.eventTypes!.builtins!
      .find(t => t.slug === "service")!;
    expect(service).toMatchObject({ color: "#6d28d9", colorDark: "#a78bfa" });
    // The label is untouched by a recolor.
    expect(service.label).toBe("Community Service");
  });
});

describe("parseDraft", () => {
  it("round-trips a serialized draft", () => {
    const draft = draftFor("fraternity", "professional");
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("returns null for missing, corrupt, or wrong-shape values", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(undefined)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("not json {")).toBeNull();
    expect(parseDraft(JSON.stringify({ hello: "world" }))).toBeNull();
    // Legacy/foreign version marker.
    expect(parseDraft(JSON.stringify({ ...draftFor("club"), v: 1 }))).toBeNull();
    // Invalid enum members.
    expect(parseDraft(JSON.stringify({ ...draftFor("club"), kind: "dynasty" }))).toBeNull();
    expect(
      parseDraft(JSON.stringify({ ...draftFor("club"), enabledWorkflows: ["bitcoin"] })),
    ).toBeNull();
  });

  it("discards a v1 (pain-era) draft instead of migrating it", () => {
    // The exact shape the pre-redesign flow persisted — no variant/term/metrics.
    const v1 = {
      v: 1,
      savedAt: Date.now(),
      step: "build",
      name: "Kappa Sigma",
      slug: null,
      kind: "fraternity",
      pain: "dues",
      founderName: "Alex",
      skipped: false,
      interviewDone: true,
      enabledWorkflows: ["members", "finance", "operations"],
      vocab: {},
      seats: [],
    };
    expect(parseDraft(JSON.stringify(v1))).toBeNull();
  });

  it("expires drafts older than the max age", () => {
    const stale = { ...draftFor("club"), savedAt: Date.now() - DRAFT_MAX_AGE_MS - 1000 };
    expect(parseDraft(JSON.stringify(stale))).toBeNull();
    const fresh = { ...draftFor("club"), savedAt: Date.now() - 60_000 };
    expect(parseDraft(JSON.stringify(fresh))).not.toBeNull();
  });

  it("rejects a draft with a non-image logo data URL", () => {
    const bad = { ...draftFor("club"), logoDataUrl: "data:text/html,<script>" };
    expect(parseDraft(JSON.stringify(bad))).toBeNull();
    const good = { ...draftFor("club"), logoDataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    expect(parseDraft(JSON.stringify(good))).not.toBeNull();
  });

  it("rejects over-long custom metric lists", () => {
    const tooMany = {
      ...draftFor("club"),
      metrics: {
        ...defaultMetrics("club"),
        custom: Array.from({ length: 6 }, (_, i) => ({ name: `M${i}`, unit: null })),
      },
    };
    expect(parseDraft(JSON.stringify(tooMany))).toBeNull();
  });
});

describe("interview keyword matchers", () => {
  it("matchKind hits the expected kinds", () => {
    expect(matchKind("we're a frat at UCLA")).toBe("fraternity");
    expect(matchKind("a sorority chapter")).toBe("sorority");
    expect(matchKind("club soccer TEAM")).toBe("team");
    expect(matchKind("volunteer group")).toBe("service");
    expect(matchKind("honor society")).toBe("honor");
    expect(matchKind("marching band")).toBe("arts");
    expect(matchKind("student org")).toBe("club");
    expect(matchKind("a book circle")).toBe("other");
  });

  it("matchVariant resolves the disambiguation follow-up per kind", () => {
    expect(matchVariant("fraternity", "we're a pre-med professional frat")).toBe("professional");
    expect(matchVariant("fraternity", "a service fraternity like APO")).toBe("service");
    expect(matchVariant("fraternity", "regular social frat")).toBe("social");
    expect(matchVariant("club", "cultural heritage club")).toBe("cultural");
    expect(matchVariant("club", "we compete in debate")).toBe("competition");
    expect(matchVariant("team", "intramural pickup")).toBe("casual");
    expect(matchVariant("arts", "an a cappella ensemble")).toBe("ensemble");
    // Unmatched text falls back to the kind's default (first) variant.
    expect(matchVariant("fraternity", "hmm not sure")).toBe("social");
    // Kinds without variants return null.
    expect(matchVariant("honor", "whatever")).toBeNull();
  });

  it("matchTermModel resolves calendar text and defaults to semester", () => {
    expect(matchTermModel("we're on the quarter system")).toBe("quarter");
    expect(matchTermModel("seasons — fall ball and spring")).toBe("season");
    expect(matchTermModel("we run year-round")).toBe("year-round");
    expect(matchTermModel("normal semesters")).toBe("semester");
    expect(matchTermModel("idk")).toBe("semester");
  });
});
