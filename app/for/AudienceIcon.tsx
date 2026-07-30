import { Doodle, sx } from "../components/landing/Doodle";
import type { Tint } from "./content";

/**
 * The pastel chip an audience wears everywhere it's named — on the index cards,
 * and on the "not quite you?" pills at the foot of every audience page.
 *
 * Sibling of app/help/CatIcon.tsx and the same contract: `tint` is a pastel
 * family from landing.css, so "sky" resolves --sky-soft for the fill, --sky for
 * the border and --sky-ink for the stroke. The sprite symbols carry
 * stroke="currentColor" as a presentation attribute, so the colour has to
 * arrive as an inherited `color` (see Doodle's header comment).
 */
export function AudienceIcon({
  doodle,
  tint,
  size = 21,
}: {
  doodle: string;
  tint: Tint;
  size?: number;
}) {
  return (
    <span
      className="fr__ic"
      style={sx({ "--g": `var(--${tint}-soft)`, "--gb": `var(--${tint})` })}
    >
      <Doodle
        id={doodle}
        className="doodle doodle--thin"
        size={size}
        viewBox="0 0 24 24"
        style={sx({ color: `var(--${tint}-ink)` })}
      />
    </span>
  );
}
