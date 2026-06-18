"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "../lib/api";

export interface ActiveSemester {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
}

export interface SemesterRow {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

/**
 * Per-org-slug cache of the FULL semester list (GET /api/semesters). Shared by
 * every hook below so the many forms that read semester state don't each refetch.
 * `undefined` = never fetched for this slug; an array = loaded (possibly empty).
 *
 * A bumped version per slug lets `refresh()` invalidate the cache so the next
 * render refetches — used after the no-semester gate creates/extends a semester.
 */
const listCache = new Map<string, SemesterRow[]>();
const versions = new Map<string, number>();

function slugKey(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("/")[1] || "";
}

function activeFrom(rows: SemesterRow[]): ActiveSemester | null {
  const active = rows.find(r => r.isActive);
  return active
    ? { id: active.id, label: active.label, startDate: active.startDate, endDate: active.endDate }
    : null;
}

export interface SemestersState {
  /** False until the GET /api/semesters fetch resolves for this slug. Gates the
   *  no-semester modal so it never flashes before we know there's no active one. */
  loaded: boolean;
  /** Full list, newest id first (the API orders by id desc). */
  semesters: SemesterRow[];
  /** The active semester, or null when none. */
  active: ActiveSemester | null;
  /** The most-recent semester (highest id), or null when the org has none — the
   *  candidate the gate offers to "extend". */
  mostRecent: SemesterRow | null;
  /** Invalidate this slug's cache and refetch (call after create/extend). */
  refresh: () => void;
}

/**
 * Full semester state for the current org, with an explicit `loaded` flag and a
 * `refresh()` invalidator. The backend is the real enforcement
 * (lib/services/semester-bounds.ts); this drives the no-active-semester gate and
 * date-picker bounds.
 */
export function useSemesters(enabled = true): SemestersState {
  const key = slugKey();
  const [version, setVersion] = useState(() => versions.get(key) ?? 0);
  const [rows, setRows] = useState<SemesterRow[] | undefined>(() => listCache.get(key));

  useEffect(() => {
    // Skip the fetch when disabled (e.g. the gate on an off-app route with no org
    // context) so public pages don't fire a failing GET /api/semesters.
    if (!enabled) return;
    const cached = listCache.get(key);
    if (cached !== undefined) {
      setRows(cached);
      return;
    }
    let cancelled = false;
    requestJson<SemesterRow[]>("/api/semesters")
      .then(list => {
        listCache.set(key, list);
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        // Leave unloaded on failure; the backend still enforces the range. The
        // gate treats "not loaded" as "don't block", so a fetch error won't trap
        // the user behind an un-resolvable modal.
        if (!cancelled) setRows(undefined);
      });
    return () => { cancelled = true; };
  }, [key, version, enabled]);

  const refresh = useCallback(() => {
    listCache.delete(key);
    const next = (versions.get(key) ?? 0) + 1;
    versions.set(key, next);
    setVersion(next);
  }, [key]);

  const loaded = rows !== undefined;
  const semesters = rows ?? [];
  return {
    loaded,
    semesters,
    active: loaded ? activeFrom(semesters) : null,
    mostRecent: semesters.length > 0 ? semesters[0]! : null,
    refresh,
  };
}

/**
 * The org's active semester (or null if none / still loading), used to bound
 * date pickers via min/max. Thin wrapper over useSemesters for the many callers
 * that only need the active period.
 */
export function useActiveSemester(): ActiveSemester | null {
  return useSemesters().active;
}
