/**
 * "Hand out dues" target resolution (lib/dues-targets.ts).
 *
 * Pure module, no DB. The sheet's receipt and the server both run it, so what
 * these pin is also the promise the receipt makes: role rates stack, splits are
 * exact to the penny, and "skip them" really leaves duplicates off.
 */

import { describe, expect, it } from "vitest";
import { audienceLabel, resolveTargets, sameChargeName, splitCents, type TargetMember } from "@/lib/dues-targets";

const TREASURER = 11, SOCIAL = 12, NEW_MEMBER = 13;
const roster: TargetMember[] = [
  { brotherId: 1, name: "Priya Shah",    roleIds: [] },
  { brotherId: 2, name: "Dev Okafor",    roleIds: [TREASURER, SOCIAL] },
  { brotherId: 3, name: "Jordan Tao",    roleIds: [SOCIAL] },
  { brotherId: 4, name: "Ezra Quinn",    roleIds: [NEW_MEMBER] },
  { brotherId: 5, name: "Maya Rivera",   roleIds: [] },
];
const amounts = (r: ReturnType<typeof resolveTargets>) => Object.fromEntries(r.lines.map(l => [l.brotherId, l.amountCents]));

describe("splitCents", () => {
  it("gives the leftover pennies to the first people", () => {
    expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitCents(10002, 3)).toEqual([3334, 3334, 3334]);
    expect(splitCents(5, 3)).toEqual([2, 2, 1]);
  });
  it("always sums back to the total", () => {
    for (const [t, n] of [[999, 7], [12345, 52], [1, 4], [100000, 13]]) {
      expect(splitCents(t, n).reduce((a, b) => a + b, 0)).toBe(t);
    }
  });
  it("is empty for nobody", () => {
    expect(splitCents(1000, 0)).toEqual([]);
  });
});

describe("resolveTargets: everyone", () => {
  it("bills the whole roster one amount", () => {
    const r = resolveTargets({ kind: "all", amount: { mode: "each", cents: 14000 }, exclude: [] }, roster, { name: "Fall dues" });
    expect(r.lines).toHaveLength(5);
    expect(r.totalCents).toBe(70000);
    expect(r.selected).toBe(5);
  });

  it("leaves out excluded people", () => {
    const r = resolveTargets({ kind: "all", amount: { mode: "each", cents: 14000 }, exclude: [2, 5] }, roster, { name: "Fall dues" });
    expect(Object.keys(amounts(r)).map(Number).sort()).toEqual([1, 3, 4]);
  });

  it("splits a total exactly, pennies to the first names alphabetically", () => {
    const r = resolveTargets({ kind: "all", amount: { mode: "split", totalCents: 10000 }, exclude: [1, 4] }, roster, { name: "Retreat" });
    // Dev, Jordan, Maya in name order.
    expect(amounts(r)).toEqual({ 2: 3334, 3: 3333, 5: 3333 });
    expect(r.totalCents).toBe(10000);
  });
});

describe("resolveTargets: pick", () => {
  it("bills only the picked people", () => {
    const r = resolveTargets({ kind: "pick", amount: { mode: "each", cents: 2500 }, brotherIds: [3, 5] }, roster, { name: "Late fine" });
    expect(amounts(r)).toEqual({ 3: 2500, 5: 2500 });
  });

  it("ignores ids not on the roster", () => {
    const r = resolveTargets({ kind: "pick", amount: { mode: "each", cents: 2500 }, brotherIds: [3, 999] }, roster, { name: "Late fine" });
    expect(amounts(r)).toEqual({ 3: 2500 });
  });

  it("drops zero-cent shares from a split too small to go round", () => {
    const r = resolveTargets({ kind: "pick", amount: { mode: "split", totalCents: 2 }, brotherIds: [1, 2, 3] }, roster, { name: "x" });
    expect(r.lines).toHaveLength(2);
    expect(r.totalCents).toBe(2);
  });
});

describe("resolveTargets: by role", () => {
  it("stacks the rates of every role a member holds", () => {
    const r = resolveTargets({ kind: "role", rates: [{ key: TREASURER, amountCents: 6000 }, { key: SOCIAL, amountCents: 4000 }] }, roster, { name: "Officer dues" });
    expect(amounts(r)).toEqual({ 2: 10000, 3: 4000 });
    expect(r.stacked).toBe(1);
    expect(r.lines.find(l => l.brotherId === 2)!.parts).toEqual([
      { key: TREASURER, amountCents: 6000 },
      { key: SOCIAL, amountCents: 4000 },
    ]);
  });

  it("bills members with no role through the 'none' row", () => {
    const r = resolveTargets({ kind: "role", rates: [{ key: "none", amountCents: 14000 }, { key: NEW_MEMBER, amountCents: 9000 }] }, roster, { name: "Fall dues" });
    expect(amounts(r)).toEqual({ 1: 14000, 5: 14000, 4: 9000 });
  });

  it("adds the 'base' row on top of everyone's role rates", () => {
    const r = resolveTargets({ kind: "role", rates: [{ key: "base", amountCents: 10000 }, { key: TREASURER, amountCents: 5000 }] }, roster, { name: "Fall dues" });
    expect(amounts(r)).toEqual({ 1: 10000, 2: 15000, 3: 10000, 4: 10000, 5: 10000 });
    expect(r.stacked).toBe(1);
  });
});

describe("duplicates", () => {
  const existing = [{ chargeId: 7, name: "Fall dues", brotherIds: new Set([1, 2]) }];
  const spec = { kind: "all" as const, amount: { mode: "each" as const, cents: 14000 }, exclude: [] };

  it("matches names regardless of case and spacing", () => {
    expect(sameChargeName("  fall   DUES ", "Fall dues")).toBe(true);
    expect(sameChargeName("Fall dues 2", "Fall dues")).toBe(false);
  });

  it("skips people who already have a same-named charge by default", () => {
    const r = resolveTargets(spec, roster, { name: "fall dues", existing });
    expect(r.duplicateOf).toBe(7);
    expect(r.already.sort()).toEqual([1, 2]);
    expect(r.skipped.sort()).toEqual([1, 2]);
    expect(r.lines.map(l => l.brotherId).sort()).toEqual([3, 4, 5]);
    expect(r.selected).toBe(5);
  });

  it("bills them again when asked", () => {
    const r = resolveTargets(spec, roster, { name: "Fall dues", existing, onDuplicate: "bill" });
    expect(r.already.sort()).toEqual([1, 2]);
    expect(r.skipped).toEqual([]);
    expect(r.lines).toHaveLength(5);
  });

  it("splits the total among the people actually billed after a skip", () => {
    const r = resolveTargets({ kind: "all", amount: { mode: "split", totalCents: 9000 }, exclude: [] }, roster, { name: "Fall dues", existing });
    expect(r.lines).toHaveLength(3);
    expect(r.totalCents).toBe(9000);
  });

  it("finds no duplicate for an unnamed or new charge", () => {
    expect(resolveTargets(spec, roster, { name: "", existing }).duplicateOf).toBeNull();
    expect(resolveTargets(spec, roster, { name: "Spring dues", existing }).duplicateOf).toBeNull();
  });
});

describe("audienceLabel", () => {
  const roleName = (id: number) => ({ [TREASURER]: "Treasurer" } as Record<number, string>)[id];
  it("names the audience for the stub", () => {
    expect(audienceLabel({ kind: "all", amount: { mode: "each", cents: 1 }, exclude: [] }, 5, roleName)).toBe("Everyone");
    expect(audienceLabel({ kind: "all", amount: { mode: "each", cents: 1 }, exclude: [1, 2] }, 3, roleName)).toBe("Everyone but 2");
    expect(audienceLabel({ kind: "pick", amount: { mode: "each", cents: 1 }, brotherIds: [1] }, 1, roleName)).toBe("1 person");
    expect(audienceLabel({ kind: "pick", amount: { mode: "each", cents: 1 }, brotherIds: [1, 2, 3] }, 3, roleName)).toBe("3 people");
    expect(audienceLabel({ kind: "role", rates: [{ key: TREASURER, amountCents: 1 }] }, 1, roleName)).toBe("Treasurer");
    expect(audienceLabel({ kind: "role", rates: [{ key: "none", amountCents: 1 }] }, 2, roleName)).toBe("Members with no role");
    expect(audienceLabel({ kind: "role", rates: [{ key: TREASURER, amountCents: 1 }, { key: SOCIAL, amountCents: 1 }] }, 2, roleName)).toBe("By role");
  });
});
