/**
 * Schema tests for the createOrgInput `blueprint` — the client↔server contract
 * the pre-creation review UI writes. Pure Zod parsing, no DB. Guards that a
 * well-formed blueprint round-trips and that malformed input is rejected before
 * it ever reaches provisionOrg.
 */

import { describe, expect, it } from "vitest";
import { createOrgInput } from "@/lib/validation/org";

const BASE = {
  name:        "Test Org",
  slug:        "test-org",
  orgType:     "fraternity",
  founderName: "Jordan Lee",
};

describe("createOrgInput: blueprint", () => {
  it("accepts a create with no blueprint (template-only path)", () => {
    const parsed = createOrgInput.parse(BASE);
    expect(parsed.blueprint).toBeUndefined();
  });

  it("accepts a full, well-formed blueprint", () => {
    const parsed = createOrgInput.parse({
      ...BASE,
      blueprint: {
        enabledWorkflows: ["members", "finance", "operations"],
        vocabularyOverrides: { Member: "Knight", Meetings: "Gathering" },
        roleSeeds: [
          { name: "Founder", rank: 99, all: true },
          { name: "Treasurer", rank: 40, permissions: ["MANAGE_TREASURY"], color: "#10B981" },
        ],
      },
    });
    expect(parsed.blueprint?.enabledWorkflows).toContain("finance");
    expect(parsed.blueprint?.roleSeeds).toHaveLength(2);
  });

  it("rejects an unknown workflow id", () => {
    const r = createOrgInput.safeParse({
      ...BASE,
      blueprint: { enabledWorkflows: ["members", "not-a-workflow"] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown permission name in a role seed", () => {
    const r = createOrgInput.safeParse({
      ...BASE,
      blueprint: { roleSeeds: [{ name: "X", rank: 10, permissions: ["MANAGE_NONSENSE"] }] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-founder role rank at or above the founder rank (100)", () => {
    const r = createOrgInput.safeParse({
      ...BASE,
      blueprint: { roleSeeds: [{ name: "TooHigh", rank: 100 }] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an over-long vocabulary label", () => {
    const r = createOrgInput.safeParse({
      ...BASE,
      blueprint: { vocabularyOverrides: { Member: "x".repeat(41) } },
    });
    expect(r.success).toBe(false);
  });

  it("trims role names via the schema", () => {
    const parsed = createOrgInput.parse({
      ...BASE,
      blueprint: { roleSeeds: [{ name: "  Scribe  ", rank: 30 }] },
    });
    expect(parsed.blueprint?.roleSeeds?.[0]!.name).toBe("Scribe");
  });
});

describe("createOrgInput: blueprint.eventTypes", () => {
  const withTypes = (eventTypes: unknown) =>
    createOrgInput.safeParse({ ...BASE, blueprint: { eventTypes } });

  it("accepts a well-formed block", () => {
    const r = withTypes({
      builtins: [{ slug: "chapter", label: "General Body", color: "#6d28d9", colorDark: "#a78bfa" }],
      customs: [
        { slug: "rush-week", label: "Rush Week", color: "#9a7224", colorDark: "#ddb36a", workflowId: null },
        { slug: "social", label: "Social", color: "#4a7d4c", colorDark: "#86b988", workflowId: "events" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty customs array (a real 'no custom categories' answer)", () => {
    expect(withTypes({ customs: [] }).success).toBe(true);
  });

  it("rejects a built-in slug that isn't in the registry", () => {
    const r = withTypes({ builtins: [{ slug: "social", label: "Social", color: "#9a7224", colorDark: "#ddb36a" }] });
    expect(r.success).toBe(false);
  });

  it("rejects a custom slug that shadows a built-in", () => {
    // Would collide on the (organizationId, slug) unique index and blow up the
    // whole provisioning transaction.
    const r = withTypes({
      customs: [{ slug: "chapter", label: "Chapter Two", color: "#9a7224", colorDark: "#ddb36a" }],
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toMatch(/built-in/i);
  });

  it("rejects duplicate slugs within a list", () => {
    const dup = (slug: string) => ({ slug, label: "X", color: "#9a7224", colorDark: "#ddb36a" });
    expect(withTypes({ customs: [dup("social"), dup("social")] }).success).toBe(false);
    expect(
      withTypes({
        builtins: [
          { slug: "chapter", label: "A", color: "#9a7224", colorDark: "#ddb36a" },
          { slug: "chapter", label: "B", color: "#9a7224", colorDark: "#ddb36a" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects a non-kebab custom slug", () => {
    for (const slug of ["Rush Week", "rush_week", "-rush", "rush-"]) {
      expect(withTypes({ customs: [{ slug, label: "Rush", color: "#9a7224", colorDark: "#ddb36a" }] }).success, slug).toBe(false);
    }
  });

  it("rejects a non-hex color on either half of the pair", () => {
    expect(withTypes({ customs: [{ slug: "x", label: "X", color: "gold", colorDark: "#ddb36a" }] }).success).toBe(false);
    expect(withTypes({ customs: [{ slug: "x", label: "X", color: "#9a7224", colorDark: "#fff" }] }).success).toBe(false);
  });

  it("rejects an unknown workflow id on a custom", () => {
    const r = withTypes({
      customs: [{ slug: "x", label: "X", color: "#9a7224", colorDark: "#ddb36a", workflowId: "not-a-workflow" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an over-long label and an over-cap list", () => {
    expect(withTypes({ customs: [{ slug: "x", label: "y".repeat(41), color: "#9a7224", colorDark: "#ddb36a" }] }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({
      slug: `t-${i}`, label: `T${i}`, color: "#9a7224", colorDark: "#ddb36a",
    }));
    expect(withTypes({ customs: many }).success).toBe(false);
  });

  it("does NOT accept behavior fields from the client", () => {
    // creatable / hidden / mandatoryDefault are provisioning's business — an
    // extra key is stripped rather than honored, so a hand-rolled payload can't
    // make `party` creatable or un-hide something.
    const parsed = createOrgInput.parse({
      ...BASE,
      blueprint: {
        eventTypes: {
          customs: [{
            slug: "x", label: "X", color: "#9a7224", colorDark: "#ddb36a",
            creatable: false, hidden: true, mandatoryDefault: true, builtin: true,
          }],
        },
      },
    });
    expect(parsed.blueprint!.eventTypes!.customs![0]).toEqual({
      slug: "x", label: "X", color: "#9a7224", colorDark: "#ddb36a",
    });
  });
});

describe("createOrgInput: blueprint.term", () => {
  const TERM = { label: "Fall 2026", startDate: "2026-08-24", endDate: "2026-12-18" };

  it("accepts a well-formed term", () => {
    const parsed = createOrgInput.parse({ ...BASE, blueprint: { term: TERM } });
    expect(parsed.blueprint?.term).toEqual(TERM);
  });

  it("rejects non-YYYY-MM-DD dates", () => {
    expect(
      createOrgInput.safeParse({ ...BASE, blueprint: { term: { ...TERM, startDate: "Aug 24" } } }).success,
    ).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    expect(
      createOrgInput.safeParse({
        ...BASE,
        blueprint: { term: { label: "Backwards", startDate: "2026-12-18", endDate: "2026-08-24" } },
      }).success,
    ).toBe(false);
  });

  it("rejects an empty or over-long label", () => {
    expect(
      createOrgInput.safeParse({ ...BASE, blueprint: { term: { ...TERM, label: "  " } } }).success,
    ).toBe(false);
    expect(
      createOrgInput.safeParse({ ...BASE, blueprint: { term: { ...TERM, label: "x".repeat(41) } } }).success,
    ).toBe(false);
  });
});

describe("createOrgInput: blueprint.metrics", () => {
  const BUILTINS = { attendance: true, gpa: false, duesOwed: true, serviceHours: false };

  it("accepts builtin flags plus custom definitions", () => {
    const parsed = createOrgInput.parse({
      ...BASE,
      blueprint: {
        metrics: { builtins: BUILTINS, custom: [{ name: "Chapter Points", unit: "pts" }, { name: "Books Read" }] },
      },
    });
    expect(parsed.blueprint?.metrics?.builtins.gpa).toBe(false);
    expect(parsed.blueprint?.metrics?.custom).toHaveLength(2);
  });

  it("rejects more than 5 custom metrics", () => {
    const custom = Array.from({ length: 6 }, (_, i) => ({ name: `Metric ${i}` }));
    expect(
      createOrgInput.safeParse({ ...BASE, blueprint: { metrics: { builtins: BUILTINS, custom } } }).success,
    ).toBe(false);
  });

  it("rejects an empty metric name and an over-long unit", () => {
    expect(
      createOrgInput.safeParse({
        ...BASE,
        blueprint: { metrics: { builtins: BUILTINS, custom: [{ name: "  " }] } },
      }).success,
    ).toBe(false);
    expect(
      createOrgInput.safeParse({
        ...BASE,
        blueprint: { metrics: { builtins: BUILTINS, custom: [{ name: "Ok", unit: "x".repeat(11) }] } },
      }).success,
    ).toBe(false);
  });

  it("rejects a metrics block missing a builtin flag", () => {
    expect(
      createOrgInput.safeParse({
        ...BASE,
        blueprint: { metrics: { builtins: { attendance: true }, custom: [] } },
      }).success,
    ).toBe(false);
  });
});
