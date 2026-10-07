"use client";

/**
 * Who (if anyone) is already signed in on /create. Founding a second org skips
 * the Google ticket entirely, and the name step says that this makes a separate
 * org from the one they're in.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface CreateSession {
  name: string;
  email: string | null;
  /** Orgs they already belong to (empty for a brand-new account). */
  orgs: { name: string; slug: string }[];
}

export function useSession(): { session: CreateSession | null; signOut: () => Promise<void> } {
  const [session, setSession] = useState<CreateSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (cancelled || !data.user) return;
        const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
        const email = data.user.email ?? null;
        const name = meta.full_name || meta.name || email?.split("@")[0] || "you";
        setSession({ name, email, orgs: [] });
        // A brand-new account 401s here (no Brother yet) — that's "no orgs".
        const res = await fetch("/api/auth/me").catch(() => null);
        if (cancelled || !res?.ok) return;
        const me = await res.json().catch(() => null);
        const orgs = Array.isArray(me?.memberships)
          ? (me.memberships as { orgName?: string; orgSlug?: string }[])
              .filter(m => m.orgName && m.orgSlug)
              .map(m => ({ name: m.orgName!, slug: m.orgSlug! }))
          : [];
        if (!cancelled) setSession(s => (s ? { ...s, orgs } : s));
      } catch {
        // Signed out, or Supabase unreachable — the ticket offers Google either way.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await createClient().auth.signOut();
    } catch {
      // ignore — we only need the local session gone
    }
    setSession(null);
  }, []);

  return { session, signOut };
}
