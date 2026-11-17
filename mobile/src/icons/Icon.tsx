/**
 * One hand-drawn glyph from the web's Paper sprite (generated into ./glyphs.ts by
 * `npm run gen:icons`). Strokes use currentColor, which react-native-svg resolves
 * from the `color` prop, so an icon takes the ink of whatever it sits in.
 */
import { memo, type ReactNode } from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { useTheme } from "~/theme/PaperProvider";
import { GLYPHS, type GlyphName, type GlyphNode } from "./glyphs";

export type { GlyphName as IconName } from "./glyphs";

const EL = { path: Path, circle: Circle, rect: Rect, g: G } as const;

function draw(nodes: ReadonlyArray<GlyphNode>, prefix: string): ReactNode[] {
  return nodes.map(([tag, attrs, kids], i) => {
    const C = EL[tag] as React.ComponentType<Record<string, unknown>>;
    const key = `${prefix}${i}`;
    return <C key={key} {...attrs}>{kids ? draw(kids, `${key}.`) : null}</C>;
  });
}

export const Icon = memo(function Icon({ name, size = 18, color }: { name: GlyphName; size?: number; color?: string }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" color={color ?? c.ink} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {draw(GLYPHS[name], "")}
    </Svg>
  );
});
