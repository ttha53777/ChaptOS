"use client";

import { useState, useEffect, useCallback } from "react";

export interface CurrentUser {
  name: string;
  role: string;
  email: string;
  avatarUrl: string | null;
  hasCustomAvatar: boolean;
}

export function useCurrentUser(): {
  user: CurrentUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
  setAvatarUrl: (avatarUrl: string | null, hasCustomAvatar?: boolean) => void;
} {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const meta = authUser?.user_metadata ?? {};
      const avatarUrl = (meta.avatar_url as string | undefined) ?? null;
      const hasCustomAvatar = meta.custom_avatar === true;

      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("not ok");
      const data = await res.json() as { name: string; role: string; email: string };

      setUser({ name: data.name, role: data.role, email: data.email, avatarUrl, hasCustomAvatar });
    } catch {
      // silently fail — avatar just won't render
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setAvatarUrl = useCallback((avatarUrl: string | null, hasCustomAvatar = false) => {
    setUser(prev => (prev ? { ...prev, avatarUrl, hasCustomAvatar } : prev));
  }, []);

  return { user, loading, refetch: load, setAvatarUrl };
}
