/**
 * Pure-function tests for the /create draft: the localStorage round-trip
 * (parseDraft) and the draft → POST /api/orgs mapping (draftToCreateOrgInput).
 *
 * The headline invariant: for EVERY interview kind, the mapped payload parses
 * under the real createOrgInput schema. This is the regression test for the
 * founder-rank bug (templates store the founder seed at rank 100; the schema
 * caps seeds at 99 — the old flow sent 100 verbatim and 400'd).
 */

import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  draftToCreateOrgInput,
  emptyDraft,
  parseDraft,
  type Draft,
} from "@/lib/onboarding/draft";
import { KIND_IDS, KIND_TO_TYPE, PAIN_WF, matchKind, matchPain } from "@/lib/onboarding/kinds";
import { seatsFromTemplate } from "@/lib/onboarding/seats";
import { createOrgInput } from "@/lib/validation/org";
import { getOrgType } from "@/lib/org-types";

/** A completed draft for a kind, as the flow would hold it entering Build. */
function draftFor(kind: (typeof KIND_IDS)[number]): Draft {
  const template = getOrgType(KIND_TO_TYPE[kind])!;
  return {
    ...emptyDraft(),
    step: "build",
    name: "Kappa Sigma",
    kind,
    pain: "dues",
    founderName: "Alex Founder",
    interviewDone: true,
    enabledWorkflows: [...template.enabledWorkflows, PAIN_WF.dues],
    seats: seatsFromTemplate(KIND_TO_TYPE[kind]),
  };
}

describe("draftToCreateOrgInput", () => {
  it("output parses under createOrgInput for every kind (founder-rank regression)", () => {
    for (const kind of KIND_IDS) {
      const result = createOrgInput.safeParse(draftToCreateOrgInput(draftFor(kind)));
      expect(
        result.success,
        `${kind}: ${result.success ? "" : result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      ).toBe(true);
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
});

describe("parseDraft", () => {
  it("round-trips a serialized draft", () => {
    const draft = draftFor("fraternity");
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it("returns null for missing, corrupt, or wrong-shape values", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(undefined)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("not json {")).toBeNull();
    expect(parseDraft(JSON.stringify({ hello: "world" }))).toBeNull();
    // Legacy/foreign version marker.
    expect(parseDraft(JSON.stringify({ ...draftFor("club"), v: 2 }))).toBeNull();
    // Invalid enum members.
    expect(parseDraft(JSON.stringify({ ...draftFor("club"), kind: "dynasty" }))).toBeNull();
    expect(
      parseDraft(JSON.stringify({ ...draftFor("club"), enabledWorkflows: ["bitcoin"] })),
    ).toBeNull();
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

  it("matchPain hits the expected pains and defaults to comms", () => {
    expect(matchPain("chasing dues")).toBe("dues");
    expect(matchPain("money stuff")).toBe("dues");
    expect(matchPain("tracking attendance")).toBe("attendance");
    expect(matchPain("planning socials")).toBe("events");
    expect(matchPain("nobody reads the chat")).toBe("comms");
  });
});
