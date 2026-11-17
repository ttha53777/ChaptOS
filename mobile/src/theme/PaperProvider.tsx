/**
 * One provider for the three things every paper primitive reads: the palette (day /
 * night), the motion settings (reduced motion, Lab slow-mo) and the type scale
 * (Dynamic Type, with a Lab override).
 *
 * Appearance follows the system unless overridden (Me → On this phone, later; the
 * Motion Lab now). The overrides live in memory for U0; persisting the user's choice
 * arrives with the settings screen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from "react-native";
import { ReduceMotion, useReducedMotion, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";
import { DUR, EASE, SPRING, type EaseName, type SpringName } from "~/motion/motion";
import { day, night, type Palette } from "./palette";
import { TYPE_SIZES, type TypeSize } from "./type";

export type Appearance = "system" | "day" | "night";
export type ReducedSetting = "system" | "on" | "off";
export type Speed = 1 | 4;

interface Settings {
  appearance: Appearance;
  reduced: ReducedSetting;
  typeSize: TypeSize;
  speed: Speed;
}

interface Ctx extends Settings {
  c: Palette;
  isReduced: boolean;
  fontScale: number;
  set: (patch: Partial<Settings>) => void;
}

const PaperCtx = createContext<Ctx | null>(null);

export function PaperProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>({ appearance: "system", reduced: "system", typeSize: "System", speed: 1 });
  const scheme = useColorScheme();
  const { fontScale: osScale } = useWindowDimensions();

  // Reanimated reads the OS flag once; AccessibilityInfo keeps it live if the user
  // flips Reduce Motion while the app is open.
  const initialReduced = useReducedMotion();
  const [osReduced, setOsReduced] = useState(initialReduced);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setOsReduced);
    AccessibilityInfo.isReduceMotionEnabled().then(setOsReduced).catch(() => {});
    return () => sub.remove();
  }, []);

  const set = useCallback((patch: Partial<Settings>) => setS(prev => ({ ...prev, ...patch })), []);

  const value = useMemo<Ctx>(() => {
    const dark = s.appearance === "night" || (s.appearance === "system" && scheme === "dark");
    return {
      ...s,
      c: dark ? night : day,
      isReduced: s.reduced === "on" || (s.reduced === "system" && osReduced),
      fontScale: TYPE_SIZES[s.typeSize] ?? osScale,
      set,
    };
  }, [s, scheme, osReduced, osScale, set]);

  return <PaperCtx.Provider value={value}>{children}</PaperCtx.Provider>;
}

function usePaper(): Ctx {
  const v = useContext(PaperCtx);
  if (!v) throw new Error("PaperProvider is missing above this component");
  return v;
}

export function useTheme() {
  const { c } = usePaper();
  return { c, dark: c.scheme === "dark" };
}

export function useFontScale(): number {
  return usePaper().fontScale;
}

/** Settings + setter, for the Motion Lab and (later) Me → On this phone. */
export function usePaperSettings() {
  const { appearance, reduced, typeSize, speed, set } = usePaper();
  return { appearance, reduced, typeSize, speed, set };
}

export interface Motion {
  /** True when the reduced version of every animation should play. */
  reduced: boolean;
  /** Lab slow-motion factor (1 in normal use). */
  speed: Speed;
  /** A duration in ms with slow-mo applied; also use it for setTimeout-paced steps. */
  t: (ms: number) => number;
  timing: (ms?: number, ease?: EaseName) => WithTimingConfig;
  spring: (name?: SpringName) => WithSpringConfig;
}

export function useMotion(): Motion {
  const { isReduced, speed } = usePaper();
  return useMemo<Motion>(() => ({
    reduced: isReduced,
    speed,
    t: ms => ms * speed,
    timing: (ms = DUR.move, ease = "standard") => ({ duration: ms * speed, easing: EASE[ease], reduceMotion: ReduceMotion.Never }),
    spring: (name = "settle") => {
      const cfg = SPRING[name];
      return { duration: cfg.duration * speed, dampingRatio: cfg.dampingRatio, reduceMotion: ReduceMotion.Never };
    },
  }), [isReduced, speed]);
}
