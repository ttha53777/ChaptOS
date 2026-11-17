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
}

export function T({ v = "body", color, align, style, ...rest }: TProps) {
  const scale = useFontScale();
  const { c } = useTheme();
  const base = useMemo(() => resolveType(v, scale), [v, scale]);
  return (
    <Text
      allowFontScaling={false}
      {...rest}
      style={[base, { color: color ?? c.ink }, align ? { textAlign: align } : null, style]}
    />
  );
}
