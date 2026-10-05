import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import "./paper-aesthetic.css";
import "./paper-overlays.css";
import "./paper-programming.css";
import "./paper-chapter.css";
import { ChapterProvider } from "./context/ChapterContext";
import { ChatWidgetGate } from "./components/ChatWidgetGate";
import { SemesterGate } from "./components/SemesterGate";
import { LiveCheckInGate } from "./components/LiveCheckInGate";
import { ToastProvider } from "./components/dashboard/Toast";
import { APP_THEME_BOOT } from "@/lib/theme";
import { APP_AESTHETIC_BOOT } from "@/lib/aesthetic";
import { landingFontClass } from "./components/landing/fonts";
import { PaperSprite } from "./components/paper/PaperIcon";
import { SIDEBAR_RAIL_BOOT } from "@/lib/sidebar-rail";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif used only by the pre-auth pages (login / join / welcome /
// create) via --font-fraunces. The dashboard never references
// it, so loading it here costs the authed app nothing at runtime.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChaptOS",
  description: "Chapter operations dashboard",
};

// viewportFit:cover unlocks env(safe-area-inset-*) on notched iPhones.
// interactiveWidget:resizes-content tells Android Chrome to shrink the layout
// viewport when the keyboard opens (pairs with 100dvh on the chat panel).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#07090f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // /create's theme boot script stamps data-crf-theme here before hydration
      // (see lib/onboarding/create-theme.ts), which React would otherwise report
      // as a server/client attribute mismatch, and APP_THEME_BOOT (lib/theme.ts)
      // does the same with data-theme (APP_AESTHETIC_BOOT with data-aesthetic, SIDEBAR_RAIL_BOOT with data-sb). Same reason next-themes requires this.
      // Only ever affects attributes on <html> itself.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${landingFontClass} h-full antialiased`}
    >
      {/* Blocking, before any paint: stamps data-theme so ivory never flashes
          dusk, and data-sb so a collapsed sidebar never flashes open. */}
      <head><script dangerouslySetInnerHTML={{ __html: APP_THEME_BOOT + APP_AESTHETIC_BOOT + SIDEBAR_RAIL_BOOT }} /></head>
      <body suppressHydrationWarning className="min-h-full flex flex-col"><PaperSprite /><ToastProvider><ChapterProvider><LiveCheckInGate>{children}</LiveCheckInGate><SemesterGate /><ChatWidgetGate /></ChapterProvider></ToastProvider></body>
    </html>
  );
}
