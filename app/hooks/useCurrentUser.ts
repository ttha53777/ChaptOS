"use client";

import { useState, useEffect } from "react";

export interface CurrentUser {
  name: string;
  role: string;
  email: string;
  avatarUrl: string | null;
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Get Supabase user for avatar_url (populated by Google OAuth)
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const avatarUrl = (authUser?.user_metadata?.avatar_url as string | undefined) ?? null;

        // Get name + role from the linked Brother record
        const res = await fetch("/api/auth/me");
        if (!res.ok) throw new Error("not ok");
        const data = await res.json() as { name: string; role: string; email: string };

        if (!cancelled) {
          setUser({ name: data.name, role: data.role, email: data.email, avatarUrl });
        }
      } catch {
        // silently fail — avatar just won't render
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { user, loading };
}
