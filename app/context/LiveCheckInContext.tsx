"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useLiveCheckIn } from "../hooks/useLiveCheckIn";
import type { LiveCheckIn } from "@/lib/services/attendance-service";

/**
 * One poll of /api/attendance/live, shared by every surface that shows it.
 *
 * The window now appears in two places — the full band on the dashboard and the
 * compact bar that follows a member onto every other page — and each of them
 * calling useLiveCheckIn() would mean two intervals hitting the endpoint on the
 * one page where both are mounted. The provider owns the single poll; both
 * surfaces read it.
 *
 * It also carries `apply`, which is what makes an optimistic check-in possible:
 * the tap can write the expected window straight into the shared state and let
 * the server's answer reconcile it, instead of every consumer holding its own
 * copy that drifts from the others.
 */
type LiveCheckInValue = {
  data: LiveCheckIn | null;
  refresh: () => Promise<void>;
  /** Replace the shared window — the server's answer, or an optimistic guess. */
  apply: (next: LiveCheckIn | null) => void;
};

const Ctx = createContext<LiveCheckInValue | null>(null);

export function LiveCheckInProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { data, refresh, apply } = useLiveCheckIn(enabled);
  const value = useMemo(() => ({ data, refresh, apply }), [data, refresh, apply]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The shared window. Returns an inert value outside the provider rather than
 * throwing: the provider mounts inside the org chrome, and components that also
 * render on auth routes must not explode there.
 */
export function useSharedLiveCheckIn(): LiveCheckInValue {
  const ctx = useContext(Ctx);
  return ctx ?? INERT;
}

const INERT: LiveCheckInValue = {
  data: null,
  refresh: async () => {},
  apply: () => {},
};
