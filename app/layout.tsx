import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ChapterProvider } from "./context/ChapterContext";
import { ChatWidgetGate } from "./components/ChatWidgetGate";
import { SemesterGate } from "./components/SemesterGate";
import { ToastProvider } from "./components/dashboard/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif used only by the pre-auth pages (login / join / welcome /
// create / pending-access) via --font-fraunces. The dashboard never references
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col"><ToastProvider><ChapterProvider>{children}<SemesterGate /><ChatWidgetGate /></ChapterProvider></ToastProvider></body>
    </html>
  );
}
