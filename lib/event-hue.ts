/**
 * An event category's colour in the Paper aesthetic. The categories the mock
 * names get its exact pastel family; any other type mixes ink / fill / soft /
 * border from the org's own hex, so a custom type still reads as itself.
 *
 * One map for every surface that colours an event (Timeline spine, Ask Chapt
 * answers, the dashboard's Up next), so the same event is the same colour
 * everywhere. Pure and client-safe: emits CSS custom properties only.
 */

export const PAPER_HUE: Record<string, string> = {
  chapter: "sky", social: "butter", service: "mint", fundraiser: "mint",
  program: "lilac", party: "rose", deadline: "peach",
};

/** `--pcc` ink, `--pcf` fill, `--pcs` soft wash, `--pcb` border, for a category slug and its hex. */
export function paperCatVars(slug: string | null | undefined, color: string): Record<string, string> {
  const hue = slug ? PAPER_HUE[slug] : undefined;
  return {
    "--pcc": hue ? `var(--pp-${hue}-ink)` : `color-mix(in srgb, ${color} 82%, var(--ink))`,
    "--pcf": hue ? `var(--pp-${hue})`     : `color-mix(in srgb, ${color} 38%, var(--card))`,
    "--pcs": hue ? `var(--pp-${hue}-soft)` : `color-mix(in srgb, ${color} 10%, var(--card))`,
    "--pcb": hue ? `var(--pp-${hue}-bd)`  : `color-mix(in srgb, ${color} 30%, var(--card))`,
  };
}
