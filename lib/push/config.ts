/**
 * Push switches. PUSH_ENABLED gates the whole subsystem so prod can ship dark:
 * off, handlers queue nothing and the sender sends nothing. Device registration
 * and preferences still work, so the app can register ahead of the switch.
 */
export function pushEnabled(): boolean {
  return process.env.PUSH_ENABLED === "1";
}

/** Expo's access token (enhanced push security). Optional until it's turned on in the Expo project. */
export function expoAccessToken(): string | null {
  return process.env.EXPO_ACCESS_TOKEN?.trim() || null;
}

/** How long an unsent push stays worth sending. Check-in is useless late. */
export const PUSH_TTL_MS = {
  checkin:    10 * 60_000,
  tasks:      24 * 3_600_000,
  dues:       24 * 3_600_000,
  attendance: 24 * 3_600_000,
  requests:   24 * 3_600_000,
  membership: 24 * 3_600_000,
} as const;

/** Sends give up after this many failed attempts. */
export const PUSH_MAX_ATTEMPTS = 5;

/** Expo makes receipts available ~15 min after a send. */
export const RECEIPT_DELAY_MS = 15 * 60_000;
