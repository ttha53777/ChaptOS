/**
 * The Expo Push API: one integration for APNs and FCM. Tests replace this
 * module (tests/setup/expo-mock.ts), so it holds nothing but the HTTP calls.
 *
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
import { expoAccessToken } from "./config";

/** EXPO_PUSH_API_URL points a dev server at a local fake (the default is Expo itself). */
const BASE = () => (process.env.EXPO_PUSH_API_URL?.trim() || "https://exp.host/--/api/v2/push").replace(/\/$/, "");
/** Expo accepts at most 100 messages per send request and 1000 ids per receipts request. */
export const SEND_BATCH = 100;
export const RECEIPT_BATCH = 1000;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  /** Android channel — same id as the push category. */
  channelId: string;
  priority: "high" | "default";
  /** Seconds the push service should keep trying to deliver. */
  ttl: number;
}

export type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

export type ExpoReceipt =
  | { status: "ok" }
  | { status: "error"; message: string; details?: { error?: string } };

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  const token = expoAccessToken();
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/** Send up to SEND_BATCH messages. Tickets come back in the same order. */
export async function expoSend(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const res = await fetch(`${BASE()}/send`, { method: "POST", headers: headers(), body: JSON.stringify(messages), signal: AbortSignal.timeout(8_000) });
  const json = await res.json().catch(() => null) as { data?: ExpoTicket[]; errors?: { message: string }[] } | null;
  if (!res.ok || !json?.data) throw new Error(`Expo push send failed (${res.status}): ${json?.errors?.[0]?.message ?? "no body"}`);
  return json.data;
}

/** Receipts for up to RECEIPT_BATCH ticket ids. Ids Expo doesn't know yet are absent. */
export async function expoReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
  const res = await fetch(`${BASE()}/getReceipts`, { method: "POST", headers: headers(), body: JSON.stringify({ ids }), signal: AbortSignal.timeout(8_000) });
  const json = await res.json().catch(() => null) as { data?: Record<string, ExpoReceipt> } | null;
  if (!res.ok || !json?.data) throw new Error(`Expo receipts failed (${res.status})`);
  return json.data;
}
