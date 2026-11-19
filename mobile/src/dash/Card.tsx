/**
 * The web dashboard card (paper-aesthetic.css `.dash .card` / `.card-h`): card face,
 * 1.5 line border, 22 radius, the soft --pp-sh-1 shadow; a header row of a 32pt
 * pastel tile and a display title, with an optional right slot (a count, a link).
 *
 * Motion (native addition): cards rise 12pt and fade in, staggered by `i`, the first
 * time Home shows data. Reduced: a plain fade.
 */
import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "~/icons/Icon";
import { Tile } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function useRise(i: number) {
  const m = useMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = m.reduced ? withTiming(1, m.timing(200, "out")) : withDelay(m.t(60 + i * 55), withSpring(1, m.spring("settle")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reduced = m.reduced;
  return useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 1.3), transform: [{ translateY: reduced ? 0 : 12 * (1 - v.value) }] }));
}

export function DashCard({ icon, tone, title, right, onHead, children, i = 0, style, bodyStyle }: {
  icon: IconName; tone: Tone; title: string;
  right?: ReactNode;
  /** The header opens the full page (the web's card-h link). */
  onHead?: () => void;
  children: ReactNode;
  i?: number;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const rise = useRise(i);
  const head = (
    <View style={styles.head}>
      <Tile icon={icon} tone={tone} size={32} />
      <T v="heading" size={17.3} ls={-0.022} numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">{title}</T>
      <View style={styles.right}>
        {right}
        {onHead && !right ? <Icon name="chev-r" size={15} color={c.ink3} /> : null}
      </View>
    </View>
  );
  return (
    <Animated.View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.sh1 }, rise, style]}>
      {onHead ? <Pressable onPress={onHead} accessibilityRole="button" accessibilityLabel={`${title}, open`}>{head}</Pressable> : head}
      <View style={[styles.body, bodyStyle]}>{children}</View>
    </Animated.View>
  );
}

/** `.card-h .sub`: a mono note on the header's right. */
export function HeadSub({ label, arrow }: { label: string; arrow?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <T v="mono" size={11.5} color={c.ink3}>{label}</T>
      {arrow ? <Icon name="arrow-r" size={12} color={c.ink3} /> : null}
    </View>
  );
}

/** `.count-chip`: a peach dot-pill ("1 left"). */
export function CountChip({ label, tone = "peach" }: { label: string; tone?: Tone }) {
  const { c } = useTheme();
  const p = c.pastel[tone];
  return (
    <View style={[styles.chip, { backgroundColor: p.soft, borderColor: p.border }]}>
      <View style={[styles.dot, { backgroundColor: p.ink }]} />
      <T v="pill" size={11.8} color={p.ink}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 22 },
  head: { flexDirection: "row", alignItems: "center", gap: 11, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 12 },
  right: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 },
  body: { paddingHorizontal: 18, paddingBottom: 18, gap: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
