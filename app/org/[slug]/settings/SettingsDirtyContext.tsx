"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Unsaved-changes tracking for Settings.
//
// Four sections hold a local draft and diff it against the persisted value to
// show an "Unsaved" pip (Thresholds, Vocabulary, Workflows, Member fields).
// Nothing used to stop you walking away from one: switching intent groups,
// clicking a filter result, or pressing "Index" all just re-rendered the page
// and dropped the draft on the floor without a word.
//
// Each section registers its EXISTING `dirty` boolean here via useDirtyGuard();
// the page reads `anyDirty` and interposes a confirm before it navigates. The
// sections keep owning their own draft state — this only records that a draft is
// outstanding, so adding a fifth section is a one-line change.

interface DirtyApi {
  /** True while at least one section has an unsaved draft. */
  anyDirty: boolean;
  /** Register/clear a section's dirty state. Stable identity. */
  setDirty: (id: string, dirty: boolean) => void;
}

const SettingsDirtyContext = createContext<DirtyApi | null>(null);

export function SettingsDirtyProvider({ children }: { children: React.ReactNode }) {
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());

  const setDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds(prev => {
      // Bail out when nothing changes so a section re-rendering on every
      // keystroke doesn't re-render the whole page with it.
      if (prev.has(id) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const anyDirty = dirtyIds.size > 0;

  // Tab close / reload / external link. The in-app guard can't see these.
  useEffect(() => {
    if (!anyDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Legacy browsers need returnValue set; the string itself is ignored and
      // the browser shows its own copy.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  const value = useMemo(() => ({ anyDirty, setDirty }), [anyDirty, setDirty]);
  return <SettingsDirtyContext.Provider value={value}>{children}</SettingsDirtyContext.Provider>;
}

/**
 * Register a section's unsaved-draft state under a stable id.
 *
 * Safe to call outside the provider (returns a no-op) so section components stay
 * usable on their own — e.g. in a test that renders one in isolation.
 */
export function useDirtyGuard(id: string, dirty: boolean) {
  const ctx = useContext(SettingsDirtyContext);
  const setDirty = ctx?.setDirty;
  useEffect(() => {
    if (!setDirty) return;
    setDirty(id, dirty);
    // Unmounting means the section left the page (group switch, permission
    // change) — its draft is gone, so it must stop blocking navigation.
    return () => setDirty(id, false);
  }, [id, dirty, setDirty]);
}

/** Read the aggregate dirty state. Null outside the provider. */
export function useSettingsDirty(): DirtyApi | null {
  return useContext(SettingsDirtyContext);
}
