/**
 * The web Create sheet's grid (mobile-shell.css `.mcr-grid` / `.mcr-it` / `.mcr-hero`),
 * shared by Create and by More's page grid (the sidebar's replacement in the app).
 *
 *   .mcr-grid   three columns, 9pt gaps; a short last row stays left-aligned
 *   .mcr-it     paper face, 1.5 line border, 16 radius, padding 16/6/13; a 40pt pastel
 *               tile (12 radius, 19pt glyph) over an Inter 600 .8rem label; pressed =
 *               ink border on card
 *   .mcr-hero   an inked ticket above the grid with a lilac hard shadow
 *
 * Motion (native addition): tiles rise 14pt and fade in, 40ms apart, when `shown` turns
 * on; a press scales the tile to .96 and springs back. Reduced: they fade in together.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "~/icons/Icon";
import { Tile } from "~/paper/bits";
import { alpha, type Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

export function TileGrid({ children, count }: { children: ReactNode; count: number }) {
  return (
    <View style={styles.grid}>
      {children}
      {Array.from({ length: (3 - (count % 3)) % 3 }, (_, i) => <View key={`f${i}`} style={styles.cell} />)}
    </View>
  );
}

export interface GridTileProps {
  label: string;
  icon: IconName;
  tone: Tone;
  onPress: () => void;
  /** Index for the stagger. */
  i: number;
  /** Arrive (true) / reset (false). Leave undefined to show without an entrance. */
  shown?: boolean;
  /** A count that needs you (the web's `.mtb-badge`, peach; `rose` for overdue). */
  badge?: number;
  badgeTone?: "peach" | "rose";
  accessibilityHint?: string;
}

export function GridTile({ label, icon, tone, onPress, i, shown, badge = 0, badgeTone = "peach", accessibilityHint }: GridTileProps) {
  const { c } = useTheme();
  const m = useMotion();
  const enter = useSharedValue(shown === undefined ? 1 : 0);
  const press = useSharedValue(0);
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (shown === undefined) return;
    if (!shown) { enter.value = 0; return; }
    enter.value = m.reduced
      ? withTiming(1, m.timing(180, "out"))
      : withDelay(m.t(90 + i * 40), withSpring(1, m.spring("settle")));
  }, [shown, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const reduced = m.reduced;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.4),
    transform: [{ translateY: reduced ? 0 : 14 * (1 - enter.value) }, { scale: 1 - 0.04 * press.value }],
  }));
  const pressIn = m.timing(80, "out");
  const pressOut = m.timing(reduced ? 90 : 240, "spring");

  return (
    <Animated.View style={[styles.cell, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { setDown(true); press.value = withTiming(1, pressIn); }}
        onPressOut={() => { setDown(false); press.value = withTiming(0, pressOut); }}
        accessibilityRole="button"
        accessibilityLabel={badge > 0 ? `${label}, ${badge} need${badge === 1 ? "s" : ""} you` : label}
        accessibilityHint={accessibilityHint}
        style={[styles.tile, { borderColor: down ? c.ink : c.line, backgroundColor: down ? c.card : c.paper }]}
      >
        <View>
          <Tile icon={icon} tone={tone} size={40} />
          {badge > 0 ? (
            <View style={[styles.badge, { backgroundColor: c.note.fill[badgeTone], borderColor: c.paper }]}>
              <T v="pill" size={9.6} color={c.note.ink} style={styles.badgeT}>{badge > 9 ? "9+" : String(badge)}</T>
            </View>
          ) : null}
        </View>
        <T v="callout" size={12.8} numberOfLines={1} style={styles.label}>{label}</T>
      </Pressable>
    </Animated.View>
  );
}

/** `.mcr-hero`: the inked ticket over the grid (Open check-in). */
export function GridHero({ title, line, icon, onPress, shown }: { title: string; line: string; icon: IconName; onPress: () => void; shown?: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const enter = useSharedValue(shown === undefined ? 1 : 0);
  useEffect(() => {
    if (shown === undefined) return;
    if (!shown) { enter.value = 0; return; }
    enter.value = m.reduced ? withTiming(1, m.timing(180, "out")) : withDelay(m.t(50), withSpring(1, m.spring("settle")));
  }, [shown, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const reduced = m.reduced;
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.4), transform: [{ translateY: reduced ? 0 : 12 * (1 - enter.value) }] }));
  return (
    <Animated.View style={[{ marginBottom: 12 }, style]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${line}`}
        style={({ pressed }) => [styles.hero, { backgroundColor: c.ink, borderColor: c.ink, boxShadow: `${pressed ? 1 : 3}px ${pressed ? 1 : 3}px 0 ${c.pastel.lilac.fill}` },
          pressed && { transform: [{ translateX: 1.5 }, { translateY: 1.5 }] }]}>
        <Icon name={icon} size={20} color={c.paper} />
        <View style={{ flex: 1, gap: 1 }}>
          <T v="subhead" size={16.3} color={c.paper}>{title}</T>
          <T v="meta" size={12.2} color={alpha(c.paper, 0.72)}>{line}</T>
        </View>
        <Icon name="arrow-r" size={16} color={alpha(c.paper, 0.7)} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  cell: { flexBasis: "30%", flexGrow: 1 },
  tile: { alignItems: "center", gap: 9, paddingTop: 16, paddingBottom: 13, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1.5 },
  label: { fontFamily: "Inter-600", textAlign: "center" },
  badge: { position: "absolute", top: -6, right: -8, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  badgeT: { fontFamily: "Inter-700", lineHeight: 12 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1.5 },
});
