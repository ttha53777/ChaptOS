/**
 * Motion tokens. Named after what they do, mapped from the curves the web already uses
 * (counts as of 2026-11: spring ×40, standard ×17, flight in every web flight), so a
 * phone stamp and a browser stamp land with the same weight.
 *
 * Rules (docs/mobile-app-ui-motion-plan.md):
 *  - taps answer in ≤ 120ms, ordinary moves 200–320ms, only signature moments up to 900ms
 *  - transform + opacity only on anything per-frame
 *  - every animation names its reduced version; primitives read `useMotion().reduced`
 *
 * Always build configs through `useMotion()` (./MotionProvider) rather than these
 * raw tables: it applies the Motion Lab's slow-motion factor and pins
 * `reduceMotion: Never`, because reduced versions are designed, not skipped.
 */
import { Easing } from "react-native-reanimated";

export const EASE = {
  /** `cubic-bezier(.16,.9,.3,1.02)`: things that land and settle (stamps, pops, tabs). */
  spring: Easing.bezier(0.16, 0.9, 0.3, 1.02),
  /** `cubic-bezier(.22,.72,.24,1)`: the default move/fade. */
  standard: Easing.bezier(0.22, 0.72, 0.24, 1),
  /** `cubic-bezier(.6,0,.12,1)`: something travelling from A to B (web flights). */
  flight: Easing.bezier(0.6, 0, 0.12, 1),
  /** `cubic-bezier(.32,.72,0,1)`: sheets and the canvas scale-back (mock --ease-sheet). */
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
  /** `cubic-bezier(.3,0,.2,1)`: the stamp's drop (event-landing.ts). */
  press: Easing.bezier(0.3, 0, 0.2, 1),
  /** `cubic-bezier(.4,0,.6,1)`: ink smearing off on a failure. */
  smear: Easing.bezier(0.4, 0, 0.6, 1),
  /** Plain ease-out / ease-in for fades. */
  out: Easing.out(Easing.quad),
  in: Easing.in(Easing.quad),
  linear: Easing.linear,
} as const;
export type EaseName = keyof typeof EASE;

/** Durations in ms at 1× speed. */
export const DUR = {
  tap: 120,
  fade: 180,
  move: 240,
  sheet: 500,
  stamp: 340,
  moment: 900,
} as const;

/** Duration-based springs (Reanimated 4): `duration` is perceptual, so a 380 settle
 *  reads as 380ms even though the tail runs a little longer. Used where a gesture hands
 *  off with velocity. Authored moments use timing + EASE. */
export const SPRING = {
  settle: { duration: 380, dampingRatio: 0.82 },
  pop: { duration: 340, dampingRatio: 0.6 },
  sheet: { duration: 420, dampingRatio: 1 },
} as const;
export type SpringName = keyof typeof SPRING;
