/**
 * Runtime config, read once from the app config (app.config.ts → extra).
 *
 * In development with no EXPO_PUBLIC_API_URL, the API is the isolated dev server
 * on :3100 of whichever machine is serving Metro. Expo Go knows that machine's
 * LAN address (hostUri), and a phone can't reach "localhost" on the Mac. It is
 * never :3000: that server talks to the shared dev/prod database.
 */
import Constants from "expo-constants";

type Extra = {
  variant?: "development" | "preview" | "production";
  apiUrl?: string | null;
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
/** A value from `extra`, only if it really is a non-empty string (a null there can arrive as `{}`). */
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function devApiUrl(): string {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:3100`;
}

export const config = {
  variant: extra.variant ?? "development",
  apiUrl: (str(extra.apiUrl) ?? devApiUrl()).replace(/\/$/, ""),
  supabaseUrl: str(extra.supabaseUrl) ?? "",
  supabaseAnonKey: str(extra.supabaseAnonKey) ?? "",
  /** Sent as x-app-version; the server's 426 gate compares it to MOBILE_MIN_VERSION. */
  appVersion: Constants.expoConfig?.version ?? "0.0.0",
} as const;

/** What's missing for the app to talk to anything, for the sign-in screen to say plainly. */
export function configProblem(): string | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY aren't set (mobile/.env.local).";
  }
  return null;
}
