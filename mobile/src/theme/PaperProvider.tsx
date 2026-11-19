/**
 * One provider for the three things every paper primitive reads: the palette (day /
 * night), the motion settings (reduced motion, Lab slow-mo) and the type scale
 * (Dynamic Type, with a Lab override).
 *
 * Appearance follows the system unless overridden (Me → On this phone, later; the
 * Motion Lab now). The overrides live in memory for U0; persisting the user's choice
 * arrives with the settings screen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from "react-native";
import { ReduceMotion, useReducedMotion, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";
import { DUR, EASE, SPRING, type EaseName, type SpringName } from "~/motion/motion";
import { day, night, type Palette } from "./palette";
import { TYPE_SIZES, type TypeSize } from "./type";

export type Appearance = "system" | "day" | "night";
export type ReducedSetting = "system" | "on" | "off";
export type Speed = 1 | 4;
/** Sheet open/close duration. 500 (the mock's) was picked 2026-11-18 over the plan's 320;
 *  the Motion Lab still plays both side by side and can flip the real sheets for comparison. */
export type SheetMs = 320 | 500;

interface Settings {
  appearance: Appearance;
  reduced: ReducedSetting;
  typeSize: TypeSize;
  speed: Speed;
  sheetMs: SheetMs;
}

interface Ctx extends Settings {
  c: Palette;
  isReduced: boolean;
  fontScale: number;
  set: (patch: Partial<Settings>) => void;
}

const APPEARANCE_KEY = "chaptos.appearance";

const PaperCtx = createContext<Ctx | null>(null);

export function PaperProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>({ appearance: "system", reduced: "system", typeSize: "System", speed: 1, sheetMs: 500 });
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

  // Appearance is the one setting a member picks (More → On this phone); it's remembered.
  // The rest are Motion Lab overrides and reset on launch.
  useEffect(() => {
    AsyncStorage.getItem(APPEARANCE_KEY).then(v => {
      if (v === "day" || v === "night" || v === "system") setS(prev => ({ ...prev, appearance: v }));
    }).catch(() => {});
  }, []);
  const set = useCallback((patch: Partial<Settings>) => {
    if (patch.appearance) AsyncStorage.setItem(APPEARANCE_KEY, patch.appearance).catch(() => {});
    setS(prev => ({ ...prev, ...patch }));
  }, []);

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
  const { appearance, reduced, typeSize, speed, sheetMs, set } = usePaper();
  return { appearance, reduced, typeSize, speed, sheetMs, set };
}

export interface Motion {
  /** True when the reduced version of every animation should play. */
  reduced: boolean;
  /** Lab slow-motion factor (1 in normal use). */
  speed: Speed;
  /** Sheet open/close duration at 1× (before slow-mo). */
  sheetMs: SheetMs;
  /** A duration in ms with slow-mo applied; also use it for setTimeout-paced steps. */
  t: (ms: number) => number;
  timing: (ms?: number, ease?: EaseName) => WithTimingConfig;
  spring: (name?: SpringName) => WithSpringConfig;
}

export function useMotion(): Motion {
  const { isReduced, speed, sheetMs } = usePaper();
  return useMemo<Motion>(() => ({
    reduced: isReduced,
    speed,
    sheetMs,
    t: ms => ms * speed,
    timing: (ms = DUR.move, ease = "standard") => ({ duration: ms * speed, easing: EASE[ease], reduceMotion: ReduceMotion.Never }),
    spring: (name = "settle") => {
      const cfg = SPRING[name];
      return { duration: cfg.duration * speed, dampingRatio: cfg.dampingRatio, reduceMotion: ReduceMotion.Never };
    },
  }), [isReduced, speed, sheetMs]);
}
