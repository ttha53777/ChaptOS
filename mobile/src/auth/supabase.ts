import "./crypto-shim";
import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { config } from "~/config";
import { DEV_WEB } from "./dev-web";
import { secureStorage } from "./secure-storage";

/**
 * The one Supabase client. Private to ~/auth: screens never touch Supabase, they
 * use the functions in ./index. It persists the session in the keychain and
 * refreshes the access token while the app is in the foreground.
 */
export const supabase: SupabaseClient = createClient(
  config.supabaseUrl || "https://not-configured.invalid",
  config.supabaseAnonKey || "not-configured",
  {
    auth: {
      // The web preview has no keychain and no Supabase session (./dev-web.ts).
      storage: DEV_WEB ? undefined : secureStorage,
      flowType: "pkce",
      persistSession: !DEV_WEB,
      autoRefreshToken: !DEV_WEB,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);

// Supabase's refresh timer only runs while the app is active; React Native
// suspends timers in the background, so start/stop it with the app state.
if (!DEV_WEB) AppState.addEventListener("change", state => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
