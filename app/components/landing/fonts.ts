// Typefaces for the marketing landing page and the app's Paper aesthetic.
//
// The .variable class names are applied to the .lp wrapper in LandingPage.tsx
// (landing.css points --display / --sans / --mono at them) and to <html> in
// app/layout.tsx, where app/paper-aesthetic.css re-points the app's own font
// variables at them when html[data-aesthetic="paper"].
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter } from "next/font/google";

export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  // Every design mock loads Bricolage with its optical-size axis; without it the
  // browser renders headlines at the small-text cut (wider, heavier).
  axes: ["opsz"],
  display: "swap",
  variable: "--font-bricolage",
});

export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Plex Mono has no variable axis, so the weights have to be listed.
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const landingFontClass = `${bricolage.variable} ${inter.variable} ${plexMono.variable}`;
