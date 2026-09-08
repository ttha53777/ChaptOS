"use client";

// Client gate + shared poll for the live check-in window.
//
// Same two-condition gating as ChatWidgetGate and SemesterGate: the user is
// resolved into an org AND we are actually inside the org dashboard. Gating on
// org alone would poll /api/attendance/live from the auth screens, where a
// signed-in user can still have currentUser.org populated from /api/auth/me.
//
// The provider sits at the root rather than inside the dashboard page because
// the whole point of the bar is to reach the member on Timeline, Treasury and
// every other org route. `enabled` carries the gate down to the hook, so off a
// dashboard route this mounts a provider that never fetches — the dashboard
// page can still call useSharedLiveCheckIn() unconditionally.

import { usePathname } from "next/navigation";
import { useChapter } from "../context/ChapterContext";
import { LiveCheckInProvider } from "../context/LiveCheckInContext";
import { LiveCheckInBar } from "./LiveCheckInBar";
import { isDashboardRoute } from "../lib/routes";

export function LiveCheckInGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser } = useChapter();
  const enabled = !!currentUser?.org && isDashboardRoute(pathname);

  return (
    <LiveCheckInProvider enabled={enabled}>
      {children}
      {enabled && <LiveCheckInBar />}
    </LiveCheckInProvider>
  );
}
