/**
 * Coverage guard for the seat palette's light-theme twins.
 *
 * A seat's `color` is persisted (draftSchema → Role.color) and was picked for
 * dark surfaces, so the /create flow's ivory theme maps it at render time via
 * roleToneIvory(). That map is keyed by hex, which means a new org type shipping
 * an unmapped hue would silently fall through to the raw Tailwind-500 value and
 * paint a 2:1 monogram on ivory paper. This test is what stops that: every hue
 * the product can actually seed must have an entry.
 */

import { describe, expect, it } from "vitest";
import { ROLE_COLORS, ROLE_TONE_IVORY, SEAT_POOL, roleToneIvory } from "@/lib/onboarding/seats";
import { ORG_TYPES } from "@/lib/org-types";

/** Every seat color the product can hand a founder, from all three sources. */
function seedableRoleColors(): string[] {
  const out = new Set<string>(ROLE_COLORS);
  for (const t of ORG_TYPES) for (const r of t.roleSeeds) out.add(r.color);
  for (const pool of Object.values(SEAT_POOL)) for (const s of pool) out.add(s.color);
  return [...out];
}

/** WCAG 2.x contrast ratio. */
function contrast(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [a, b] = [lum(hexA), lum(hexB)].sort((x, y) => y - x) as [number, number];
  return (a + 0.05) / (b + 0.05);
}

const IVORY_PAPER = "#faf9f6";

describe("roleToneIvory", () => {
  it("maps every seat color the product can seed", () => {
    const unmapped = seedableRoleColors().filter(c => !ROLE_TONE_IVORY[c.toLowerCase()]);
    expect(unmapped, `add these to ROLE_TONE_IVORY: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("is case-insensitive and passes unknown hexes through unchanged", () => {
    expect(roleToneIvory("#F59E0B")).toBe(roleToneIvory("#f59e0b"));
    expect(roleToneIvory("#123456")).toBe("#123456");
  });

  it("never maps a hue onto another hue's tone", () => {
    const tones = Object.values(ROLE_TONE_IVORY);
    expect(new Set(tones).size).toBe(tones.length);
  });

  it("clears the 3:1 non-text contrast bar on ivory paper", () => {
    for (const raw of seedableRoleColors()) {
      const ratio = contrast(roleToneIvory(raw), IVORY_PAPER);
      expect(ratio, `${raw} → ${roleToneIvory(raw)} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("improves on the raw hue for every warm color that failed", () => {
    // The two that drove this map: #F59E0B (2.08:1) and #10B981 (2.45:1).
    for (const raw of ["#F59E0B", "#10B981"]) {
      expect(contrast(roleToneIvory(raw), IVORY_PAPER)).toBeGreaterThan(
        contrast(raw, IVORY_PAPER),
      );
    }
  });
});
