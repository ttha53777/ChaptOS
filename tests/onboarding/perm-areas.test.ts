/**
 * Pure-function tests for the /create roles-step ability areas.
 *
 * The load-bearing invariant: PERM_AREAS is a PARTITION of the real permission
 * bitfield — every MANAGE_* flag lives in exactly one area. If a 15th
 * permission is added to lib/permissions.ts, the completeness check fails
 * until it's homed in an area (and labeled), so the roles screen can never
 * silently hide an ability.
 */

import { describe, expect, it } from "vitest";
import {
  PERM_AREAS,
  PERM_LABELS,
  AREA_PHRASE,
  AREA_DESC,
  activeAreas,
  areaState,
  toggleArea,
  togglePerm,
  roleSummary,
} from "@/lib/onboarding/perm-areas";
import { PERMISSION_LIST, type Permission } from "@/lib/permissions";
import { ALL_WORKFLOWS, type WorkflowId } from "@/lib/org-types";

const ALL_ENABLED: ReadonlySet<WorkflowId> = new Set(ALL_WORKFLOWS);

describe("perm-areas: partition of the bitfield", () => {
  it("areas are disjoint — no permission appears in two areas", () => {
    const seen = new Map<Permission, string>();
    for (const area of PERM_AREAS) {
      for (const p of area.perms) {
        expect(seen.has(p), `${p} is in both "${seen.get(p)}" and "${area.id}"`).toBe(false);
        seen.set(p, area.id);
      }
    }
  });

  it("areas are complete — every real permission is homed in an area", () => {
    const homed = new Set(PERM_AREAS.flatMap(a => [...a.perms]));
    for (const { name } of PERMISSION_LIST) {
      expect(homed.has(name), `${name} has no area — home it in PERM_AREAS`).toBe(true);
    }
    expect(homed.size).toBe(PERMISSION_LIST.length);
  });

  it("every permission has a human label, every area a phrase and description", () => {
    for (const { name } of PERMISSION_LIST) {
      expect(PERM_LABELS[name], `${name} needs a PERM_LABELS entry`).toBeTruthy();
    }
    for (const area of PERM_AREAS) {
      expect(AREA_PHRASE[area.id]).toBeTruthy();
      expect(AREA_DESC[area.id]).toBeTruthy();
    }
  });
});

describe("perm-areas: workflow gating", () => {
  it("all six areas show when every workflow is enabled", () => {
    expect(activeAreas(ALL_ENABLED).map(a => a.id)).toEqual([
      "money", "people", "meetings", "events", "comms", "content",
    ]);
  });

  it("gated areas drop out with their workflows", () => {
    // people + comms are ungated; everything else needs its workflow.
    const ids = activeAreas(new Set<WorkflowId>(["operations"])).map(a => a.id);
    expect(ids).toEqual(["people", "comms"]);
  });

  it("content shows for any of docs/tasks/service", () => {
    for (const w of ["docs", "tasks", "service"] as WorkflowId[]) {
      const ids = activeAreas(new Set<WorkflowId>([w])).map(a => a.id);
      expect(ids, `content should be active with only "${w}"`).toContain("content");
    }
  });
});

describe("perm-areas: state + toggles", () => {
  const events = PERM_AREAS.find(a => a.id === "events")!;

  it("areaState reads off / partial / on", () => {
    expect(areaState([], events)).toBe("off");
    expect(areaState(["MANAGE_EVENTS"], events)).toBe("partial");
    expect(areaState(["MANAGE_EVENTS", "MANAGE_PARTIES"], events)).toBe("on");
  });

  it("toggleArea grants the whole bundle from off or partial, clears it from on", () => {
    const fromOff = toggleArea([], events);
    expect(new Set(fromOff)).toEqual(new Set(["MANAGE_EVENTS", "MANAGE_PARTIES"]));
    const fromPartial = toggleArea(["MANAGE_PARTIES"], events);
    expect(new Set(fromPartial)).toEqual(new Set(["MANAGE_EVENTS", "MANAGE_PARTIES"]));
    expect(toggleArea(fromOff, events)).toEqual([]);
  });

  it("toggles return new arrays and never mutate the input", () => {
    const before: Permission[] = ["MANAGE_EVENTS"];
    toggleArea(before, events);
    togglePerm(before, "MANAGE_DOCS");
    expect(before).toEqual(["MANAGE_EVENTS"]);
  });

  it("togglePerm flips a single flag", () => {
    expect(togglePerm([], "MANAGE_DOCS")).toEqual(["MANAGE_DOCS"]);
    expect(togglePerm(["MANAGE_DOCS"], "MANAGE_DOCS")).toEqual([]);
  });
});

describe("perm-areas: roleSummary", () => {
  it("founder seat runs everything", () => {
    expect(roleSummary([], ALL_ENABLED, true)).toBe("Runs everything — that's you.");
  });

  it("empty seat is along for the ride", () => {
    expect(roleSummary([], ALL_ENABLED)).toMatch(/^Along for the ride/);
  });

  it("lists granted areas as an English clause", () => {
    expect(roleSummary(["MANAGE_TREASURY"], ALL_ENABLED)).toBe("Can handle the money.");
    expect(roleSummary(["MANAGE_TREASURY", "MANAGE_EVENTS"], ALL_ENABLED)).toBe(
      "Can handle the money and plan events.",
    );
    expect(
      roleSummary(["MANAGE_TREASURY", "MANAGE_EVENTS", "MANAGE_DOCS"], ALL_ENABLED),
    ).toBe("Can handle the money, plan events, and keep docs & tasks.");
  });

  it("ignores grants whose area is gated off", () => {
    // Treasury granted but finance workflow disabled → money area hidden.
    const noFinance = new Set<WorkflowId>(["events", "operations"]);
    expect(roleSummary(["MANAGE_TREASURY"], noFinance)).toMatch(/^Along for the ride/);
  });
});
