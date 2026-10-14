import { createServerClient } from "@supabase/ssr";
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

/** The verified account behind a request: the fields callers actually read. */
export interface AuthUser {
  id:            string;
  email:         string | undefined;
  user_metadata: Record<string, unknown>;
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
 * Verified locally with getClaims(), not getUser(): the project signs access
 * tokens with an asymmetric (ES256) key, so the signature is checked against
 * the published JWKS — cached process-wide by auth-js for 10 minutes — instead
 * of a network round-trip to Supabase Auth on every API call (~0.5s, with
 * multi-second spikes). The accepted trade-off: a token stays valid until it
 * expires (≤1h by default) even if its session was signed out or the account
 * deleted in the meantime. Likewise `user_metadata` is the snapshot taken when
 * the token was issued, so nothing that must reflect a just-made change (e.g.
 * whether the avatar is custom) may be read from it.
 *
 * Read-only — it never refreshes or writes the cookie. Routes that need a live
 * Supabase session (storage uploads, updateUser, signOut) still build their
 * own cookie client.
 */
export async function getVerifiedAuthUser(): Promise<AuthUser | null> {
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
  let claims;
  try {
    // No argument → the cookie session's access token; otherwise the bearer's.
    // Either way the signature and expiry are verified before claims come back.
    const { data, error } = token
      ? await supabase.auth.getClaims(token)
      : await supabase.auth.getClaims();
    if (error || !data) return null;
    claims = data.claims;
  } catch (e) {
    // Non-auth failures (a malformed key, a crypto error) are still "no
    // verified account" to every caller — but worth seeing in the logs.
    console.error("session verification failed", e);
    return null;
  }
  // Only a signed-in user's token is an identity. The anon/service keys are
  // JWTs from the same issuer too, but carry no subject or a different role.
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  if (claims.role !== "authenticated" || claims.is_anonymous === true) return null;
  return {
    id:            claims.sub,
    email:         typeof claims.email === "string" && claims.email ? claims.email : undefined,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
  };
}
