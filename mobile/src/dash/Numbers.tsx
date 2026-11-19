/**
 * The headline numbers row (web DashNumbers / Measure, phone-dash.css `.dn`): one row
 * of up to three equal tiles, the org's own pick (lib/dashboard/numbers.ts facts).
 *
 *   .measure   card face, 1.5 line border, 17 radius, padding 11/11/10
 *   .k         mono label in the tone's ink with its 12pt glyph
 *   .v         display figure 1.42rem, units small and muted; "—" muted when unset
 *   .note      mono .62rem; peach when warn, mint when good
 *   .pp-meter  6pt track; the bar grows from the left (1.2s, .45s in, as on the web)
 *
 * A tap goes where the web's does: the page, or the KPI sheet (Home owns that).
 */
import type { NumberFact, NumberTarget } from "@/lib/dashboard/numbers";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Icon, type IconName } from "~/icons/Icon";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";

function Meter({ pct, color, label }: { pct: number; color: string; label?: string }) {
  const { c } = useTheme();
  const m = useMotion();
  const g = useSharedValue(m.reduced ? 1 : 0);
  useEffect(() => {
    if (!m.reduced) g.value = withDelay(m.t(450), withTiming(1, { duration: m.t(1200), easing: Easing.out(Easing.cubic) }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: g.value }] }));
  return (
    <View style={[styles.track, { backgroundColor: c.paper3 }]} accessibilityLabel={label}>
      <Animated.View style={[styles.bar, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }, bar]} />
    </View>
  );
}

export function NumbersRow({ facts, onOpen }: { facts: NumberFact[]; onOpen: (t: NumberTarget, f: NumberFact) => void }) {
  const { c } = useTheme();
  if (!facts.length) return null;
  return (
    <View style={styles.row}>
      {facts.map(f => {
        const ink = c.pastel[f.tone].ink;
        const label = `${f.label}: ${f.unset ? "not recorded" : `${f.unitLeading ?? ""}${f.value}${f.unit ?? ""}`}${f.note ? `. ${f.note}` : ""}`;
        return (
          <Pressable key={f.id} onPress={() => onOpen(f.target, f)} accessibilityRole="button" accessibilityLabel={label}
            style={({ pressed }) => [styles.tile, { backgroundColor: c.card, borderColor: pressed ? c.ink : c.line, boxShadow: c.sh1 }, pressed && { transform: [{ scale: 0.985 }] }]}>
            <View style={styles.k}>
              <Icon name={f.icon as IconName} size={12} color={ink} />
              <T v="kicker" size={9} ls={0.07} color={ink} numberOfLines={1} style={{ flexShrink: 1 }}>{f.label}</T>
            </View>
            <T v="measure" size={22.7} numberOfLines={1} color={f.unset ? c.ink3 : c.ink} style={{ marginTop: 7 }}>
              {!f.unset && f.unitLeading ? f.unitLeading : ""}{f.value}
              {!f.unset && f.unit ? <T v="measure" size={11.2} color={c.ink3}>{f.unit}</T> : null}
            </T>
            {f.note ? (
              <T v="mono" size={9.9} numberOfLines={1} color={f.noteWarn ? c.pastel.peach.ink : f.noteGood ? c.pastel.mint.ink : c.ink3} style={{ marginTop: 4 }}>
                {f.note}
              </T>
            ) : null}
            {f.meter != null ? <Meter pct={f.meter} color={ink} label={f.meterLabel} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minWidth: 0, paddingTop: 11, paddingHorizontal: 11, paddingBottom: 10, borderRadius: 17, borderWidth: 1.5 },
  k: { flexDirection: "row", alignItems: "center", gap: 5 },
  track: { height: 6, marginTop: 9, borderRadius: 6, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 6, transformOrigin: "left center" },
});
