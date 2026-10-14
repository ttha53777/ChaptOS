import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

function withTimeout(ms: number): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
}

/**
 * The Supabase access token from `Authorization: Bearer <jwt>`, or null.
 *
 * The browser authenticates with the Supabase session cookie; the native app
 * has no cookie jar to share, so it sends its access token in this header
 * instead. Not ambient the way a cookie is, so it adds no CSRF surface.
 */
export async function bearerToken(): Promise<string | null> {
  try {
    const value = (await headers()).get("authorization");
    return value?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
  } catch {
    // headers() is unavailable outside a request scope — no header to read.
    return null;
  }
}

/**
 * The verified Supabase auth user for this request, or null.
 *
 * The single place that answers "which account is calling?" for both clients:
 * a bearer token when the request carries one (the native app), else the
 * session cookie (the browser). The token, when present, is authoritative: an
 * invalid or expired one yields null rather than falling back to whatever
 * cookie rides along, so a client can never be silently authenticated as a
 * different account than the one it presented.
 *
 * Read-only — it never refreshes or writes the cookie. Routes that need a live
 * Supabase session (storage uploads, updateUser, signOut) still build their
 * own cookie client.
 */
export async function getVerifiedAuthUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
      global: { fetch: withTimeout(5_000) },
    }
  );
  const token = await bearerToken();
  const { data: { user } } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();
  return user;
}
