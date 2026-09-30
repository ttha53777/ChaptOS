"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every minute and when the tab regains focus, so
 *  "is this event over" flips without a reload. */
export function useNow(tickMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const sync = () => setNow(new Date());
    const id = setInterval(sync, tickMs);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", sync); };
  }, [tickMs]);
  return now;
}
