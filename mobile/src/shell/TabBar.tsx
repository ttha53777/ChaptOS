/**
 * The tab bar: the website's phone bar (app/components/MobileTabBar.tsx +
 * mobile-shell.css `.mtb`): Home · Timeline · [Create] · Members · More on a paper strip.
 * Members is the org's word for them and shows only with the "members" workflow; Tasks
 * and every other page live behind More, so More carries my overdue-task count (rose).
 *
 * The tab you're on is inked like the sidebar's active row (`.mtb-tab[aria-current]`): a
 * card tile, ink border, a 2px butter offset shadow. It pops in at 0.72 → 1 with the
 * settle spring; pressing nudges it 1px into its shadow. Tapping the tab you're on pops
 * its stack and scrolls to top (tabPress → native stack + useScrollToTop). No haptic:
 * this is ordinary navigation.
 *
 * Create (`.mtb-create`) is an ink tile on a lilac offset shadow. Pressed, the face slides
 * 1.5px onto its shadow; while its sheet is open the + turns a quarter-and-a-half into an
 * ×, and back when it closes. One light tap haptic: it opens something.
 *
 * Reduced motion: the active tile fades in at full size; Create's face doesn't travel and
 * its + cross-fades to the × in place.
 */
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { localDay } from "~/data/home";
import { useTasks } from "~/data/tasks";
import { useEntryOf } from "~/entry/EntryContext";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { navLabel, overdueMine, showsMembers } from "~/more/model";
import { viewerOf } from "~/tasks/model";
import { hard } from "~/theme/shadow";
import { useFontScale, useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { setChrome } from "./chrome";
import { CreateSheet } from "./CreateSheet";

export const TAB_ICONS: Record<string, IconName> = { today: "home", timeline: "timeline", members: "people", more: "menu" };

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { c } = useTheme();
  const me = useEntryOf("ready")?.me ?? null;
  const [creating, setCreating] = useState(false);
  const tasksOn = !!me?.org?.enabledWorkflows.includes("tasks");
  const tasks = useTasks(tasksOn);
  const viewer = useMemo(() => (me ? viewerOf(me) : null), [me]);
  useEffect(() => () => setChrome({ tabBar: 0 }), []);

  const today = localDay();
  const overdue = me ? overdueMine(me, tasks.data, viewer, today) : 0;
  const routes = state.routes.filter(r => r.name !== "members" || showsMembers(me));
  const labelOf = (name: string, fallback: string) =>
    name === "members" && me ? navLabel(me, "Brotherhood") : fallback;

  const tabs = routes.map((route, i) => {
    const focused = state.routes[state.index]?.key === route.key;
    const title = descriptors[route.key]?.options.title ?? route.name;
    const label = labelOf(route.name, title);
    const onPress = () => {
      const ev = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !ev.defaultPrevented) navigateToTab(route.key);
    };
    const badge = route.name === "more" && overdue > 0 ? overdue : 0;
    return (
      <Tab key={route.key} label={label} icon={TAB_ICONS[route.name] ?? "star"} focused={focused} onPress={onPress}
        badge={badge} badgeLabel={badge ? `${badge} overdue ${badge === 1 ? "task" : "tasks"}` : undefined}
        position={`${i + 1} of ${routes.length}`} />
    );
  });
  // Create sits after Timeline, as on the web.
  const at = Math.min(2, tabs.length);

  return (
    <View
      onLayout={e => setChrome({ tabBar: e.nativeEvent.layout.height })}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: c.paper, borderTopColor: c.line }]}
    >
      <View accessibilityRole="tablist" style={[styles.half, { flex: at }]}>{tabs.slice(0, at)}</View>
      <CreateButton open={creating} onPress={() => { haptics.tap(); setCreating(true); }} />
      <View accessibilityRole="tablist" style={[styles.half, { flex: Math.max(1, tabs.length - at) }]}>{tabs.slice(at)}</View>
      <CreateSheet open={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

/* ── a tab ────────────────────────────────────────────────────────────────────── */

export function Tab({ label, icon, focused, badge, badgeLabel, onPress, position }: {
  label: string; icon: IconName; focused: boolean; badge: number; badgeLabel?: string; onPress: () => void; position: string;
}) {
  const { c } = useTheme();
  const m = useMotion();
  const scale = Math.min(useFontScale(), 1.2);
  const on = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    if (m.reduced) on.value = withTiming(focused ? 1 : 0, m.timing(180, "out"));
    else on.value = focused ? withSpring(1, m.spring("pop")) : withTiming(0, m.timing(140, "out"));
  }, [focused, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const tile = useAnimatedStyle(() => ({
    opacity: Math.min(1, on.value),
    transform: [
      { translateX: press.value }, { translateY: press.value },
      { scale: m.reduced ? 1 : 0.72 + 0.28 * on.value },
    ],
  }));
  const glyph = useAnimatedStyle(() => ({ transform: [{ translateX: press.value }, { translateY: press.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { press.value = withTiming(1, m.timing(70, "out")); }}
      onPressOut={() => { press.value = withTiming(0, m.timing(m.reduced ? 90 : 220, "spring")); }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={`${label}${badgeLabel ? `, ${badgeLabel}` : ""}, tab, ${position}`}
      style={styles.tab}
    >
      <View style={styles.well}>
        <Animated.View style={[styles.tile, { backgroundColor: c.card, borderColor: c.ink }, hard(c.note.fill.butter, 2), tile]} />
        <Animated.View style={glyph}>
          <Icon name={icon} size={21} color={focused ? c.ink : c.ink3} />
        </Animated.View>
        {badge ? <Badge n={badge} /> : null}
      </View>
      <T v="tab" color={focused ? c.ink : c.ink3} numberOfLines={1} style={{ fontSize: 10.5 * scale }}>{label}</T>
    </Pressable>
  );
}

function Badge({ n }: { n: number }) {
  const { c } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: c.note.fill.rose, borderColor: c.paper }]}>
      <T v="mono" color={c.note.ink} style={styles.badgeT}>{n > 9 ? "9+" : String(n)}</T>
    </View>
  );
}

/* ── Create ───────────────────────────────────────────────────────────────────── */

export function CreateButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const m = useMotion();
  const press = useSharedValue(0);
  const turn = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    turn.value = m.reduced ? withTiming(open ? 1 : 0, m.timing(160, "out")) : withSpring(open ? 1 : 0, m.spring("settle"));
  }, [open, m]); // eslint-disable-line react-hooks/exhaustive-deps

  const face = useAnimatedStyle(() => ({
    transform: [{ translateX: m.reduced ? 0 : 1.5 * press.value }, { translateY: m.reduced ? 0 : 1.5 * press.value }],
  }));
  const plus = useAnimatedStyle(() => (m.reduced
    ? { opacity: 1 - turn.value }
    : { transform: [{ rotate: `${135 * turn.value}deg` }] }));
  const cross = useAnimatedStyle(() => ({ opacity: m.reduced ? turn.value : 0 }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { press.value = withTiming(1, m.timing(70, "out")); }}
      onPressOut={() => { press.value = withTiming(0, m.timing(m.reduced ? 90 : 260, "spring")); }}
      accessibilityRole="button"
      accessibilityLabel="Create"
      accessibilityHint="Opens the things you can add"
      accessibilityState={{ expanded: open }}
      hitSlop={4}
      style={styles.create}
    >
      <View style={[styles.createShadow, { backgroundColor: c.note.fill.lilac }]} />
      <Animated.View style={[styles.createFace, { backgroundColor: c.ink, borderColor: c.ink }, face]}>
        <Animated.View style={plus}><Icon name="plus" size={22} color={c.paper} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, cross]}><Icon name="x" size={20} color={c.paper} /></Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-start", paddingTop: 6, paddingHorizontal: 8, borderTopWidth: 1.5 },
  half: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", gap: 2, paddingTop: 4, minHeight: 48 },
  well: { width: 44, height: 30, alignItems: "center", justifyContent: "center" },
  tile: { position: "absolute", top: 0, left: 0, width: 44, height: 30, borderRadius: 10, borderWidth: 1.5 },
  badge: { position: "absolute", top: -5, right: 0, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 9.5, lineHeight: 12, fontWeight: "700" },
  create: { width: 64, alignItems: "center", paddingTop: 1 },
  createShadow: { position: "absolute", top: 3.5, left: 9.5, width: 50, height: 42, borderRadius: 14 },
  createFace: { width: 50, height: 42, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center" },
});
