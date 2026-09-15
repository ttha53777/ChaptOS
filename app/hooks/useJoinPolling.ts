"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class JoinPollError extends Error {
  constructor(message: string, public status: number, public retryAfterMs = 0) {
    super(message);
    this.retryAfterMs = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0;
  }
}

export async function readJoinStatus(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    const seconds = Number(response.headers.get("Retry-After"));
    throw new JoinPollError(response.status === 401 ? "Your sign-in expired. Sign in again to check your request." : "Connection interrupted — retrying.", response.status, Number.isFinite(seconds) ? seconds * 1000 : 0);
  }
  return response.json();
}

/** No overlapping requests, hidden-tab polling, or state guesses on failure. */
export function useJoinPolling(load: (signal: AbortSignal) => Promise<void>, active: boolean) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(n => n + 1), []);
  const nextAllowedAt = useRef(0);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let failures = 0;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const schedule = (ms: number) => { clearTimeout(timer); timer = setTimeout(tick, ms); };
    async function tick() {
      if (stopped || inFlight) return;
      if (document.visibilityState === "hidden") { schedule(10_000); return; }
      if (Date.now() < nextAllowedAt.current) { schedule(nextAllowedAt.current - Date.now()); return; }
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15_000);
      inFlight = true;
      setChecking(true);
      let delay = 10_000;
      try {
        await loadRef.current(controller.signal);
        if (stopped) return;
        failures = 0;
        setError(null);
        setSessionExpired(false);
      } catch (e) {
        if (stopped) return;
        failures++;
        setSessionExpired(e instanceof JoinPollError && e.status === 401);
        setError(e instanceof JoinPollError ? e.message : "Connection interrupted — retrying.");
        delay = Math.max(Math.min(60_000, 5000 * 2 ** Math.min(failures, 4)) + Math.random() * 1000,
          e instanceof JoinPollError ? e.retryAfterMs : 0);
        nextAllowedAt.current = Date.now() + delay;
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!stopped) { setChecking(false); schedule(delay); }
      }
    }
    const onFocus = () => { if (document.visibilityState !== "hidden") void tick(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, revision]);
  return { error, sessionExpired, checking, retry };
}
