"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SIDEBAR_RAIL_STORAGE_KEY } from "@/lib/sidebar-rail";

// Per-viewer sidebar layout prefs. Every page renders its own <Sidebar>, so it
// remounts on each navigation: these read synchronously on the client (no
// open→closed flicker per page) and fall back to the server snapshot only during
// hydration, which is what useSyncExternalStore is for.

const CHANGE = "chaptos:sidebar-prefs";
const NEEDS_OPEN_KEY = "chaptos:sidebar-needs-open:v1";

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

function write(key: string, on: boolean) {
  try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* private mode — still applies for this tab */ }
}

/** Collapsed-to-rail state. The source of truth is <html data-sb>, which the CSS
 *  reads; React only needs it for labels and tooltips. */
export function useSidebarRail() {
  const rail = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.sb === "rail",
    () => false,
  );
  const setRail = useCallback((next: boolean) => {
    if (next) document.documentElement.dataset.sb = "rail";
    else delete document.documentElement.dataset.sb;
    write(SIDEBAR_RAIL_STORAGE_KEY, next);
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  return { rail, setRail };
}

/** Whether the officer "Needs you" list is unfolded. Closed by default. */
export function useNeedsOpen() {
  const open = useSyncExternalStore(
    subscribe,
    () => { try { return localStorage.getItem(NEEDS_OPEN_KEY) === "1"; } catch { return false; } },
    () => false,
  );
  const setOpen = useCallback((next: boolean) => {
    write(NEEDS_OPEN_KEY, next);
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  return { open, setOpen };
}
