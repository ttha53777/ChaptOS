// Typefaces for the marketing landing page only.
//
// Declared here rather than in app/layout.tsx on purpose: next/font scopes its
// preload hints to the routes that import the module, so the dashboard doesn't
// pay for three faces it never renders. The .variable class names are applied
// to the .lp wrapper in LandingPage.tsx, and landing.css points --display /
// --sans / --mono at them.
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter } from "next/font/google";

export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
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
