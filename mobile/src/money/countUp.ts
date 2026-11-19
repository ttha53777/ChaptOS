/**
 * A balance counts up to its value the first time its screen opens in a session (motion
 * plan U9), then just shows it. The roll itself is ~/paper/TickingNumber's; this decides
 * whether to start from zero. Reduced motion: no count, the figure is simply there.
 */
import { useEffect, useState } from "react";
import { useMotion } from "~/theme/PaperProvider";

const seen = new Set<string>();

export function useCountUp(key: string, value: number | null): number | null {
  const m = useMotion();
  const first = !seen.has(key) && !m.reduced;
  const [shown, setShown] = useState<number | null>(first ? 0 : value);
  useEffect(() => {
    if (value == null) return;
    if (seen.has(key) || m.reduced) { setShown(value); seen.add(key); return; }
    seen.add(key);
    const t = setTimeout(() => setShown(value), m.t(220));
    return () => clearTimeout(t);
  }, [key, value, m]);
  return value == null ? null : shown;
}
