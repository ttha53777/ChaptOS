/**
 * One page on More's map: a card washed in the page's pastel, an inked, tilted tile
 * with the page's glyph, the page's name, and its live line (the next meeting, the cash
 * on hand…). A count that needs you sits on the corner as a badge.
 *
 * Motion: cards rise into place once, 35ms apart, when More first mounts (tabs mount on
 * first visit and stay, so this is a one-time arrival, not a replay per visit). A press
 * sinks the card 1.5pt and straightens the tile, then springs back. Reduced motion: no
 * arrival, press is an instant border change.
 * Haptics: none. Opening a page is navigation.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "~/icons/Icon";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";

const TILTS = [-5, 4, -3, 5, -4, 3, -6, 4, -3];

export function PageDoor({ title, icon, tone, line, warn, badge = 0, badgeTone = "peach", wide, i, onPress }: {
  title: string;
  icon: IconName;
  tone: Tone;
  /** The live line; null while it loads (a quiet bar holds its place). */
  line: string | null;
  /** Inks the line in rose (overdue). */
  warn?: boolean;
  badge?: number;
  badgeTone?: "peach" | "rose";
  /** Spans both columns (the odd one out at the end of a group). */
  wide?: boolean;
  /** Position on the map, for the arrival stagger and the tile's tilt. */
  i: number;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const reduced = m.reduced;
  const tilt = TILTS[i % TILTS.length]!;
  const enter = useSharedValue(reduced ? 1 : 0);
  const press = useSharedValue(0);
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (!reduced) enter.value = withDelay(m.t(60 + i * 35), withSpring(1, m.spring("settle")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Built on the JS thread; worklets only capture the resulting objects.
  const pressIn = m.timing(reduced ? 0 : 90, "out");
  const pressOut = m.timing(reduced ? 0 : 260, "spring");

  const card = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.3),
    transform: [
      { translateY: 16 * (1 - enter.value) + 1.5 * press.value },
      { translateX: 1.5 * press.value },
      { scale: 1 - 0.015 * press.value },
    ],
  }));
  const tile = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(press.value, [0, 1], [tilt, 0])}deg` }, { translateX: press.value }, { translateY: press.value }],
  }));

  const p = c.pastel[tone];
  const a11y = `${title}${line ? `, ${line}` : ""}${badge > 0 ? `, ${badge} need${badge === 1 ? "s" : ""} you` : ""}`;

  return (
    <Animated.View style={[wide ? styles.wide : styles.cell, card]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { setDown(true); press.value = withTiming(1, pressIn); }}
        onPressOut={() => { setDown(false); press.value = withTiming(0, pressOut); }}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={[styles.door, { backgroundColor: p.soft, borderColor: down ? c.ink : p.border }]}
      >
        <Animated.View style={[styles.tile, { backgroundColor: c.note.fill[tone], borderColor: c.ink }, hard(c.scheme === "dark" ? c.paper : c.ink, 2), tile]}>
          <Icon name={icon} size={19} color={c.note.ink} />
        </Animated.View>
        <View style={styles.text}>
          <T v="bodyStrong" size={15} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{title}</T>
          {line != null
            ? <T v="mono" size={11} color={warn ? c.pastel.rose.ink : c.ink3} numberOfLines={1}>{line}</T>
            : <View style={[styles.lineHold, { backgroundColor: c.skel }]} />}
        </View>
        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: c.pastel[badgeTone].ink, borderColor: c.paper }]} pointerEvents="none">
            <T v="mono" size={11} color="#FFFFFF" style={{ fontWeight: "700" }}>{badge > 99 ? "99+" : String(badge)}</T>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** Two columns with a 10pt gutter. */
export function DoorGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { flexGrow: 1, flexBasis: "40%" },
  wide: { width: "100%" },
  door: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 74, paddingVertical: 12, paddingLeft: 12, paddingRight: 10, borderRadius: 18, borderWidth: 1.5 },
  tile: { width: 38, height: 38, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: 3 },
  lineHold: { width: 64, height: 9, borderRadius: 5, marginTop: 3 },
  badge: { position: "absolute", top: -8, right: -5, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center", transform: [{ rotate: "6deg" }] },
});
