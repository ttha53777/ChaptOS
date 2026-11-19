/**
 * Text on paper. Pick a style from the type scale (`v`), optionally a colour; the
 * palette's ink is the default. Font scaling is computed here, not by the OS, so each
 * style's Dynamic Type cap holds and the Motion Lab can simulate XXL / AX sizes.
 */
import { useMemo } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { useFontScale, useTheme } from "~/theme/PaperProvider";
import { resolveType, type TypeName } from "~/theme/type";

export interface TProps extends TextProps {
  v?: TypeName;
  color?: string;
  align?: TextStyle["textAlign"];
  /** A web-exact size in px (rem × 16) on this style's face: still follows Dynamic Type
   *  up to the style's cap, with the style's line height and tracking scaled to it. */
  size?: number;
  /** Tracking in em for `size`, when the web rule differs from the style's. */
  ls?: number;
  /** Line height as a multiple, when the web rule differs from the style's. */
  lh?: number;
}

export function T({ v = "body", color, align, style, size, ls, lh, ...rest }: TProps) {
  const scale = useFontScale();
  const { c } = useTheme();
  const base = useMemo(() => resolveType(v, scale, size, ls, lh), [v, scale, size, ls, lh]);
  return (
    <Text
      allowFontScaling={false}
      {...rest}
      style={[base, { color: color ?? c.ink }, align ? { textAlign: align } : null, style]}
    />
  );
}
