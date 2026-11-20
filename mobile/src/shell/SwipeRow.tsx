/**
 * A row that swipes left to reveal its actions (mock `.swr` / `.att`, "Needs attention").
 *
 *   <SwipeRow actions={[open, done]} onPress={openIt} label="Send formal headcount">
 *     …row face…
 *   </SwipeRow>
 *
 * Geometry is the mock's: each action is 84pt; a release past 60pt opens the row to
 * show them all; dragging further rubber-bands at 0.7; past `FULL` the last action
 * takes the whole row and letting go does it. FULL is judged on the RAW finger delta,
 * not the rubber-banded position (the mock's gotcha: judged on the damped value, a
 * full swipe needs an absurd drag). Crossing it ticks a selection haptic.
 *
 * Only one row is open at a time; tapping an open row closes it. A full swipe flies
 * the face off and calls the action; the list removes the row (give the parent's
 * Animated wrapper `exiting` + `layout` so it collapses). A navigational action that
 * doesn't remove the row gets the face back.
 *
 * Transform and opacity only, on the UI thread; the action panel moves by translateX,
 * never by width. VoiceOver/TalkBack get each action as a custom accessibility action.
 * Reduced motion: the finger is still followed; the release snaps with a short
 * ease (no spring travel) and a full swipe fades the face instead of flying it.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, type IconName } from "~/icons/Icon";
import { haptics } from "~/motion/haptics";
import { DUR } from "~/motion/motion";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { pressedDim } from "~/motion/press";

export const ACTION_W = 84;
const OPEN_AT = 60;
const RUBBER = 0.7;

export interface SwipeAction {
  label: string;
  icon: IconName;
  tone: Tone;
  onPress: () => void;
}

export interface SwipeRowProps {
  /** Left to right as revealed; the LAST one is what a full swipe does. */
  actions: SwipeAction[];
  onPress?: () => void;
  /** Spoken name of the row. */
  label: string;
  hint?: string;
  radius?: number;
  children: ReactNode;
}

// one open row at a time
let closeOpen: { id: string; close: () => void } | null = null;

export function SwipeRow({ actions, onPress, label, hint, radius = 18, children }: SwipeRowProps) {
  const { c } = useTheme();
  const m = useMotion();
  const id = useId();
  const n = actions.length;
  const W = ACTION_W * n;
  const FULL = W + 62; // 230 with two actions, as in the mock
  const SIDE = ACTION_W * (n - 1);

  const x = useSharedValue(0);       // face position (rubber-banded)
  const raw = useSharedValue(0);     // finger position (what FULL is judged on)
  const base = useSharedValue(0);
  const full = useSharedValue(0);    // 0 → 1 as the last action takes the row
  const fullOn = useSharedValue(false);
  const gone = useSharedValue(1);    // face opacity (reduced-motion full swipe)
  const rowW = useSharedValue(360);

  // configs built on the JS side: worklets can't call m.timing()
  const snapCfg = m.reduced ? m.timing(DUR.fade, "out") : m.spring("settle");
  const flyCfg = m.timing(m.reduced ? DUR.fade : 200, m.reduced ? "out" : "flight");
  const fullCfg = m.timing(200, "out");
  const reduced = m.reduced;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const close = () => {
    x.value = withSpring(0, m.spring("settle"));
    if (closeOpen?.id === id) closeOpen = null;
  };
  const opened = () => {
    if (closeOpen && closeOpen.id !== id) closeOpen.close();
    closeOpen = { id, close };
  };
  useEffect(() => () => { if (closeOpen?.id === id) closeOpen = null; }, [id]);

  const commit = (i: number) => {
    if (closeOpen?.id === id) closeOpen = null;
    actionsRef.current[i]?.onPress();
    // If the row is still here a moment later (a link, not a resolve), bring the face back.
    setTimeout(() => {
      x.value = withSpring(0, m.spring("settle"));
      gone.value = withTiming(1, m.timing(DUR.fade, "out"));
      full.value = 0; fullOn.value = false;
    }, m.t(420));
  };

  const pan = usePanGesture({
    activeOffsetX: [-10, 10],
    failOffsetY: [-10, 10],
    onActivate: () => { "worklet"; base.value = x.value < -1 ? -W : 0; },
    onUpdate: e => {
      "worklet";
      const r = Math.min(0, base.value + e.translationX);
      raw.value = r;
      x.value = r < -W ? -W + (r + W) * RUBBER : r;
      const isFull = r < -FULL;
      if (isFull !== fullOn.value) {
        fullOn.value = isFull;
        full.value = withTiming(isFull ? 1 : 0, fullCfg);
        scheduleOnRN(haptics.select);
      }
    },
    onDeactivate: e => {
      "worklet";
      if (raw.value < -FULL) {
        if (reduced) gone.value = withTiming(0, flyCfg);
        x.value = withTiming(reduced ? x.value : -rowW.value * 1.1, flyCfg);
        scheduleOnRN(commit, n - 1);
        return;
      }
      // The finger's speed carries into the snap, so a flick opens (or shuts) with momentum.
      const snap = reduced ? snapCfg : { ...snapCfg, velocity: e.velocityX };
      if (x.value < -OPEN_AT) { x.value = withSpring(-W, snap); scheduleOnRN(opened); }
      else { x.value = withSpring(0, snap); }
      full.value = withTiming(0, fullCfg);
      fullOn.value = false;
    },
  });

  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], opacity: gone.value }));
  // The last action's panel: its left edge sits SIDE pt right of the face's edge, or at
  // the edge itself once full. Moved by translateX inside a full-width layer.
  const lastStyle = useAnimatedStyle(() => {
    const revealed = Math.max(0, -x.value);
    const goW = Math.max(ACTION_W, revealed - SIDE) * (1 - full.value) + revealed * full.value;
    return { transform: [{ translateX: rowW.value - goW }] };
  });
  const sideStyle = useAnimatedStyle(() => {
    const revealed = Math.max(0, -x.value);
    const goW = Math.max(ACTION_W, revealed - SIDE);
    return { opacity: 1 - full.value, transform: [{ translateX: rowW.value - goW - SIDE }] };
  });
  const panelStyle = useAnimatedStyle(() => ({ opacity: x.value < -0.5 ? 1 : 0 }));

  const last = actions[n - 1];
  const side = actions.slice(0, -1);

  return (
    <View
      style={[styles.row, { borderRadius: radius }]}
      onLayout={e => { rowW.value = e.nativeEvent.layout.width; }}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityActions={[{ name: "activate" }, ...actions.map(a => ({ name: a.label, label: a.label }))]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === "activate") { onPress?.(); return; }
        actions.find(a => a.label === e.nativeEvent.actionName)?.onPress();
      }}
    >
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, panelStyle]}>
        {side.length ? (
          <Animated.View style={[styles.side, { width: SIDE }, sideStyle]}>
            {side.map((a, i) => (
              <ActionButton key={a.label} a={a} onPress={() => { close(); actionsRef.current[i]?.onPress(); }} />
            ))}
          </Animated.View>
        ) : null}
        {last ? (
          <Animated.View style={[styles.last, { backgroundColor: c.note.fill[last.tone] }, lastStyle]}>
            <ActionButton a={last} onPress={() => { x.value = withTiming(-rowW.value * 1.1, flyCfg); commit(n - 1); }} />
          </Animated.View>
        ) : null}
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={faceStyle}>
          <Pressable
            onPress={() => { if (x.value < -1) close(); else onPress?.(); }}
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={({ pressed }) => [{ borderRadius: radius }, pressed && onPress ? { opacity: 0.9 } : null]}
          >
            {children}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function ActionButton({ a, onPress }: { a: SwipeAction; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} importantForAccessibility="no" accessibilityElementsHidden
      style={({ pressed }) => [[styles.act, { backgroundColor: c.note.fill[a.tone] }], pressed && pressedDim]}>
      <Icon name={a.icon} size={20} color={c.note.ink} />
      <T v="pill" color={c.note.ink}>{a.label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { overflow: "hidden" },
  side: { position: "absolute", top: 0, bottom: 0, left: 0, flexDirection: "row" },
  last: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  act: { width: ACTION_W, flex: 0, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: 3 },
});
