/**
 * Resolving an event type's colour and glyph from the ORG's own type table.
 *
 * This replaces four separate lookup maps that were keyed on English display
 * labels — "Program", "Social", "Fundraiser", "Community Service". Any org that
 * renamed a type, or added one of its own, fell straight through to grey in all
 * four places, which made the per-org event-type system look broken from the
 * outside. Keying on `slug` fixes that: the slug is the value stored on the
 * event, it never changes, and the colour travels with the org's definition.
 *
 * PURE MODULE — no imports beyond types. Reached from the client tree.
 */

import type { CalEventType } from "../../data";

export interface TypeVisual {
  /** Hex, already resolved for the dusk surface. */
  hex: string;
  /** Two-letter mark for the card's corner. */
  glyph: string;
  label: string;
}

/** Anything the org hasn't defined reads as deliberately neutral, not broken. */
const FALLBACK: TypeVisual = { hex: "#6b6354", glyph: "··", label: "Other" };

/** First two letters of the first two words: "Community Service" → "CS". */
export function glyphFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return FALLBACK.glyph;
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

/**
 * Build a slug → visual lookup.
 *
 * The events page holds the org's `CalEventType[]` already, so this costs
 * nothing extra; pass the result down rather than re-deriving per card.
 */
export function makeTypeVisuals(types: readonly CalEventType[]): Map<string, TypeVisual> {
  const map = new Map<string, TypeVisual>();
  for (const t of types) {
    map.set(t.slug, {
      // colorDark is the dusk-surface variant; color is the light default.
      hex: t.colorDark ?? t.color ?? FALLBACK.hex,
      glyph: glyphFor(t.label),
      label: t.label,
    });
  }
  return map;
}

/** Look one up, tolerating a slug the org has since deleted. */
export function typeVisual(visuals: Map<string, TypeVisual> | undefined, slug: string): TypeVisual {
  return visuals?.get(slug) ?? FALLBACK;
}
