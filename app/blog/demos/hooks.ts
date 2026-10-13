"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Awareness } from "y-protocols/awareness";
import { MENTIONS } from "./roster";
import { keyOf, summarize, type Summary } from "./summarize";

/**
 * Docs that live exactly as long as the component: made in an effect (not
 * useMemo) so Strict Mode's mount → unmount → mount gets fresh ones instead of
 * reusing destroyed docs. null until mounted.
 */
export function useLive<T>(make: () => { value: T; dispose: () => void }): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    const made = make();
    setValue(made.value);
    return () => { made.dispose(); setValue(null); };
    // `make` is a per-demo constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/** True once the element has been half on screen. */
export function useSeen(ref: RefObject<HTMLElement | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/** Summarize over a live note: run, tick, and know when the notes moved on. */
export function useSummary() {
  const [text, setText] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [summarizedText, setSummarizedText] = useState<string | null>(null);
  const ticked = useRef(new Set<string>());
  const textRef = useRef(text); textRef.current = text;

  const run = useCallback(() => {
    setRunning(true);
    setSummary(s => s ?? summarize(textRef.current, MENTIONS, ticked.current));
    setTimeout(() => {
      const t = textRef.current;
      setSummary(summarize(t, MENTIONS, ticked.current));
      setSummarizedText(t);
      setRunning(false);
    }, 1100);
  }, []);

  const toggle = useCallback((key: string) => {
    setSummary(s => {
      if (!s) return s;
      const actions = s.actions.map(a => a.key === key ? { ...a, done: !a.done } : a);
      const item = actions.find(a => a.key === key);
      if (item?.done) ticked.current.add(keyOf(item.text)); else if (item) ticked.current.delete(keyOf(item.text));
      return { ...s, actions };
    });
  }, []);

  const stale = !!summary && !running && summarizedText !== null && summarizedText !== text;
  return { setText, summary, running, stale, run, toggle };
}

export type Presence = { id: number; name: string; color: string; typing: boolean };
/** Everyone else in the doc, as the app's presence avatars list them. */
export function usePresence(awareness: Awareness | null) {
  const [peers, setPeers] = useState<Presence[]>([]);
  useEffect(() => {
    if (!awareness) return;
    const read = () => {
      const out: Presence[] = [];
      for (const [id, state] of awareness.getStates()) {
        if (id === awareness.clientID || !state.user) continue;
        out.push({ id, name: state.user.name, color: state.user.color, typing: !!state.typing || !!state.cursor });
      }
      setPeers(out);
    };
    read();
    awareness.on("change", read);
    return () => awareness.off("change", read);
  }, [awareness]);
  return peers;
}
