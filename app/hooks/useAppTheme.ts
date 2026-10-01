"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_THEME_STORAGE_KEY, isAppThemePref, resolveAppTheme, type AppThemePref } from "@/lib/theme";

function readPref(): AppThemePref {
  try {
    const v = localStorage.getItem(APP_THEME_STORAGE_KEY);
    return isAppThemePref(v) ? v : "dusk";
  } catch {
    return "dusk";
  }
}

function apply(pref: AppThemePref) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveAppTheme(pref, prefersDark);
}

/**
 * The stored Dark / Light / System choice. The resolved theme is already on
 * <html data-theme> (stamped by APP_THEME_BOOT); this only changes it. `pref` is
 * null until mounted so the server render never guesses.
 */
export function useAppTheme() {
  const [pref, setPrefState] = useState<AppThemePref | null>(null);

  useEffect(() => { setPrefState(readPref()); }, []);

  // "System" follows the OS live, not just at page load.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setPref = useCallback((next: AppThemePref) => {
    try { localStorage.setItem(APP_THEME_STORAGE_KEY, next); } catch { /* private mode — still flips for this tab */ }
    apply(next);
    setPrefState(next);
  }, []);

  return { pref, setPref };
}
