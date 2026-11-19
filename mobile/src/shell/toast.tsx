/**
 * The feedback layer: one ink snackbar at a time (mock `.toast`, web `.lce-snack`).
 *
 *   toast.show("Excuse filed")                         2.6s, mint lip
 *   toast.show("Task done", { undo: () => … })         10s with the Undo ring (as on web)
 *   toast.error("Couldn't check you in", { detail })   4.2s, rose lip, error haptic is the caller's
 *
 * It rides just above the tab bar (chrome.tabBar), and drops to the bottom edge over a
 * sheet, as in the mock. Enters with the spring lift (translateY 20 → 0, scale .96 → 1);
 * reduced motion: a fade. Swipe down or tap the × to dismiss early.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, type IconName } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { hard } from "~/theme/shadow";
import { T } from "~/ui/T";
import { useChrome } from "./chrome";

export const UNDO_MS = 10_000;

export interface ToastOpts {
  detail?: string;
  tone?: Tone;
  icon?: IconName;
  /** Shows the Undo button and the 10s ring. */
  undo?: () => void;
  undoLabel?: string;
}

interface Item extends ToastOpts { id: number; msg: string; ms: number; kind: "info" | "error" }

let current: Item | null = null;
let nextId = 0;
const subs = new Set<() => void>();
const set = (v: Item | null) => { current = v; subs.forEach(s => s()); };

export const toast = {
  show(msg: string, opts: ToastOpts = {}) {
    set({ ...opts, msg, id: ++nextId, kind: "info", ms: opts.undo ? UNDO_MS : 2600 });
  },
  error(msg: string, opts: Omit<ToastOpts, "undo" | "undoLabel"> = {}) {
    set({ tone: "rose", icon: "alert", ...opts, msg, id: ++nextId, kind: "error", ms: 4200 });
  },
  dismiss() { set(null); },
};

const useCurrent = () => useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => current, () => current);

export function ToastHost() {
  const item = useCurrent();
  const [shown, setShown] = useState<Item | null>(null);
  const { c } = useTheme();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const { stacked, tabBar } = useChrome();
  const vis = useSharedValue(0);
  const drag = useSharedValue(0);

  // keep the last item drawn while it animates out
  useEffect(() => {
    if (item) {
      setShown(item);
      drag.value = 0;
      vis.value = withTiming(1, m.timing(m.reduced ? DUR.fade : 350, m.reduced ? "out" : "spring"));
    } else {
      vis.value = withTiming(0, m.timing(DUR.fade, "out"), fin => { if (fin) scheduleOnRN(setShown, null); });
    }
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => { if (current?.id === item.id) toast.dismiss(); }, m.t(item.ms));
    return () => clearTimeout(t);
  }, [item, m]);

  const pan = usePanGesture({
    activeOffsetY: 6,
    onUpdate: e => { "worklet"; drag.value = Math.max(0, e.translationY); },
    onDeactivate: e => {
      "worklet";
      if (drag.value > 40 || e.velocityY > 500) scheduleOnRN(toast.dismiss);
      else drag.value = withTiming(0, { duration: 200 });
    },
  });

  const style = useAnimatedStyle(() => m.reduced
    ? { opacity: vis.value, transform: [{ translateY: drag.value }] }
    : {
      opacity: Math.min(1, vis.value * 1.6),
      transform: [{ translateY: (1 - vis.value) * 20 + drag.value }, { scale: 0.96 + 0.04 * vis.value }],
    });

  if (!shown) return null;
  const tone = shown.tone ?? "mint";
  const bottom = stacked ? insets.bottom + 28 : (tabBar ? tabBar : insets.bottom) + 12;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole={shown.kind === "error" ? "alert" : "text"}
        style={[styles.toast, { bottom, backgroundColor: c.ink }, hard(c.pastel[tone].fill, 3), style]}
      >
        {shown.undo ? <UndoRing key={shown.id} ms={shown.ms} tone={tone} /> : <Icon name={shown.icon ?? "star"} size={16} color={c.pastel[tone].fill} />}
        <View style={{ flex: 1 }}>
          <T v="callout" color={c.paper}>{shown.msg}</T>
          {shown.detail ? <T v="meta" color={c.paper} style={{ opacity: 0.7 }}>{shown.detail}</T> : null}
        </View>
        {shown.undo ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => { const u = shown.undo; toast.dismiss(); u?.(); }}
            hitSlop={8}
            style={[styles.undo, { backgroundColor: c.pastel[tone].fill }]}
          >
            <T v="buttonSm" color={c.note.ink}>{shown.undoLabel ?? "Undo"}</T>
          </Pressable>
        ) : (
          <Pressable onPress={toast.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} style={styles.dismiss}>
            <Icon name="x" size={13} color={c.paper} />
          </Pressable>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

/** The web's UndoRing: steps once a second, like its `stroke-dashoffset 1s linear`. A 1Hz
 *  prop change, not a per-frame animation. */
export function UndoRing({ ms, tone = "rose", size = 18 }: { ms: number; tone?: Tone; size?: number }) {
  const { c } = useTheme();
  const m = useMotion();
  const [left, setLeft] = useState(ms);
  const t0 = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, ms - (Date.now() - t0.current) / m.speed)), 1000);
    return () => clearInterval(id);
  }, [ms, m.speed]);
  const C = 2 * Math.PI * 8;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" accessibilityLabel={`${Math.ceil(left / 1000)} seconds to undo`}>
      <Circle cx={10} cy={10} r={8} fill="none" stroke={c.paper} strokeOpacity={0.2} strokeWidth={2.5} />
      <Circle cx={10} cy={10} r={8} fill="none" stroke={c.pastel[tone].fill} strokeWidth={2.5} strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - left / ms)} transform="rotate(-90 10 10)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  toast: { position: "absolute", left: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 16 },
  undo: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  dismiss: { padding: 4 },
});
