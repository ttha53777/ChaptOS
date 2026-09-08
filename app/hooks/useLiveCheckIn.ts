"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/app/lib/api";
import type { LiveCheckIn } from "@/lib/services/attendance-service";

/** How often an open window re-reads the room's count. */
const POLL_MS = 20_000;

/**
 * The live check-in window for this org, kept current while one is open.
 *
 * Polling, not SSE: there is no EventSource anywhere in this codebase
 * (app/lib/sse.ts is POST-based and AI-specific), and a 20s interval is the
 * right resolution for "how many people are in the room".
 *
 * Two details are load-bearing:
 *   · The interval only runs while a window is OPEN. With no event — the 99%
 *     case — this fetches once on mount and then goes quiet, rather than
 *     polling an endpoint that will answer null all day.
 *   · visibilitychange re-syncs on foreground. Background tabs throttle timers
 *     to ≥60s, so without it the count is stale exactly when an officer looks
 *     back at the screen.
 */
export function useLiveCheckIn(enabled: boolean): {
  data: LiveCheckIn | null;
  refresh: () => Promise<void>;
  apply: (next: LiveCheckIn | null) => void;
} {
  const [data, setData] = useState<LiveCheckIn | null>(null);
  // Read inside the interval so a poll landing after the window closes doesn't
  // keep the timer alive on a stale closure.
  const inFlight = useRef<AbortController | null>(null);

  /**
   * Write a window straight into state — the server's answer from a mutation,
   * or an optimistic guess made at the moment of the tap.
   *
   * It cancels any poll in flight. Without that, a GET that left before the tap
   * can land after it and overwrite the optimistic state with a window that
   * predates the check-in, so the button visibly flips back to "I'm here" for
   * one interval.
   */
  const apply = useCallback((next: LiveCheckIn | null) => {
    inFlight.current?.abort();
    inFlight.current = null;
    setData(next);
  }, []);

  const refresh = useCallback(async () => {
    // Cancel a poll still in flight: requestJson applies a 15s default timeout
    // against a 20s interval, so overlapping requests are possible and only the
    // newest answer is worth having.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const next = await requestJson<LiveCheckIn | null>("/api/attendance/live", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setData(next ?? null);
    } catch {
      // A dropped poll is not worth surfacing — the next one is 20s away, and
      // an error banner over a live band would be worse than a stale count.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh(); // fire once immediately; otherwise the band is blank for 20s
    return () => { inFlight.current?.abort(); };
  }, [enabled, refresh]);

  const open = data?.state === "open" || data?.state === "closing";
  useEffect(() => {
    if (!enabled || !open) return;
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, open, refresh]);

  return { data, refresh, apply };
}
