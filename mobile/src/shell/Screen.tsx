/**
 * The frame every tab root and pushed page uses (mock `.nav` + `.view`, `.ps-h` + `.ps-b`).
 *
 *   Tab root  <Screen title="Timeline" large org onRefresh={refetch}>
 *             large title in the content that condenses into the bar as you scroll;
 *             the org stamp sits at the right of the bar and opens the switcher
 *   Pushed    <Screen title="On this phone" back="More">
 *             back chevron + the page you came from; the bar title fades in once the
 *             page's own heading scrolls under it. Edge-swipe back is the native stack's.
 *
 * Tapping the active tab pops the stack (native stack) and scrolls to top (useScrollToTop).
 * Switching chapters cross-fades the content (out 120ms, in 240ms): the query keys carry
 * the org slug, so the new chapter's data (or its skeletons) is what fades in.
 *
 * Pull to refresh is a pencil mark drawn as you pull (iOS; the cover slides off the
 * stroke, transform only), wiggling while the refetch runs. Android has no overscroll to
 * draw with, so there the native spinner shows, in ink on paper.
 */
import { useScrollToTop } from "expo-router";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Platform, Pressable, RefreshControl, StyleSheet, View, type ScrollView, type ScrollViewInstance } from "react-native";
import Animated, {
  cancelAnimation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Icon } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import { useActiveOrg } from "~/state/org";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { useChrome } from "./chrome";
import { OrgStamp } from "./OrgStamp";
import { WebToolbar } from "~/web/Toolbar";
import { pressedDim } from "~/motion/press";

export const BAR_H = 46;
/** The web's phone toolbar (`header.dash-toolbar`, h-14). */
export const TOOLBAR_H = 56;
const PULL = 72; // pt of overscroll that completes the pencil mark (≈ where iOS triggers)

export interface ScreenProps {
  title: string;
  /** Tab root: big title in the content, condensed into the bar on scroll. */
  large?: boolean;
  /** A line under the large title (date, chapter). */
  subtitle?: string;
  /** Pushed page: the label of the page underneath. */
  back?: string;
  onBack?: () => void;
  /** Show the org stamp (tab roots). */
  org?: boolean;
  right?: ReactNode;
  onRefresh?: () => Promise<unknown>;
  /** Content that isn't a plain scroll (a list that virtualises itself). */
  bare?: boolean;
  /** Pinned under the scroll, above the tab bar. */
  footer?: ReactNode;
  children?: ReactNode;
  statusBar?: "light" | "dark";
  /** Indices (into `children`, which must then be a flat array) that stick under the bar
   *  as they reach it (month heads). The scroll then starts below the opaque bar instead
   *  of under it, so a stuck header is never hidden. */
  sticky?: number[];
  /** Mirrors the scroll offset, for screens that react to it (the Today jump pill). */
  scrollY?: SharedValue<number>;
  /** The scroll view, for screens that scroll it themselves. */
  scrollRef?: RefObject<ScrollViewInstance | null>;
  /** Keep the first visible row still when content is inserted above it (Earlier). */
  holdPosition?: boolean;
  /** Drawn over the scroll, outside it (floating controls). */
  overlay?: ReactNode;
  /** The web's phone toolbar instead of the condensing title: the org's tile (opens the
   *  chapter switcher), a small caps kicker over a display title, and `right`. The page
   *  draws its own heading in the content, as the web page does. */
  toolbar?: { kicker?: string; title: string };
}

/**
 * The page's status bar, dropped while a sheet has the canvas scaled back (the root then
 * holds it light). Its own component so a sheet opening re-renders this, not the page:
 * every mounted page (all four tabs and their stacks) reads it.
 */
function ScreenStatusBar({ style }: { style: "light" | "dark" }) {
  const { stacked } = useChrome();
  return stacked ? null : <StatusBar style={style} />;
}

export function Screen({ title, large: largeProp, subtitle, back, onBack, org, right, onRefresh, bare, footer, children, statusBar, sticky, scrollY, scrollRef, holdPosition, overlay, toolbar }: ScreenProps) {
  const large = largeProp && !toolbar;
  const { c, dark } = useTheme();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const ownRef = useRef<ScrollView>(null);
  const ref = (scrollRef ?? ownRef) as RefObject<unknown>;
  useScrollToTop(ref as never);

  const onScroll = useAnimatedScrollHandler(e => {
    y.value = e.contentOffset.y;
    if (scrollY) scrollY.value = e.contentOffset.y;
  });

  // The bar title shows once the large title (≈ 44pt tall) has scrolled under the bar.
  const condenseAt = large ? 40 : 28;
  const barTitle = useAnimatedStyle(() => {
    const p = interpolate(y.value, [condenseAt - 12, condenseAt + 8], [0, 1], "clamp");
    return { opacity: p, transform: [{ translateY: (1 - p) * 5 }] };
  });
  const rule = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [condenseAt, condenseAt + 16], [0, 1], "clamp") }));
  const heroStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, condenseAt + 4], [1, 0], "clamp"),
    transform: [{ translateY: y.value < 0 ? 0 : -y.value * 0.15 }],
  }));

  // chapter switch: fade the content out and back in
  const { slug } = useActiveOrg();
  const fade = useSharedValue(1);
  const firstSlug = useRef(slug);
  useEffect(() => {
    if (slug === firstSlug.current) return;
    firstSlug.current = slug;
    fade.value = withSequence(withTiming(0, m.timing(120, "out")), withTiming(1, m.timing(DUR.move, "out")));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const contentFade = useAnimatedStyle(() => ({ opacity: fade.value }));

  // refresh
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? async () => {
    setRefreshing(true);
    const minimum = new Promise(r => setTimeout(r, m.t(600))); // long enough to read the wiggle
    try { await Promise.all([onRefresh(), minimum]); } catch { /* the screen's own error state says it */ }
    setRefreshing(false);
  } : undefined;

  const ios = Platform.OS === "ios";
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : undefined));

  const top = insets.top + (toolbar ? TOOLBAR_H : BAR_H);
  const stuck = !!sticky?.length;
  // Children indices → content indices: the hero, when there is one, is child 0.
  const stickyHeaderIndices = stuck ? sticky!.map(i => i + (large ? 1 : 0)) : undefined;
  const scrollProps = {
    ref: ref as never,
    onScroll,
    scrollEventThrottle: 16,
    contentContainerStyle: [styles.body, toolbar && styles.webBody, { paddingTop: stuck ? (large ? 4 : 8) : top + (toolbar ? 16 : large ? 4 : 8) }],
    scrollIndicatorInsets: { top: stuck ? 0 : top - insets.top },
    keyboardShouldPersistTaps: "handled" as const,
    stickyHeaderIndices,
    maintainVisibleContentPosition: holdPosition ? { minIndexForVisible: 0 } : undefined,
    style: stuck ? { marginTop: top } : undefined,
    refreshControl: refresh ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={refresh}
        progressViewOffset={stuck ? 0 : top}
        tintColor={ios ? "transparent" : c.ink}
        colors={[c.ink]}
        progressBackgroundColor={c.card}
      />
    ) : undefined,
  };

  return (
    <View style={[styles.page, { backgroundColor: c.paper }]}>
      <ScreenStatusBar style={statusBar ?? (dark ? "light" : "dark")} />
      {refresh && ios ? <PencilMark y={y} top={top} refreshing={refreshing} /> : null}

      <Animated.View style={[{ flex: 1 }, contentFade]}>
        {bare ? (
          <View style={{ flex: 1, paddingTop: top }}>{children}</View>
        ) : (
          <Animated.ScrollView {...scrollProps}>
            {large ? (
              <Animated.View style={[styles.hero, heroStyle]}>
                <T v="hero" accessibilityRole="header" numberOfLines={2}>{title}</T>
                {subtitle ? <T v="meta" color={c.ink3}>{subtitle}</T> : null}
              </Animated.View>
            ) : null}
            {children}
          </Animated.ScrollView>
        )}
      </Animated.View>

      {/* the bar, over the scroll */}
      {toolbar ? (
        <View style={[styles.bar, styles.toolbar, { paddingTop: insets.top, height: top, backgroundColor: c.paper, borderBottomColor: c.line }]}>
          <WebToolbar kicker={toolbar.kicker} title={toolbar.title} back={back} onBack={goBack} />
          {right ? <View style={styles.tbRight}>{right}</View> : null}
        </View>
      ) : (
      <View style={[styles.bar, { paddingTop: insets.top, height: top, backgroundColor: c.paper }]}>
        <Animated.View style={[styles.rule, { backgroundColor: c.line }, rule]} />
        <View style={styles.barSide}>
          {back ? (
            <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={`Back to ${back}`} hitSlop={8} style={({ pressed }) => [styles.back, pressed && pressedDim]}>
              <Icon name="chev-l" size={18} color={c.ink2} />
              <T v="callout" color={c.ink2} numberOfLines={1}>{back}</T>
            </Pressable>
          ) : null}
        </View>
        <Animated.View style={[styles.barTitle, large || back ? barTitle : null]} pointerEvents="none">
          <T v="subhead" numberOfLines={1} style={{ fontSize: 16.5 }}>{title}</T>
        </Animated.View>
        <View style={[styles.barSide, styles.barRight]}>
          {right}
          {org ? <OrgStamp /> : null}
        </View>
      </View>
      )}

      {overlay}
      {footer ? <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper }]}>{footer}</View> : null}
    </View>
  );
}

/* ── the pencil ───────────────────────────────────────────────────────────────── */
const MARK_W = 64;

function PencilMark({ y, top, refreshing }: { y: SharedValue<number>; top: number; refreshing: boolean }) {
  const { c } = useTheme();
  const m = useMotion();
  const wiggle = useSharedValue(0);
  const held = useSharedValue(0); // keeps the mark drawn while refreshing, even as the scroll settles

  useEffect(() => {
    if (refreshing) {
      held.value = 1;
      wiggle.value = m.reduced ? 0 : withRepeat(withSequence(withTiming(1, m.timing(140, "standard")), withTiming(-1, m.timing(140, "standard"))), -1, true);
    } else {
      cancelAnimation(wiggle);
      wiggle.value = withTiming(0, m.timing(DUR.tap));
      held.value = withTiming(0, m.timing(DUR.fade, "out"));
    }
  }, [refreshing]); // eslint-disable-line react-hooks/exhaustive-deps

  const pull = () => {
    "worklet";
    return Math.max(held.value, Math.min(1, Math.max(0, -y.value / PULL)));
  };
  const wrap = useAnimatedStyle(() => ({ opacity: Math.min(1, pull() * 3) }));
  // the cover slides right off the stroke, so the line appears to be drawn
  const cover = useAnimatedStyle(() => ({ transform: [{ translateX: pull() * MARK_W }] }));
  const pencil = useAnimatedStyle(() => ({
    transform: [{ translateX: pull() * MARK_W - 6 }, { rotate: `${-30 + wiggle.value * 10}deg` }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.pencil, { top: top + 14 }, wrap]} accessibilityLabel={refreshing ? "Refreshing" : undefined}>
      <View style={{ width: MARK_W, height: 20, overflow: "hidden" }}>
        <Svg width={MARK_W} height={20} viewBox="0 0 64 20">
          <Path d="M2 12 C 10 4, 16 18, 24 10 S 38 4, 44 12 S 56 16, 62 8" stroke={c.ink2} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper }, cover]} />
      </View>
      <Animated.View style={[styles.pencilTip, pencil]}>
        <Icon name="pencil" size={18} color={c.ink} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { paddingHorizontal: 18, paddingBottom: 40, gap: 16 },
  hero: { gap: 4, marginBottom: 2 },
  bar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  rule: { position: "absolute", left: 0, right: 0, bottom: 0, height: 1.5 },
  barSide: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  barRight: { justifyContent: "flex-end", gap: 8 },
  barTitle: { maxWidth: "56%", alignItems: "center" },
  back: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingRight: 4, maxWidth: "100%" },
  // web .dash { padding: 16px }
  webBody: { paddingHorizontal: 16, gap: 14 },
  toolbar: { borderBottomWidth: 1.5, paddingHorizontal: 16, gap: 12 },
  tbRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  footer: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1.5 },
  pencil: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 0 },
  pencilTip: { position: "absolute", left: "50%", marginLeft: -MARK_W / 2, top: -6 },
});
