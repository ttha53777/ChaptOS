/**
 * The dev-only web preview (scripts/app-web.mjs): the app exported for the web and
 * served on one origin with a proxy to the isolated dev server on :3100, so a
 * headless browser can screenshot it next to the web phone captures.
 *
 * There it signs in with the server's dev impersonation cookie (lib/auth/dev-bypass,
 * honoured only with DEV_AUTH_BYPASS=1 outside production), not Supabase: no bearer
 * token is sent, and the API is same-origin (relative URLs) so the cookie rides along.
 *
 * Off unless BOTH hold: the platform is web, and EXPO_PUBLIC_DEV_WEB=1 was set when the
 * bundle was built. Native builds are never web, so this is dead code on a phone.
 */
import { Platform } from "react-native";

export const DEV_WEB = Platform.OS === "web" && process.env.EXPO_PUBLIC_DEV_WEB === "1";
