/**
 * The ink pill (`.btn` in the mock). The hard shadow is a sibling layer and the face
 * is what moves: pressing slides the face 2px into its shadow (3px → 1px visible), so
 * the press is a transform, not an animated boxShadow.
 *
 *   ink    ink face, paper text, lilac shadow (default)
 *   ghost  card face, ink text, peach shadow
 *   soft   no fill, no shadow, hairline border: tertiary actions
 */
import { type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics, type HapticName } from "~/motion/haptics";
import { DUR } from "~/motion/motion";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "ink" | "ghost" | "soft";
  size?: "md" | "sm";
  /** Shadow pastel. Defaults: ink → lilac, ghost → peach. */
  tone?: Tone;
  icon?: IconName;
  block?: boolean;
  disabled?: boolean;
  /** Only for presses that commit something; plain buttons stay silent. */
  haptic?: HapticName;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Button({ label, onPress, variant = "ink", size = "md", tone, icon, block, disabled, haptic, accessibilityHint, style }: ButtonProps) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);

  const off = size === "sm" ? 2 : 3;
  const shadowTone = tone ?? (variant === "ghost" ? "peach" : "lilac");
  const face = variant === "ink" ? c.ink : variant === "ghost" ? c.card : "transparent";
  const fg = variant === "ink" ? c.paper : variant === "ghost" ? c.ink : c.ink2;
  const border = variant === "soft" ? c.line2 : c.ink;

  const faceStyle = useAnimatedStyle(() => {
    if (variant === "soft") return { transform: [{ scale: 1 - press.value * 0.03 }] };
    const d = press.value * (off - 1);
    return { transform: [{ translateX: d }, { translateY: d }] };
  });

  const down = () => { press.value = withTiming(1, m.timing(m.reduced ? 1 : DUR.tap * 0.6, "spring")); };
  const up = () => { press.value = withTiming(0, m.timing(m.reduced ? 1 : DUR.tap * 1.4, "spring")); };

  return (
    <Pressable
      onPressIn={down}
      onPressOut={up}
      onPress={() => { if (haptic) haptics[haptic](); onPress?.(); }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={size === "sm" ? 8 : 4}
      style={[block ? styles.block : styles.inline, disabled && styles.disabled, style]}
    >
      {variant !== "soft" && !disabled && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.pill, { backgroundColor: c.pastel[shadowTone].fill, borderColor: c.pastel[shadowTone].fill, transform: [{ translateX: off }, { translateY: off }] }]}
        />
      )}
      <Animated.View
        style={[
          styles.pill,
          size === "sm" ? styles.sm : styles.md,
          { backgroundColor: face, borderColor: border },
          faceStyle,
        ]}
      >
        {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} color={fg} />}
        <T v={size === "sm" ? "buttonSm" : "button"} color={fg} numberOfLines={1}>{label}</T>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inline: { alignSelf: "flex-start" },
  block: { alignSelf: "stretch" },
  disabled: { opacity: 0.38 },
  pill: { borderRadius: 999, borderWidth: 1.5 },
  md: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 18, minHeight: 46 },
  sm: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 13, minHeight: 34 },
});
