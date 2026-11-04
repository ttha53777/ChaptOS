"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "@/app/lib/api";
import type { LiveCheckIn } from "@/lib/services/attendance-service";

/** How often an open window re-reads the room's count. */
const POLL_MS = 12_000;

/** How often a page with no open window asks whether one has opened. */
const IDLE_POLL_MS = 60_000;

/**
 * The live check-in window for this org, kept current while one is open.
 *
 * Polling, not SSE: there is no EventSource anywhere in this codebase
 * (app/lib/sse.ts is POST-based and AI-specific), and a 12s interval is the
 * right resolution for "how many people are in the room".
 *
 * Three details are load-bearing:
 *   · The page keeps asking even with no window open, just slowly. It used to
 *     fetch once on mount and go quiet, and the provider lives in the root
 *     layout, so a member who loaded the dashboard before the officer opened
 *     check-in never saw the band without a hard reload — and was recorded
 *     absent when it closed. The idle answer is null after two indexed reads.
 *   · Hidden tabs skip the poll entirely; the foreground re-sync below catches
 *     them up the moment they're looked at. A phone in a pocket costs nothing.
 *   · visibilitychange/focus re-sync whether or not a window is open. That is
 *     the common path for a member: unlock the phone in the room, see the band.
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
    // against a 12s interval, so overlapping requests are possible and only the
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
      // A dropped poll is not worth surfacing — the next one is 12s away, and
      // an error banner over a live band would be worse than a stale count.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh(); // fire once immediately; otherwise the band is blank until the first interval
    return () => { inFlight.current?.abort(); };
  }, [enabled, refresh]);

  const open = data?.state === "open" || data?.state === "closing";
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, open ? POLL_MS : IDLE_POLL_MS);
    // focus as well as visibilitychange: a desktop browser window uncovered by
    // another app never becomes "hidden", so only focus fires. A double fire is
    // harmless — refresh() aborts the request already in flight.
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, open, refresh]);

  return { data, refresh, apply };
}
