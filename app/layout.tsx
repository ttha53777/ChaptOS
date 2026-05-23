import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ChapterProvider } from "./context/ChapterContext";
import { ChatWidgetGate } from "./components/ChatWidgetGate";
import { ToastProvider } from "./components/dashboard/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lambda Phi Epsilon Operations",
  description: "Spring semester chapter operations dashboard",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col"><ToastProvider><ChapterProvider>{children}<ChatWidgetGate /></ChapterProvider></ToastProvider></body>
    </html>
  );
}
