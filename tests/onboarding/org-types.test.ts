/**
 * Pure-function tests for the org-types registry. Validates the shape and
 * registry semantics. Provisioning behavior (applying a template to a fresh
 * org) is tested at the service level once Milestone 3 lands.
 */

import { describe, expect, it } from "vitest";
import { ORG_TYPES, ORG_TYPE_IDS, ALL_WORKFLOWS, getOrgType, isOrgTypeId } from "@/lib/org-types";

describe("org-types: registry", () => {
  it("exposes at least the three v1 templates", () => {
    expect(ORG_TYPE_IDS).toEqual(expect.arrayContaining(["fraternity", "generic-club", "generic-org"]));
  });

  it("fraternity template enables every workflow", () => {
    const t = getOrgType("fraternity");
    expect(t).not.toBeNull();
    expect(new Set(t!.enabledWorkflows)).toEqual(new Set(ALL_WORKFLOWS));
  });

  it("generic-org has the most minimal workflow set", () => {
    const t = getOrgType("generic-org")!;
    expect(t.enabledWorkflows.length).toBeLessThan(ALL_WORKFLOWS.length);
    expect(t.enabledWorkflows).toContain("members");
    expect(t.enabledWorkflows).not.toContain("parties");
    expect(t.enabledWorkflows).not.toContain("finance");
  });

  it("every template seeds at least one role with rank 100 + all permissions", () => {
    for (const t of ORG_TYPES) {
      const founder = t.roleSeeds.find(r => r.all && r.rank === 100);
      expect(founder, `template ${t.id} must seed a founder role`).toBeDefined();
    }
  });

  it("getOrgType returns null for unknown ids", () => {
    expect(getOrgType("not-a-real-type")).toBeNull();
    expect(getOrgType(null)).toBeNull();
    expect(getOrgType(undefined)).toBeNull();
  });

  it("isOrgTypeId matches the registry", () => {
    expect(isOrgTypeId("fraternity")).toBe(true);
    expect(isOrgTypeId("nope")).toBe(false);
  });

  it("workflow ids referenced by templates are all known", () => {
    const known = new Set<string>(ALL_WORKFLOWS);
    for (const t of ORG_TYPES) {
      for (const w of t.enabledWorkflows) {
        expect(known.has(w), `template ${t.id} references unknown workflow ${w}`).toBe(true);
      }
    }
  });
});
