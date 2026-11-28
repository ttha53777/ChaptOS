"use client";

import { useEffect, useRef, useState } from "react";
import { createMarkMachine, markStateFor, type MarkFacts, type MarkMachine, type MarkState } from "@/lib/chat/mark-state";

/**
 * The face the header mark wears, from facts ChatWidget already has.
 *
 * ChatWidget re-renders on every streamed delta. This recomputes the target
 * each time (cheap) but only sets state when the machine's shown face changes
 * (lib/chat/mark-state.ts: dwell, done hold), so the returned string — and
 * the memoized ChaptMark under it — changes only at real phase boundaries.
 */
export function useMarkState(facts: MarkFacts): MarkState {
  const target = markStateFor(facts);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [shown, setShown] = useState<MarkState>(() => (target === "done" ? "idle" : target));
  const machine = useRef<MarkMachine | null>(null);

  // Built in an effect (not during render) so StrictMode's mount → unmount →
  // mount disposes one machine and builds another, never reuses a dead one.
  useEffect(() => {
    const m = createMarkMachine(targetRef.current, setShown);
    machine.current = m;
    setShown(m.shown);
    return () => { m.dispose(); machine.current = null; };
  }, []);

  useEffect(() => { machine.current?.set(target); }, [target]);

  return shown;
}
