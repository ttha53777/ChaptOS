"use client";

// The working line — Ask Chapt's loading state, drawn so nothing on screen has
// to move to make room for the answer (_design/Ask Chapt Loading Simple.html).
//
// THE RULE: every part of the turn stays where it is and becomes part of the
// answer.
//   • The status line rolls in place ("Reading the roster… · 1 of 2") and,
//     once the turn settles, becomes the trace ("Read 2 records in 11.4s").
//   • Each record is a chip: dashed while it is only a guess, sweeping while
//     the tool runs, green with its finding once the tool returns — and it
//     stays as the answer's record of what was consulted.
//   • AnswerSkeleton holds the verdict's space, so the verdict fills in where
//     the eye already is and the thread only ever grows downward.
//
// This replaced the reasoning ledger, which was a separate panel that lifted
// away before the answer mounted — a 180ms delay on every answer, and a jump.
//
// Honesty rules carry over from chat/intent.ts: a guessed chip never sweeps,
// never shows a finding, and is dropped as soon as the batch is known. A
// chip's finding is the server's step_done finding, never a running count —
// the row count isn't known until the tool returns, so the sweep is
// indeterminate on purpose.

import { useEffect, useRef, useState } from "react";

import { IcAlert, IcStop, IcTick, KindGlyph } from "./icons";
import { keywordsFor } from "./intent";
import type { LedgerStep } from "./types";
import { chipsFor, fmtElapsed, statusFor, type Chip, type StatusTone } from "./working-status";
import "./working-line.css";

/** Record → the glyph its screen uses. Unknown sources get the dot. */
const GLYPH: Record<string, string> = {
  roster: "roster", attendance: "attendance", events: "events", timeline: "timeline",
  treasury: "treasury", budget: "treasury", parties: "parties", programming: "programming",
  service: "service", fundraisers: "money", media: "instagram", files: "docs",
};
const glyphFor = (label: string) => GLYPH[label.split(/\s/)[0].toLowerCase()] ?? "dot";

/** Highlight the numeric/currency spans of a finding. */
function FindingText({ text }: { text: string }) {
  const parts = text.split(/([−-]?\$?[\d,]+(?:\.\d+)?%?)/g);
  return <>{parts.map((p, i) => (/^[−-]?\$?[\d,]+(?:\.\d+)?%?$/.test(p) ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>;
}

/**
 * The status text, rolling: the old line slides up and out as the new one
 * rises in. The thread is already a polite live region, so the current line is
 * announced from there; the outgoing copy is hidden so it isn't read twice.
 */
function RollText({ text }: { text: string }) {
  const seq = useRef(0);
  const [lines, setLines] = useState<Array<{ text: string; key: number; out?: boolean }>>([{ text, key: 0 }]);
  useEffect(() => {
    setLines(prev => {
      const cur = prev[prev.length - 1];
      if (cur.text === text) return prev;
      return [{ ...cur, out: true }, { text, key: ++seq.current }];
    });
  }, [text]);
  useEffect(() => {
    if (!lines.some(l => l.out)) return;
    const t = setTimeout(() => setLines(prev => prev.filter(l => !l.out)), 300);
    return () => clearTimeout(t);
  }, [lines]);
  return (
    <span className="wl-roll">
      {lines.map(l => (
        <span
          key={l.key}
          className={l.out ? "out" : l.key > 0 ? "in" : undefined}
          aria-hidden={l.out ? true : undefined}
        >
          {l.text}
        </span>
      ))}
    </span>
  );
}

/**
 * Chips that leave (a guess the model didn't take up) shrink away rather than
 * vanishing, so their neighbours slide over instead of jumping.
 */
function useLeaving(chips: Chip[]): Array<Chip & { leaving?: boolean }> {
  // Diffed during render, not in an effect: an effect would let the chip
  // vanish for a frame before reappearing as "leaving", which reads as a blink.
  const prev = useRef<Chip[]>([]);
  const gone = useRef(new Map<string, { chip: Chip; at: number; until: number }>());
  const [, rerender] = useState(0);
  const keys = new Set(chips.map(c => c.key));
  const t = Date.now();
  prev.current.forEach((c, i) => {
    if (!keys.has(c.key) && !gone.current.has(c.key)) gone.current.set(c.key, { chip: c, at: i, until: t + 400 });
  });
  for (const [k, g] of gone.current) if (keys.has(k) || g.until <= t) gone.current.delete(k);
  prev.current = chips;
  const pending = gone.current.size > 0;
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => rerender(n => n + 1), 420);
    return () => clearTimeout(timer);
  }, [pending]);
  if (!pending) return chips;
  const out: Array<Chip & { leaving?: boolean }> = [...chips];
  for (const g of [...gone.current.values()].sort((a, b) => a.at - b.at)) {
    out.splice(Math.min(g.at, out.length), 0, { ...g.chip, leaving: true });
  }
  return out;
}

function ChipView({ chip }: { chip: Chip & { leaving?: boolean } }) {
  return (
    <span className={`wl-chip ${chip.state}${chip.leaving ? " leaving" : ""}`}>
      {chip.state === "read"
        ? <span className="tk"><IcTick size={8} /></span>
        : <span className="gl"><KindGlyph kind={glyphFor(chip.label)} size={12} /></span>}
      <span className="lb">{chip.label}</span>
      {chip.state === "likely" && <span className="lk">likely</span>}
      {chip.finding && <span className="fd"><FindingText text={chip.finding} /></span>}
      {chip.reads > 1 && <span className="x">×{chip.reads}</span>}
    </span>
  );
}

function StatusIcon({ tone, failed }: { tone: StatusTone; failed?: boolean }) {
  if (tone === "done") return <span className="ok"><IcTick size={9} /></span>;
  if (tone === "halt") return <span className="halt">{failed ? <IcAlert size={11} /> : <IcStop size={10} />}</span>;
  return <span className="arc" />;
}

export function WorkingLine({ steps, intent, composing, live, startedAt, elapsedMs, stopped, failed, answered }: {
  steps: LedgerStep[];
  intent: string;
  composing?: boolean;
  live: boolean;
  startedAt?: number;
  elapsedMs?: number;
  stopped?: boolean;
  failed?: boolean;
  answered: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live || !startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [live, startedAt]);

  const elapsed = live ? (startedAt ? Math.max(0, now - startedAt) : undefined) : elapsedMs;
  const status = statusFor({ steps, intent, composing, live, elapsedMs: elapsed, stopped, failed, answered });
  // A settled turn shows only what was actually read.
  const chips = useLeaving(chipsFor(steps).filter(c => live || c.state === "read"));
  // Once this turn has shown a chip row, it keeps the row's space even when
  // every chip goes (all guesses dropped, an interrupted read) — otherwise the
  // placeholder or the answer below would jump up. A turn that mounts settled
  // and empty (history) never had a row and doesn't get one.
  const hadChips = useRef(false);
  if (chips.length > 0) hadChips.current = true;

  if (!status && chips.length === 0) return null;
  return (
    <div className={`wl${live ? " live" : ""}`}>
      {status && (
        <div className={`wl-status t-${status.tone}`}>
          <span className="wl-ic"><StatusIcon tone={status.tone} failed={failed} /></span>
          <RollText text={status.text} />
          {/* Ticks ten times a second — kept out of the live region. */}
          {live && elapsed !== undefined && <span className="wl-clock" aria-hidden>{fmtElapsed(elapsed)}</span>}
        </div>
      )}
      {(chips.length > 0 || hadChips.current) && (
        <div className="wl-chips">
          {chips.map(c => <ChipView key={c.key} chip={c} />)}
        </div>
      )}
    </div>
  );
}

/**
 * The verdict's space, held from the moment the question goes. Still while the
 * records are being read; it starts moving when the model starts writing.
 */
export function AnswerSkeleton({ writing }: { writing: boolean }) {
  return (
    <div className={`wl-skel${writing ? " on" : ""}`} aria-hidden>
      <i /><i />
    </div>
  );
}

/**
 * The question as the user typed it, with the words the guess keyed on marked
 * — only while its reply is live, then the marks fade.
 */
export function MarkedQuestion({ text, live }: { text: string; live: boolean }) {
  // Mount unmarked, then mark on the next frame, so the highlight sweeps in.
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(live));
    return () => cancelAnimationFrame(r);
  }, [live]);
  const spans = keywordsFor(text);
  if (spans.length === 0) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  spans.forEach(([s, e], i) => {
    if (s > at) out.push(text.slice(at, s));
    out.push(<span key={i} className={`wl-mark${on ? " on" : ""}`} style={{ transitionDelay: on ? `${120 + i * 140}ms` : "0ms" }}>{text.slice(s, e)}</span>);
    at = e;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}
