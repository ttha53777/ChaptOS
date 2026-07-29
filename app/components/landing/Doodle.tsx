import type { CSSProperties } from "react";

/**
 * Inline CSS custom properties in a style object. React's CSSProperties doesn't
 * admit `--foo` keys, and the landing markup sets one on ~100 elements
 * (--d, --rot, --eb, --mark, --a, --av, --hb-y, …), so cast in one place.
 */
export const sx = (o: Record<string, string | number>) => o as CSSProperties;

type DoodleProps = {
  /** Symbol name without the `d-` prefix, e.g. "check" → #d-check. */
  id: string;
  /** Sets both width and height. Omit when CSS sizes the icon. */
  size?: number | string;
  viewBox?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * One glyph from the sprite in <DoodleSprite />.
 *
 * The symbols carry `stroke="currentColor"` as a presentation attribute, so the
 * only thing that colours them is an inherited `color` — document CSS can't
 * select into a <use> shadow tree. That's why callers pass `style={sx({ color:
 * "var(--mint-ink)" })}` rather than a stroke class.
 */
export function Doodle({ id, size, viewBox, className, style }: DoodleProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      style={style}
      aria-hidden="true"
    >
      <use href={`#d-${id}`} />
    </svg>
  );
}
