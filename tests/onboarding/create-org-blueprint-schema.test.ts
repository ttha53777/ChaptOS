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
