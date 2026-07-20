/**
 * Pure-function tests for the org-types registry. Validates the shape and
 * registry semantics. Provisioning behavior (applying a template to a fresh
 * org) is tested at the service level once Milestone 3 lands.
 */

import { describe, expect, it } from "vitest";
import {
  ORG_TYPES,
  ORG_TYPE_IDS,
  ALL_WORKFLOWS,
  DEFAULT_EVENT_TYPE_SEEDS,
  getOrgType,
  isOrgTypeId,
  type EventTypeSeed,
} from "@/lib/org-types";
import { BUILTIN_EVENT_TYPES } from "@/lib/event-types";
import { CATEGORY_SLUG_RE } from "@/lib/validation/calendar";

describe("org-types: registry", () => {
  it("exposes at least the three v1 templates", () => {
    expect(ORG_TYPE_IDS).toEqual(expect.arrayContaining(["fraternity", "generic-club", "generic-org"]));
  });

  it("fraternity template enables the full chapter set, minus start-light surfaces", () => {
    const t = getOrgType("fraternity");
    expect(t).not.toBeNull();
    // communications + tasks start OFF (the group chat covers both at first);
    // everything else a chapter runs on is on from day one.
    expect(new Set(t!.enabledWorkflows)).toEqual(
      new Set(ALL_WORKFLOWS.filter(w => w !== "communications" && w !== "tasks")),
    );
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

describe("org-types: starter event-type seeds", () => {
  const HEX_RE = /^#[0-9a-f]{6}$/;
  const BUILTIN_SLUGS = new Set(BUILTIN_EVENT_TYPES.map(t => t.slug));

  // Every named list of seeds that ships: each template's own set (if present)
  // plus the shared fallback.
  const namedLists: Array<{ name: string; seeds: readonly EventTypeSeed[] }> = [
    { name: "DEFAULT_EVENT_TYPE_SEEDS", seeds: DEFAULT_EVENT_TYPE_SEEDS },
    ...ORG_TYPES.flatMap(t => (t.eventTypeSeeds ? [{ name: t.id, seeds: t.eventTypeSeeds }] : [])),
  ];

  it("every provisioned org resolves to at least one starter category", () => {
    // The seed used at provisionOrg is `template.eventTypeSeeds ?? DEFAULT`.
    for (const t of ORG_TYPES) {
      const resolved = t.eventTypeSeeds ?? DEFAULT_EVENT_TYPE_SEEDS;
      expect(resolved.length, `template ${t.id} resolves to no starter categories`).toBeGreaterThan(0);
    }
  });

  it("seed slugs are kebab-case, unique per list, and never collide with a built-in", () => {
    for (const { name, seeds } of namedLists) {
      const seen = new Set<string>();
      for (const s of seeds) {
        expect(CATEGORY_SLUG_RE.test(s.slug), `${name}: slug "${s.slug}" is not kebab-case`).toBe(true);
        expect(seen.has(s.slug), `${name}: duplicate slug "${s.slug}"`).toBe(false);
        seen.add(s.slug);
        expect(BUILTIN_SLUGS.has(s.slug), `${name}: slug "${s.slug}" collides with a built-in`).toBe(false);
      }
    }
  });

  it("seed colors are valid 6-digit hex in both themes", () => {
    for (const { name, seeds } of namedLists) {
      for (const s of seeds) {
        expect(HEX_RE.test(s.color), `${name}/${s.slug}: bad color ${s.color}`).toBe(true);
        expect(HEX_RE.test(s.colorDark), `${name}/${s.slug}: bad colorDark ${s.colorDark}`).toBe(true);
      }
    }
  });
});
