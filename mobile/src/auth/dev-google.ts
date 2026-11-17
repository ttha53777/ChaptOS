/**
 * TEMPORARY dev sign-in (build plan Phase 2): Supabase's hosted Google OAuth in
 * the system browser, PKCE, back to the app on the redirect. Reuses the web's
 * Google client, so it needs no native client ID or Apple setup.
 *
 * Phase 7 replaces this file with native Google + Sign in with Apple
 * (signInWithIdToken); nothing outside ~/auth imports it.
 *
 * Redirect: chaptos://auth-callback in builds, exp://<host>/--/auth-callback in
 * Expo Go (it can't claim the app's scheme). Both must be in Supabase's redirect
 * allowlist, or Supabase sends the browser to the Site URL instead and the
 * session never reaches the app.
 */
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type SignInResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

export function redirectUrl(): string {
  return Linking.createURL("auth-callback");
}

export async function signInWithGoogleInBrowser(): Promise<SignInResult> {
  const redirectTo = redirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) return { ok: false, cancelled: false, message: error?.message ?? "Couldn't start sign-in." };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { ok: false, cancelled: true, message: "Sign-in was cancelled." };

  const { queryParams } = Linking.parse(result.url);
  const param = (k: string) => {
    const v = queryParams?.[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const failure = param("error_description") ?? param("error");
  if (failure) return { ok: false, cancelled: false, message: failure };
  const code = param("code");
  if (!code) {
    return { ok: false, cancelled: false, message: `No sign-in code came back. Is ${redirectTo} in Supabase's redirect allowlist?` };
  }
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) return { ok: false, cancelled: false, message: exchanged.error.message };
  return { ok: true };
}
