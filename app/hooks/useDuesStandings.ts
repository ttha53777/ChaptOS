"use client";

import { useEffect, useSyncExternalStore } from "react";
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

interface Entry { data: DuesStandings | null; today: string | null; at: number; inflight: Promise<void> | null }

const FRESH_MS = 60_000;
const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** The org in the URL (/<slug>/…): a member of two chapters must not see one's standings in the other. */
function orgKey(): string {
  return typeof window === "undefined" ? "" : window.location.pathname.split("/")[1] ?? "";
}

function load(key: string): Promise<void> {
  const cur = store.get(key);
  if (cur?.inflight) return cur.inflight;
  const inflight = requestJson<DuesBoard>("/api/dues")
    .then(board => {
      store.set(key, { data: new Map(board.members.map(m => [m.brotherId, m])), today: board.today, at: Date.now(), inflight: null });
    })
    .catch(() => {
      store.set(key, { data: store.get(key)?.data ?? null, today: store.get(key)?.today ?? null, at: Date.now(), inflight: null });
    })
    .finally(emit);
  store.set(key, { data: cur?.data ?? null, today: cur?.today ?? null, at: cur?.at ?? 0, inflight });
  return inflight;
}

/** Re-fetch now, e.g. after handing out, recording, waiving or taking back. */
export function refreshDuesStandings(): Promise<void> {
  const key = orgKey();
  const cur = store.get(key);
  if (cur) store.set(key, { ...cur, at: 0, inflight: null });
  return load(key);
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
