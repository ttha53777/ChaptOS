/**
 * Type scale. Three faces, as on the web paper aesthetic:
 *   Bricolage Grotesque: display (greeting, titles, big figures)
 *   Inter: UI and body
 *   IBM Plex Mono: kickers, stamps, tabular figures
 *
 * Sizes are the iPhone mock's rem values at a 16px root, rounded to the point. Each style
 * has a Dynamic Type cap: body text follows the OS setting a long way, while display
 * and figure styles stop early so tickets and stubs keep their shape. The `T`
 * component (src/ui/T.tsx) applies the scale itself (allowFontScaling is off) so the
 * caps hold, and so the Motion Lab can simulate XXL / AX sizes without changing the OS.
 */
import type { TextStyle } from "react-native";

export const FONT_FILES = {
  "Bricolage-500": require("@expo-google-fonts/bricolage-grotesque/500Medium/BricolageGrotesque_500Medium.ttf"),
  "Bricolage-600": require("@expo-google-fonts/bricolage-grotesque/600SemiBold/BricolageGrotesque_600SemiBold.ttf"),
  "Bricolage-700": require("@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf"),
  "Inter-400": require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
  "Inter-500": require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
  "Inter-600": require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
  "Inter-700": require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
  "PlexMono-400": require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf"),
  "PlexMono-500": require("@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf"),
  "PlexMono-600": require("@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf"),
} as const;
export type FontFace = keyof typeof FONT_FILES;

export interface TypeStyle {
  face: FontFace;
  size: number;
  /** Line height as a multiple of size. */
  lh: number;
  /** Letter spacing in em, as written in the CSS. */
  ls: number;
  /** Largest Dynamic Type multiplier this style will follow. */
  cap: number;
  upper?: boolean;
  tabular?: boolean;
}

export const TYPE = {
  /** Greeting / large page title (`.greet`, 2.32rem). */
  hero:     { face: "Bricolage-600", size: 37, lh: 1.04, ls: -0.036, cap: 1.2 },
  /** Big counted figure (`.cnt`, 2.6rem). */
  figure:   { face: "Bricolage-600", size: 42, lh: 1.0, ls: -0.05, cap: 1.15, tabular: true },
  /** Measure value (`.meas-v`, 2.15rem). */
  measure:  { face: "Bricolage-600", size: 34, lh: 1.0, ls: -0.045, cap: 1.2, tabular: true },
  /** Card / sheet title (`.tk-t` 1.42rem, `.sh-h h3` 1.34rem). */
  title:    { face: "Bricolage-600", size: 22, lh: 1.12, ls: -0.03, cap: 1.3 },
  /** Section head (`.sec-h h2`, 1.2rem). */
  heading:  { face: "Bricolage-600", size: 19, lh: 1.12, ls: -0.025, cap: 1.35 },
  /** Small display head (`.calm h4`, 1.04rem). */
  subhead:  { face: "Bricolage-600", size: 17, lh: 1.2, ls: -0.02, cap: 1.45 },
  body:     { face: "Inter-400", size: 15, lh: 1.5, ls: -0.005, cap: 1.8 },
  bodyStrong: { face: "Inter-600", size: 15, lh: 1.45, ls: -0.005, cap: 1.8 },
  /** Row titles, field values (`.att .t`, .9rem). */
  callout:  { face: "Inter-500", size: 14.5, lh: 1.35, ls: -0.005, cap: 1.7 },
  /** Meta lines under a title (`.tk-m`, .8rem). */
  meta:     { face: "Inter-400", size: 13, lh: 1.4, ls: 0, cap: 1.6 },
  button:   { face: "Inter-600", size: 15, lh: 1.2, ls: -0.01, cap: 1.4 },
  buttonSm: { face: "Inter-600", size: 13, lh: 1.2, ls: -0.01, cap: 1.4 },
  pill:     { face: "Inter-600", size: 11.5, lh: 1.25, ls: 0, cap: 1.4 },
  /** Tracked caps eyebrow in Inter (`.meas-l`, `.dk-lbl`). */
  label:    { face: "Inter-700", size: 10.5, lh: 1.3, ls: 0.1, cap: 1.4, upper: true },
  tab:      { face: "Inter-600", size: 10.5, lh: 1.2, ls: 0.01, cap: 1.2 },
  /** Mono tracked caps (`.kick`, `.tk-k`, `.sh-h .k`). */
  kicker:   { face: "PlexMono-600", size: 10.5, lh: 1.3, ls: 0.08, cap: 1.4, upper: true },
  /** Tabular mono figures (`.mono`, countdowns, money). */
  mono:     { face: "PlexMono-500", size: 12.5, lh: 1.35, ls: -0.02, cap: 1.5, tabular: true },
  monoLg:   { face: "PlexMono-600", size: 17, lh: 1.2, ls: -0.02, cap: 1.3, tabular: true },
  /** Rubber stamp lettering. */
  stamp:    { face: "PlexMono-600", size: 12.5, lh: 1.1, ls: 0.14, cap: 1.2, upper: true },
} as const satisfies Record<string, TypeStyle>;
export type TypeName = keyof typeof TYPE;

/** iOS content-size multipliers worth simulating in the Motion Lab (body 17pt base). */
export const TYPE_SIZES = { System: null, XXL: 1.235, AX3: 2.353 } as const;
export type TypeSize = keyof typeof TYPE_SIZES;

export function resolveType(name: TypeName, fontScale: number): TextStyle {
  const s: TypeStyle = TYPE[name];
  const size = s.size * Math.min(Math.max(fontScale, 0.85), s.cap);
  return {
    fontFamily: s.face,
    fontSize: size,
    lineHeight: Math.round(size * s.lh),
    letterSpacing: s.ls * size,
    ...(s.upper ? { textTransform: "uppercase" as const } : null),
    ...(s.tabular ? { fontVariant: ["tabular-nums" as const] } : null),
  };
}
