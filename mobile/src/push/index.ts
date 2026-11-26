/**
 * Push notifications on this phone (app plan Phase 5).
 *
 *   permission   asked after a useful moment (the first check-in), never on launch;
 *                a soft card comes first so "Not now" doesn't spend iOS's one prompt
 *   token        registered with POST /api/push/devices once permission is granted,
 *                refreshed on every launch (idempotent server-side), and removed with
 *                DELETE /api/push/devices on sign-out, while the session still works
 *   channels     one Android channel per category, same ids as the server's
 *   taps         ~/push/routing.ts
 *
 * The web preview has no push: every function here is a no-op there.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { PushDeviceResponse } from "@/lib/api-types";
import type { registerPushDeviceInput, unregisterPushDeviceInput } from "@/lib/validation/push";
import type { z } from "zod";
import { api } from "~/api/client";
import { config } from "~/config";
import { createStore } from "~/state/store";

const TOKEN_KEY = "chaptos.pushToken";
const ASKED_KEY = "chaptos.pushAsked";

export const pushSupported = Platform.OS !== "web" && Device.isDevice;

export type PushPermission = "granted" | "denied" | "undetermined" | "unsupported";

/** Live permission state, re-read on launch and after every ask. */
export const pushPermission = createStore<PushPermission>(pushSupported ? "undetermined" : "unsupported");
export const usePushPermission = () => pushPermission.use();

/** The screen on top, so a check-in push doesn't banner over the check-in screen itself. */
let onCheckIn = false;
export function setOnCheckInScreen(v: boolean) { onCheckIn = v; }

if (pushSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async n => {
      const quiet = onCheckIn && (n.request.content.data as { category?: string } | undefined)?.category === "checkin";
      return { shouldShowBanner: !quiet, shouldShowList: true, shouldPlaySound: !quiet, shouldSetBadge: false };
    },
  });
}

/** Android channels, one per category (ids match lib/push/categories.ts on the server). */
const CHANNELS: { id: string; name: string; high?: boolean }[] = [
  { id: "checkin", name: "Check-in", high: true },
  { id: "tasks", name: "Tasks and polls" },
  { id: "dues", name: "Dues" },
  { id: "attendance", name: "Excuses" },
  { id: "requests", name: "Requests to join" },
  { id: "default", name: "Chapter news" },
];

async function ensureChannels() {
  if (Platform.OS !== "android") return;
  await Promise.all(CHANNELS.map(ch => Notifications.setNotificationChannelAsync(ch.id, {
    name: ch.name,
    importance: ch.high ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
  })));
}

function toPermission(s: Notifications.NotificationPermissionsStatus): PushPermission {
  if (s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return "granted";
  return s.canAskAgain ? "undetermined" : "denied";
}

export async function readPermission(): Promise<PushPermission> {
  if (!pushSupported) return "unsupported";
  const p = toPermission(await Notifications.getPermissionsAsync());
  pushPermission.set(p);
  return p;
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/** Send this phone's token to the server. Safe to call often; a no-op without permission. */
export async function registerThisPhone(): Promise<boolean> {
  if (!pushSupported || (await readPermission()) !== "granted") return false;
  const id = projectId();
  if (!id) return false; // a build without EAS_PROJECT_ID can't get an Expo token
  await ensureChannels();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const body: z.input<typeof registerPushDeviceInput> = { token, platform: Platform.OS === "ios" ? "ios" : "android", appVersion: config.appVersion };
  await api<PushDeviceResponse>("/api/push/devices", { method: "POST", org: null, body });
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
  return true;
}

/** Sign-out: forget this phone on the server first, while the session still works. Never throws. */
export async function unregisterThisPhone(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const body: z.input<typeof unregisterPushDeviceInput> = { token };
    await Promise.race([
      api<PushDeviceResponse>("/api/push/devices", { method: "DELETE", org: null, body, allow401: true }),
      new Promise(resolve => setTimeout(resolve, 4000)),
    ]);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Offline or already gone: the token is pruned the first time Expo calls it dead.
  }
}

/** Ask the OS (after the soft card said yes). Registers when granted. */
export async function askForPush(): Promise<PushPermission> {
  if (!pushSupported) return "unsupported";
  await markAsked();
  await ensureChannels();
  const p = toPermission(await Notifications.requestPermissionsAsync());
  pushPermission.set(p);
  if (p === "granted") await registerThisPhone().catch(() => false);
  return p;
}

/** Whether the soft card may show: supported, never asked, permission still open. */
export async function shouldOfferPush(): Promise<boolean> {
  if (!pushSupported) return false;
  if ((await AsyncStorage.getItem(ASKED_KEY).catch(() => "1")) === "1") return false;
  return (await readPermission()) === "undetermined";
}

export async function markAsked(): Promise<void> {
  await AsyncStorage.setItem(ASKED_KEY, "1").catch(() => {});
}
