/**
 * A paper switch (the web's `.cef-sw`): an inked track with a card knob. On, the track
 * fills with the tone's pastel and the knob slides right with the settle spring.
 * Reduced motion: the knob doesn't travel; it fades out at one end and in at the other.
 * One tap haptic per flip (a toggle commits).
 */
import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptics } from "~/motion/haptics";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";

const W = 46, H = 28, K = 20, PAD = (H - K) / 2 - 1.5;

export function Switch({ value, onChange, tone = "mint", label, disabled }: {
  value: boolean; onChange: (v: boolean) => void; tone?: Tone; label: string; disabled?: boolean;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    on.value = m.reduced ? withTiming(value ? 1 : 0, m.timing(160, "out")) : withSpring(value ? 1 : 0, m.spring("settle"));
  }, [value, m]); // eslint-disable-line react-hooks/exhaustive-deps

  // the pastel fill is its own layer, faded in: per-frame work stays opacity/transform
  const fill = useAnimatedStyle(() => ({ opacity: on.value }));
  const travel = W - K - PAD * 2 - 3;
  const knob = useAnimatedStyle(() => (m.reduced
    ? { opacity: Math.abs(on.value - 0.5) * 2, transform: [{ translateX: on.value > 0.5 ? travel : 0 }] }
    : { transform: [{ translateX: travel * on.value }] }));

  return (
    <Pressable
      onPress={() => { if (disabled) return; haptics.tap(); onChange(!value); }}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View style={[styles.track, { borderColor: c.ink, backgroundColor: c.paper2 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.note.fill[tone], borderRadius: H / 2 }, fill]} />
        <Animated.View style={[styles.knob, { backgroundColor: c.card, borderColor: c.ink }, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, borderWidth: 1.5, padding: PAD, justifyContent: "center", overflow: "hidden" },
  knob: { width: K, height: K, borderRadius: K / 2, borderWidth: 1.5 },
});
