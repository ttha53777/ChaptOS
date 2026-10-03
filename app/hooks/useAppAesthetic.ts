"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_AESTHETIC_STORAGE_KEY, resolveAppAesthetic, type AppAesthetic } from "@/lib/aesthetic";

function readAesthetic(): AppAesthetic {
  try {
    return resolveAppAesthetic(localStorage.getItem(APP_AESTHETIC_STORAGE_KEY));
  } catch {
    return "ledger";
  }
}

/**
 * The stored Ledger / Paper choice. The resolved value is already on
 * <html data-aesthetic> (stamped by APP_AESTHETIC_BOOT); this only changes it.
 * `aesthetic` is null until mounted so the server render never guesses.
 */
export function useAppAesthetic() {
  const [aesthetic, setState] = useState<AppAesthetic | null>(null);

  useEffect(() => { setState(readAesthetic()); }, []);

  const setAesthetic = useCallback((next: AppAesthetic) => {
    try { localStorage.setItem(APP_AESTHETIC_STORAGE_KEY, next); } catch { /* private mode — still flips for this tab */ }
    document.documentElement.dataset.aesthetic = next;
    setState(next);
  }, []);

  return { aesthetic, setAesthetic };
}
