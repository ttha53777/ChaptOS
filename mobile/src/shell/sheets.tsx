/**
 * Stacked bottom sheets (the mock's `openSheet`), declared where they're used:
 *
 *   <Sheet open={open} onClose={() => setOpen(false)} title="File an excuse" tone="butter">
 *     …
 *   </Sheet>
 *
 * The <Sheet> renders nothing in place. It registers its props with the SheetHost at
 * the root on every render (so its children stay live, closures stay fresh), and the
 * host draws every sheet above the app canvas:
 *
 *   - the canvas scales back behind the first sheet (mock `.screen.stacked .app`:
 *     translateY(sat − 10) scale(.92), 28 radius, black behind, status bar goes light)
 *   - each sheet under another steps back (`.sheet.behind`: −12px, scale .94)
 *   - grabber + header drag to dismiss; past the top detent it rubber-bands at 1/6;
 *     release dismisses past 130pt, or on a flick (> 600pt/s after 30pt), as in the mock
 *   - sizes: `fit` (content, capped at full height), `tall` (full height), and `half`
 *     (opens at 56%, drags up to tall: two detents)
 *   - scrim tap and Android back close the top sheet
 *
 * Everything per-frame is transform/opacity on the UI thread; a drag can catch a sheet
 * mid-flight. Reduced motion: sheets and the canvas don't travel; the sheet cross-fades
 * in place over the scrim (180ms). Dragging still follows the finger.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  interpolate, makeMutable, useAnimatedKeyboard, useAnimatedStyle, withTiming, type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, type IconName } from "~/icons/Icon";
import { DUR } from "~/motion/motion";
import { Tile } from "~/paper/bits";
import type { Tone } from "~/theme/palette";
import { useMotion, useTheme, type Motion } from "~/theme/PaperProvider";
import { T } from "~/ui/T";
import { setChrome } from "./chrome";

export type SheetSize = "fit" | "tall" | "half";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  kicker?: string;
  icon?: IconName;
  /** The header tile's tone (the edge above the sheet is always butter, as on the web). */
  tone?: Tone;
  size?: SheetSize;
  /** Pinned under the body on a paper-2 band (primary actions). */
  footer?: ReactNode;
  /** Header actions left of the close button. */
  actions?: ReactNode;
  /** Body without the default padding/scroll (for screens that bring their own list). */
  bare?: boolean;
  /** Can't be dragged or tapped away (a step that must be answered). */
  locked?: boolean;
  /** Untitled sheet whose body draws its own CloseX (a tinted header would hide the floating one). */
  ownClose?: boolean;
  children?: ReactNode;
  accessibilityLabel?: string;
}

/* ── registry ─────────────────────────────────────────────────────────────────── */
interface Entry {
  key: string;
  props: SheetProps;
  /** Still in the tree; when false the host drops the entry once it has animated out. */
  live: boolean;
  /** 0 closed → 1 open (may overshoot past 1 while rubber-banding). */
  progress: SharedValue<number>;
  seq: number;
}

let entries: Entry[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => { entries = [...entries]; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => entries;

function upsert(key: string, props: SheetProps) {
  const e = entries.find(x => x.key === key);
  if (!e) {
    if (!props.open) return;
    entries.push({ key, props, live: true, progress: makeMutable(0), seq: ++seq });
    return emit();
  }
  const reopened = props.open && !e.props.open;
  e.props = props;
  e.live = true;
  if (reopened) e.seq = ++seq; // a reopened sheet goes on top of the stack
  entries.sort((a, b) => a.seq - b.seq);
  emit();
}

function release(key: string) {
  const e = entries.find(x => x.key === key);
  if (!e) return;
  e.live = false;
  e.props = { ...e.props, open: false };
  emit();
}

function drop(key: string) {
  const e = entries.find(x => x.key === key);
  if (!e || e.props.open) return; // reopened while closing: keep it
  entries = entries.filter(x => x.key !== key);
  emit();
}

/** Close whichever sheet is on top. Returns false when none was open. */
export function closeTopSheet(): boolean {
  const top = [...entries].reverse().find(e => e.props.open);
  if (!top || top.props.locked) return !!top;
  top.props.onClose();
  return true;
}

/* ── the declaration ──────────────────────────────────────────────────────────── */
export function Sheet(props: SheetProps) {
  const key = useId();
  useLayoutEffect(() => { upsert(key, props); });
  useEffect(() => () => release(key), [key]);
  return null;
}

/* ── the host ─────────────────────────────────────────────────────────────────── */
const CANVAS_SCALE = 0.92;
const CANVAS_RADIUS = 28;

export function SheetHost({ children }: { children: ReactNode }) {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { c } = useTheme();
  const m = useMotion();
  const insets = useSafeAreaInsets();
  const anyOpen = list.some(e => e.props.open);

  useEffect(() => { setChrome({ stacked: anyOpen }); }, [anyOpen]);
  useEffect(() => {
    if (!anyOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => closeTopSheet());
    return () => sub.remove();
  }, [anyOpen]);

  const base = list[0]?.progress;
  // worklets capture plain values only: `m` carries functions, which would be re-wrapped
  // for the UI runtime on every render
  const reduced = m.reduced;
  const canvas = useAnimatedStyle(() => {
    const p = base ? Math.min(Math.max(base.value, 0), 1) : 0;
    if (reduced) return { transform: [], borderRadius: 0 };
    const lift = insets.top - 10;
    return {
      borderRadius: p > 0.01 ? CANVAS_RADIUS : 0,
      transform: [{ translateY: lift * p }, { scale: 1 - (1 - CANVAS_SCALE) * p }],
    };
  });
  const scrim = useAnimatedStyle(() => ({ opacity: base ? Math.min(Math.max(base.value, 0), 1) : 0 }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.canvas, { backgroundColor: c.paper }, canvas]}>{children}</Animated.View>
      {list.length > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrim]} pointerEvents={anyOpen ? "auto" : "none"}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closeTopSheet()} accessibilityLabel="Close sheet" accessibilityRole="button" />
        </Animated.View>
      )}
      {list.map((e, i) => (
        <SheetFrame key={e.key} entry={e} above={list[i + 1]?.progress} m={m} />
      ))}
    </View>
  );
}

/* ── one sheet ────────────────────────────────────────────────────────────────── */
function SheetFrame({ entry, above, m }: { entry: Entry; above?: SharedValue<number>; m: Motion }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { props, progress } = entry;
  const size = props.size ?? "fit";
  const tone = props.tone ?? "lilac";

  const fullH = screenH - insets.top - 8;
  const halfH = Math.round(screenH * 0.56);
  // measured height of a fit sheet; tall/half use fullH
  const h = useMemo(() => makeMutable(size === "fit" ? 0 : fullH), [size, fullH]);
  // half sheets rest at this progress (the lower detent); 1 = fully up
  const restAt = size === "half" ? halfH / fullH : 1;
  const fade = useMemo(() => makeMutable(m.reduced ? 0 : 1), []); // eslint-disable-line react-hooks/exhaustive-deps

  const dur = m.reduced ? DUR.fade : m.sheetMs;
  // configs built on the JS side: worklets can capture these objects, not call m.timing().
  // Memoized so the pan gesture isn't rebuilt every time the owner re-renders.
  const travelCfg = useMemo(() => m.timing(dur, "sheet"), [m, dur]);
  const snapCfg = useMemo(() => m.timing(m.reduced ? DUR.fade : DUR.move + 80, "sheet"), [m]);
  const key = entry.key;
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  const gone = () => drop(key);
  const requestClose = () => onClose.current();

  // open / close driven by the `open` prop. A layout effect, so the travel starts in the
  // same frame the sheet is committed rather than a frame (or a busy JS turn) later.
  // A `fit` sheet that hasn't been measured yet waits for its onLayout: starting blind
  // would run part of the travel invisibly and then pop in partway up.
  const wasOpen = useRef(false);
  const waitingForSize = useRef(false);
  const startOpen = () => {
    waitingForSize.current = false;
    if (m.reduced) {
      progress.value = restAt;
      fade.value = withTiming(1, m.timing(DUR.fade, "out"));
    } else {
      fade.value = 1;
      progress.value = withTiming(restAt, travelCfg);
    }
  };
  useLayoutEffect(() => {
    if (props.open) {
      wasOpen.current = true;
      if (size === "fit" && !h.value) waitingForSize.current = true;
      else startOpen();
    } else if (wasOpen.current || progress.value > 0) {
      wasOpen.current = false;
      waitingForSize.current = false;
      const done = (fin?: boolean) => { "worklet"; if (fin) scheduleOnRN(gone); };
      if (m.reduced) fade.value = withTiming(0, m.timing(DUR.fade, "out"), f => { progress.value = 0; done(f); });
      else progress.value = withTiming(0, travelCfg, done);
    } else {
      drop(key);
    }
  }, [props.open]); // eslint-disable-line react-hooks/exhaustive-deps

  // drag: grabber + header
  const start = useMemo(() => makeMutable(0), []);
  const locked = !!props.locked;
  const pan = usePanGesture({
    enabled: !locked,
    activeOffsetY: [-6, 6],
    onActivate: () => { "worklet"; start.value = progress.value; },
    onUpdate: e => {
      "worklet";
      const H = h.value || fullH;
      let p = start.value - e.translationY / H;
      if (p > 1) p = 1 + (p - 1) / 6; // rubber band past the top detent
      progress.value = p;
    },
    onDeactivate: e => {
      "worklet";
      const H = h.value || fullH;
      const fromRest = (restAt - progress.value) * H; // pt dragged below the lower detent
      const flick = e.velocityY > 600 && fromRest > 30;
      if (fromRest > 130 || flick) {
        progress.value = withTiming(0, travelCfg, fin => { if (fin) scheduleOnRN(gone); });
        scheduleOnRN(requestClose);
        return;
      }
      // snap to the nearest detent, judged on where the flick would carry it
      const projected = progress.value - (e.velocityY * 0.15) / H;
      const target = size === "half" && Math.abs(projected - 1) < Math.abs(projected - restAt) ? 1 : restAt;
      progress.value = withTiming(target, snapCfg);
    },
  });

  const kb = useAnimatedKeyboard();
  const frame = useAnimatedStyle(() => {
    const H = h.value || fullH;
    // reduced motion: progress jumps to its detent and `fade` carries the change
    const travel = (1 - progress.value) * H;
    const back = above ? Math.min(Math.max(above.value, 0), 1) : 0;
    return {
      opacity: fade.value * (h.value || size !== "fit" ? 1 : 0),
      transform: [
        { translateY: travel - kb.height.value - 12 * back },
        { scale: 1 - 0.06 * back },
      ],
    };
  });

  const height = size === "fit" ? undefined : fullH;
  const bottomPad = props.footer ? 0 : insets.bottom;

  return (
    <Animated.View
      style={[styles.frame, { height, maxHeight: fullH }, frame]}
      pointerEvents={props.open ? "box-none" : "none"}
      onLayout={size === "fit" ? ev => {
        h.value = ev.nativeEvent.layout.height;
        if (waitingForSize.current) startOpen();
      } : undefined}
      accessibilityViewIsModal
      accessibilityLabel={props.accessibilityLabel ?? props.title}
    >
      {/* web .bsheet: a 3pt pastel edge above the ink border (box-shadow 0 -3px 0) */}
      <View style={[styles.edge, { backgroundColor: c.pastel.butter.fill }]} />
      <View style={[styles.inner, { backgroundColor: c.card, borderColor: c.ink }, size !== "fit" && { flex: 1 }]}>
        <GestureDetector gesture={pan}>
          <View>
            <View style={styles.grab}><View style={[styles.grabBar, { backgroundColor: c.line2 }]} /></View>
            {(props.title || props.kicker) ? (
              <View style={styles.head}>
                {props.icon ? <Tile icon={props.icon} tone={tone} size={32} /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {props.kicker ? <T v="kicker" color={c.ink3}>{props.kicker}</T> : null}
                  {props.title ? <T v="subhead" accessibilityRole="header" numberOfLines={1} style={styles.title}>{props.title}</T> : null}
                </View>
                {props.actions}
                {!locked && <CloseX onPress={requestClose} />}
              </View>
            ) : !locked && !props.ownClose ? <View style={styles.floatX}><CloseX onPress={requestClose} /></View> : null}
          </View>
        </GestureDetector>
        {props.bare ? (
          <View style={[size !== "fit" && { flex: 1 }, { paddingBottom: bottomPad }]}>{props.children}</View>
        ) : (
          <ScrollView
            style={size === "fit" ? styles.fitScroll : { flex: 1 }}
            contentContainerStyle={[styles.body, { paddingBottom: 18 + bottomPad }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {props.children}
          </ScrollView>
        )}
        {props.footer ? (
          <View style={[styles.foot, { borderTopColor: c.line, backgroundColor: c.paper2, paddingBottom: 12 + insets.bottom }]}>{props.footer}</View>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function CloseX({ onPress, label = "Close" }: { onPress: () => void; label?: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={[styles.x, { backgroundColor: c.paper, borderColor: c.line2 }]}>
      <Icon name="x" size={15} color={c.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "black" }, // the phone behind the canvas, as in the mock (theme-independent)
  canvas: { flex: 1, overflow: "hidden", transformOrigin: "50% 0%" },
  // web mobile-shell.css .bsheet / .bsheet-grab / .bsheet-h / .bsheet-x / .bsheet-b
  frame: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 3 },
  edge: { position: "absolute", left: 0, right: 0, top: 0, height: 40, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  inner: { borderWidth: 1.5, borderBottomWidth: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", flexShrink: 1 },
  grab: { paddingTop: 9, paddingBottom: 2, alignItems: "center" },
  grabBar: { width: 40, height: 5, borderRadius: 3 },
  head: { flexDirection: "row", alignItems: "center", gap: 11, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 19, letterSpacing: -0.45 },
  floatX: { position: "absolute", top: 14, right: 14, zIndex: 3 },
  x: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  fitScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingTop: 0, paddingHorizontal: 16, gap: 16 },
  foot: { flexDirection: "row", gap: 10, alignItems: "center", paddingTop: 12, paddingHorizontal: 16, borderTopWidth: 1.5 },
});
