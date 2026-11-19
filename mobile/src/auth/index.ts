/**
 * Everything the rest of the app knows about signing in. Screens and the API
 * client import from here only, so Phase 7 can swap the provider (dev-google.ts)
 * for native Google + Apple without touching them.
 */
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { DEV_WEB } from "./dev-web";
import { signInWithGoogleInBrowser, redirectUrl, type SignInResult } from "./dev-google";
import { supabase } from "./supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string | null };

function toState(session: Session | null): AuthState {
  return session ? { status: "signedIn", userId: session.user.id, email: session.user.email ?? null } : { status: "signedOut" };
}

/** The session as React state: loading until the keychain has been read. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(DEV_WEB ? { status: "signedIn", userId: "dev-web", email: null } : { status: "loading" });
  useEffect(() => {
    if (DEV_WEB) return; // the preview's cookie is the session (./dev-web.ts)
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setState(toState(data.session)); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setState(toState(session)));
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);
  return state;
}

export type { SignInResult };
export const signIn = signInWithGoogleInBrowser;
export const signInRedirectUrl = redirectUrl;

export async function signOut(): Promise<void> {
  // "local": drop this device's session; other devices stay signed in.
  await supabase.auth.signOut({ scope: "local" });
}

/** The current access token (refreshed by supabase-js when near expiry), or null. */
export async function getAccessToken(): Promise<string | null> {
  if (DEV_WEB) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Force a refresh after the server said 401. Null when the refresh token is dead too. */
export async function refreshAccessToken(): Promise<string | null> {
  if (DEV_WEB) return null;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

/** Called when the session is unrecoverable (refresh failed): back to sign-in. */
export async function dropSession(): Promise<void> {
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
}
