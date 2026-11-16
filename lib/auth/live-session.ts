import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { bearerToken } from "@/lib/auth/session-user";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * A live Supabase session for the routes that need more than "who is calling"
 * (getVerifiedAuthUser): uploading to the caller's own storage folder and
 * changing their user_metadata.
 *
 * The browser has a cookie session, so the cookie client does both. The native
 * app only has an access token (`Authorization: Bearer`), and supabase-js can't
 * call auth.updateUser without a refresh token. So with a bearer:
 *   - the user is checked LIVE with getUser(token), not from local claims, since
 *     these routes write and a signed-out token must not keep working;
 *   - storage calls carry the token, so the bucket's per-user policies apply
 *     exactly as they do for the cookie client;
 *   - metadata goes through the service-role admin API for that same verified
 *     user id. GoTrue merges user_metadata keys on both paths.
 *
 * As in getVerifiedAuthUser, a bearer is authoritative: a bad one is null,
 * never a fallback to whatever cookie rides along.
 */
export interface LiveSession {
  user: User;
  storage: SupabaseClient["storage"];
  updateMetadata(data: Record<string, unknown>): Promise<{ error: Error | null }>;
}

export async function liveSession(): Promise<LiveSession | null> {
  const token = await bearerToken();
  if (!token) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return {
      user,
      storage: supabase.storage,
      updateMetadata: async data => ({ error: (await supabase.auth.updateUser({ data })).error }),
    };
  }

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user || user.is_anonymous) return null;
  return {
    user,
    storage: client.storage,
    updateMetadata: async data => {
      const admin = getSupabaseAdmin();
      if (!admin) return { error: new Error("SUPABASE_SERVICE_ROLE_KEY is not set") };
      return { error: (await admin.auth.admin.updateUserById(user.id, { user_metadata: data })).error };
    },
  };
}
