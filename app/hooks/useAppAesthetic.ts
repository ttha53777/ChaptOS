"use client";

import { useCallback } from "react";
import { APP_AESTHETIC, type AppAesthetic } from "@/lib/aesthetic";

/**
 * The app's aesthetic, which is always Paper (see lib/aesthetic.ts). Known on
 * the server and on first render, so no page renders its Ledger variant while
 * it waits for a mount.
 *
 * `setAesthetic` is kept so the hidden settings section still compiles, but it
 * does nothing: Ledger is not reachable.
 */
export function useAppAesthetic(): { aesthetic: AppAesthetic; setAesthetic: (next: AppAesthetic) => void } {
  const setAesthetic = useCallback((_next: AppAesthetic) => {}, []);
  return { aesthetic: APP_AESTHETIC, setAesthetic };
}
