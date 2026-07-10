"use client";

// Tiny client gate for the "Ask the Chapter" AI chat widget.
//
// The widget is a DASHBOARD-only feature: it must never appear on the auth /
// platform routes (/login, /welcome, /create, /pending-access,
// /join/[token], the root redirect, /admin). Those pages still mount the global
// ChapterProvider, and a signed-in user sitting on one of them (e.g. an
// org-less user on /welcome, or someone mid-claim on /pending-access) can have
// currentUser.org populated from /api/auth/me — so gating on org alone would
// leak the widget onto auth screens.
//
// So we gate on TWO things: the user is resolved into an org, AND we're
// actually inside the org dashboard (a /[slug]/… route). The dashboard is the
// only place whose first path segment is a real org slug; every platform route
// (including /create) is a known reserved segment, so excluding those keeps
// this from drifting as routes are added. (The old third check — the
// /[slug]/onboarding wizard — is gone with the wizard itself: setup now
// happens pre-creation on /create.)
import { usePathname } from "next/navigation";
import { useChapter } from "../context/ChapterContext";
import { isDashboardRoute } from "../lib/routes";
import { ChatWidget } from "./ChatWidget";

export function ChatWidgetGate() {
  const pathname = usePathname();
  const { currentUser } = useChapter();
  if (!currentUser?.org) return null;
  if (!isDashboardRoute(pathname)) return null;
  return <ChatWidget />;
}
