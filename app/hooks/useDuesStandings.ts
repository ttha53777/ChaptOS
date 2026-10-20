"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { DuesBoard, MemberDuesStanding } from "@/lib/api-types/dues";
import { requestJson } from "../lib/api";

/**
 * Where every member stands on dues — overdue and how late, owing but not yet
 * due, paid up — across every live charge (GET /api/dues, no term).
 *
 * The roster, the dashboard and the member card all read this so "overdue"
 * means the same thing everywhere, and none of them re-derive it from the bare
 * duesOwed balance (which can say *how much* but never *since when*). One fetch
 * per org, shared by every caller and kept for a minute; any dues write calls
 * refreshDuesStandings() so the next render reflects it.
 *
 * Null until loaded, or if the load failed — callers fall back to duesOwed.
 */
export type DuesStandings = ReadonlyMap<number, MemberDuesStanding>;

interface Entry { data: DuesStandings | null; today: string | null; at: number; inflight: Promise<void> | null; seq: number }

const FRESH_MS = 60_000;
const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
// Told on every refreshDuesStandings(): the treasury's term-scoped board keeps its
// own state, so it listens here instead of every writer having to know about it.
const changeListeners = new Set<() => void>();

/** The org in the URL (/<slug>/…): a member of two chapters must not see one's standings in the other. */
function orgKey(): string {
  return typeof window === "undefined" ? "" : window.location.pathname.split("/")[1] ?? "";
}

function load(key: string): Promise<void> {
  const cur = store.get(key);
  if (cur?.inflight) return cur.inflight;
  // A load that started before a write can land after the refresh that followed
  // it; only the newest load may write, or the pre-write numbers come back.
  const seq = (cur?.seq ?? 0) + 1;
  const settle = (patch: Partial<Entry>) => {
    const now = store.get(key);
    if (now?.seq !== seq) return;
    store.set(key, { ...now, at: Date.now(), inflight: null, ...patch });
  };
  const inflight = requestJson<DuesBoard>("/api/dues")
    .then(board => settle({ data: new Map(board.members.map(m => [m.brotherId, m])), today: board.today }))
    .catch(() => settle({}))
    .finally(emit);
  store.set(key, { data: cur?.data ?? null, today: cur?.today ?? null, at: cur?.at ?? 0, inflight, seq });
  return inflight;
}

/** Re-fetch now, e.g. after handing out, recording, waiving or taking back. */
export function refreshDuesStandings(): Promise<void> {
  const key = orgKey();
  const cur = store.get(key);
  if (cur) store.set(key, { ...cur, at: 0, inflight: null });
  changeListeners.forEach(l => l());
  return load(key);
}

/** Run `cb` after any dues write anywhere in the app (see refreshDuesStandings). */
export function useOnDuesChanged(cb: () => void) {
  const ref = useRef(cb);
  useEffect(() => { ref.current = cb; });
  useEffect(() => {
    const l = () => ref.current();
    changeListeners.add(l);
    return () => { changeListeners.delete(l); };
  }, []);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useDuesStandings(enabled = true): DuesStandings | null {
  const data = useSyncExternalStore(subscribe, () => store.get(orgKey())?.data ?? null, () => null);
  useEffect(() => {
    if (!enabled) return;
    const key = orgKey();
    const cur = store.get(key);
    if (!cur || (!cur.inflight && Date.now() - cur.at > FRESH_MS)) void load(key);
  }, [enabled]);
  return enabled ? data : null;
}
