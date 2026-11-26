/**
 * Tapping a push: switch to the push's chapter first (setActiveOrg, so every
 * query that follows asks for the right org), then open its screen.
 *
 *   warm         addNotificationResponseReceivedListener
 *   cold start   getLastNotificationResponse(), read once the person is signed in
 *                with memberships to check against, then cleared
 *   gone         no longer in that chapter: stay put and say so
 *
 * Mounted by the root layout only in the ready state, so a tap that arrives while
 * signed out or mid-join waits until the app is ready.
 */
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { toast } from "~/shell/toast";
import { setActiveOrg } from "~/state/org";
import { pushSupported, registerThisPhone } from "./index";
import { pushTarget } from "./links";

type Membership = { orgSlug: string; orgName: string };

function open(response: Notifications.NotificationResponse, memberships: Membership[]) {
  const data = response.notification.request.content.data as { url?: unknown; orgSlug?: unknown } | undefined;
  const target = pushTarget(data?.url);
  if (!target) return;
  if (!memberships.some(m => m.orgSlug === target.slug)) {
    toast.show("You're no longer in that chapter", { detail: "That notification was for a chapter you've left.", tone: "sky" });
    return;
  }
  setActiveOrg(target.slug);
  // Let the org switch land before the screen mounts and starts fetching.
  setTimeout(() => router.push(target.href as Href), 0);
}

export function PushRouting({ memberships }: { memberships: Membership[] }) {
  const ms = useRef(memberships);
  ms.current = memberships;

  useEffect(() => {
    if (!pushSupported) return;
    // Refresh this phone's token on every launch (no-op without permission).
    void registerThisPhone().catch(() => {});
    const last = Notifications.getLastNotificationResponse();
    if (last) { Notifications.clearLastNotificationResponse(); open(last, ms.current); }
    const sub = Notifications.addNotificationResponseReceivedListener(r => {
      Notifications.clearLastNotificationResponse();
      open(r, ms.current);
    });
    return () => sub.remove();
  }, []);

  return null;
}
