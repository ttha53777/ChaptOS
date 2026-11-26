import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * One config, three variants, picked by APP_VARIANT (set per profile in eas.json;
 * `npx expo start` locally is "development").
 *
 * API base URL, per variant:
 *   development  EXPO_PUBLIC_API_URL, else the isolated dev server on :3100 of the
 *                machine running Metro (see src/config.ts). Never the shared DB:
 *                dev and prod share one database, so dev builds must not write to it.
 *   preview      https://chaptos.com unless EXPO_PUBLIC_API_URL overrides it.
 *   production   https://chaptos.com.
 *
 * Supabase URL and anon key are public by design; they come from
 * EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (mobile/.env.local
 * locally, EAS environment variables for cloud builds).
 */
type Variant = "development" | "preview" | "production";

const variant: Variant = ((): Variant => {
  const v = process.env.APP_VARIANT;
  return v === "preview" || v === "production" ? v : "development";
})();

const PROD_API = "https://chaptos.com";

/** Keep only the entries that are non-empty strings. */
function strings(o: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
}

function apiUrl(): string | null {
  const override = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (variant === "production") return PROD_API;
  if (override) return override.replace(/\/$/, "");
  // Development with no override: resolved at runtime from Metro's host.
  return variant === "preview" ? PROD_API : null;
}

const suffix = variant === "production" ? "" : `.${variant === "development" ? "dev" : "preview"}`;
const name = variant === "production" ? "ChaptOS" : variant === "preview" ? "ChaptOS β" : "ChaptOS dev";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: "chaptos",
  // The app's own scheme. chaptos://auth-callback is the dev sign-in redirect
  // (it must be in Supabase's redirect allowlist). Expo Go can't claim it, so
  // there the redirect is exp://<host>/--/auth-callback instead.
  scheme: "chaptos",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#FFFCF6",
  ios: {
    supportsTablet: false,
    bundleIdentifier: `com.chaptos.app${suffix}`,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: `com.chaptos.app${suffix}`,
    adaptiveIcon: {
      backgroundColor: "#FFFCF6",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-font",
    ["expo-splash-screen", { backgroundColor: "#FFFCF6", dark: { backgroundColor: "#15110D" } }],
    "expo-web-browser",
    "expo-secure-store",
    // Push (app plan Phase 5): adds the iOS aps-environment entitlement and the
    // Android small icon. Channels are created at runtime (src/push/index.ts),
    // one per category; "default" catches the always-on "You're in".
    ["expo-notifications", { icon: "./assets/android-icon-monochrome.png", color: "#15110D", defaultChannel: "default" }],
    ["expo-image-picker", {
      photosPermission: "Chapt uses your photos so you can pick a profile picture.",
      cameraPermission: "Chapt uses the camera so you can take a profile picture.",
      microphonePermission: false,
    }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    variant,
    // Omit a value rather than send null: Expo's config serialization turns a null in
    // `extra` into `{}`, which then reads as "set" (and crashed config.ts on `.replace`).
    ...strings({
      apiUrl: apiUrl(),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    }),
    // Filled by `eas init` (needs `npx expo login`); EAS builds require it.
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});
