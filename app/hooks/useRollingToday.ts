"use client";

import { useEffect, useState } from "react";
import { todayISO } from "@/lib/dates";

/** How often to re-check whether the local date has rolled over. */
const TICK_MS = 60_000;

/**
 * Today's local date as "YYYY-MM-DD", kept current for the life of the page.
 *
 * A dashboard is routinely left open overnight or across a weekend. Deriving
 * "today" once at mount freezes the week's agenda and every overdue calculation
 * with it, so this re-checks on a timer and whenever the tab is brought back to
 * the foreground (the common laptop-reopened-next-morning case, where timers
 * may have been throttled while hidden).
 *
 * The initial value is the UTC date rather than the local one so server and
 * client render identically; the effect corrects it to local on mount. Without
 * that split, a viewer whose local date differs from the server's would
 * hydrate against mismatched markup.
 */
export function useRollingToday(): string {
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const sync = () => setToday(prev => {
      const next = todayISO();
      return next === prev ? prev : next;
    });

    sync(); // correct the SSR-safe UTC seed to the viewer's local date
    const id = setInterval(sync, TICK_MS);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return today;
}
