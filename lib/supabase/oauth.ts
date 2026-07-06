import { createClient } from "@/lib/supabase/client";

/**
 * Kick off Google OAuth from the browser. The callback URL carries forward
 * whatever routing hints we have so /auth/callback can land the user in the
 * right place:
 *   - { next, org }        sign-in: original deep-link path + any org context
 *   - { intent: "create" } new founder → /welcome/create after auth
 * All hints are optional; a bare sign-in works with none of them.
 *
 * Returns null on a clean redirect kickoff, or a user-facing error string.
 * On success the browser navigates away to Google, so the caller only sees a
 * return value in the failure case.
 */
export async function signInWithGoogle(
  opts: { next?: string | null; org?: string | null } | { intent: "create" },
): Promise<string | null> {
  try {
    const supabase = createClient();
    const params = new URLSearchParams();
    if ("intent" in opts) {
      params.set("intent", opts.intent);
    } else {
      if (opts.org)  params.set("org", opts.org);
      if (opts.next) params.set("next", opts.next);
    }
    const qs = params.toString();
    const callbackUrl = `${window.location.origin}/auth/callback${qs ? `?${qs}` : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) return "Sign-in failed. Please try again.";
    return null;
  } catch {
    return "Sign-in failed. Please try again.";
  }
}
