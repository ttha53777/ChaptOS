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
