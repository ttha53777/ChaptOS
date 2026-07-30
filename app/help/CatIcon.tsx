import { Doodle, sx } from "../components/landing/Doodle";

/**
 * The pastel chip a help category wears in every listing.
 *
 * Its own module rather than a member of Blocks.tsx because the client-side
 * browser needs it: importing it from there would pull the whole article
 * renderer (and the inline parser) into the browser bundle for one 38px square.
 *
 * `tint` is a pastel family name from landing.css — "sky" resolves --sky-soft
 * for the fill, --sky for the border and --sky-ink for the stroke. The symbols
 * carry stroke="currentColor" as a presentation attribute, so the colour has to
 * arrive as an inherited `color` (see Doodle's header comment).
 */
export function CatIcon({
  doodle,
  tint,
  size = 20,
}: {
  doodle: string;
  tint: string;
  size?: number;
}) {
  return (
    <span
      className="hc__ic"
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
