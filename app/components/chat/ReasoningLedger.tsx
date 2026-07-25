"use client";

// The reasoning ledger — the thinking state made legible. Each tool call the
// server runs streams in as a step on a ruled margin: an active step spins, a
// settled step posts its finding (mono, right-aligned) to the margin, and the
// sources touched accrue as "Consulted" chips (the same chip the answer's
// Sources row uses). A standing final "Composing the answer" line makes the
// batch-honest plan legible: it stays pending until the steps settle, goes
// active when the model is writing, and the whole ledger collapses into a
// tappable trace above the verdict once the answer lands (see TraceBlock).

import { useEffect, useState } from "react";
import { IcChev, IcTick } from "./icons";
import type { LedgerStep, StepStatus } from "./types";

const COMPOSE_VERB = "Composing the answer";

/** Matches the mock's resolve-out (.18s) — the ledger lifts before the answer mounts. */
export const HANDOFF_MS = 180;

/** Highlight the numeric/currency spans of a finding in violet, mock-style. */
function FindingText({ text }: { text: string }) {
  const parts = text.split(/(\$?[\d,]+(?:\.\d+)?%?)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\$?[\d,]+(?:\.\d+)?%?$/.test(p) ? <em key={i}>{p}</em> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function StepNode({ status }: { status: StepStatus }) {
  if (status === "active") return <span className="node"><span className="arc" /></span>;
  if (status === "done") return <span className="node"><span className="disc"><IcTick size={9} /></span></span>;
  return <span className="node"><span className="dot" /></span>;
}

function StepRow({ verb, status, finding, animate }: {
  verb: string;
  status: StepStatus;
  finding?: string;
  animate?: boolean;
}) {
  return (
    <div className={`lstep ${status}${animate ? " lstep-in" : ""}`}>
      <StepNode status={status} />
      <span className="lmain">
        <span className="lverb">{verb}</span>
        {finding && <span className={`lfind${animate ? " fin-in" : ""}`}><FindingText text={finding} /></span>}
      </span>
    </div>
  );
}

function ConsultedChips({ steps, label }: { steps: LedgerStep[]; label: string }) {
  const sources: string[] = [];
  // A guessed row has not consulted anything — only records the model actually
  // reached for may light a chip, or the strip would vouch for reading we
  // haven't done. Same rule as the answer's Sources row, which is server-derived.
  for (const s of steps) {
    if (s.provisional || !s.source) continue;
    if (!sources.includes(s.source)) sources.push(s.source);
  }
  if (sources.length === 0) return null;
  return (
    <div className="consulted">
      <span className="lbl">{label}</span>
      {sources.map(s => <span key={s} className="src chip-in"><i />{s}</span>)}
    </div>
  );
}

/**
 * Live variant — rendered while the request streams. The standing final line
 * goes active when the server says the model is writing (`composing`), falling
 * back to "every known step has settled" when no such signal arrived.
 */
export function ReasoningLedger({ steps, intent, composing: composingSignal }: {
  steps: LedgerStep[];
  intent: string;
  composing?: boolean;
}) {
  const done = steps.filter(s => s.status === "done").length;
  const composing = composingSignal || (steps.length > 0 && done === steps.length);
  // No steps means no plan yet — the model is still deciding. Showing a count
  // here used to render "1 / 1" through the longest wait of the request, i.e.
  // claiming the work was finished before any of it had started.
  const count = steps.length === 0
    ? null
    : composing
      ? "composing…"
      : `${Math.min(done + 1, steps.length + 1)} / ${steps.length + 1}`;
  return (
    <div className="reason">
      <div className="reason-intent">
        <span className="pulse"><i /></span>
        <span className="lbl">{intent}</span>
        {count && <span className="count">{count}</span>}
      </div>
      <div className="ledger">
        {steps.map(s => <StepRow key={s.id} verb={s.verb} status={s.status} finding={s.finding} animate />)}
        <StepRow verb={COMPOSE_VERB} status={composing ? "active" : "pending"} />
      </div>
      <ConsultedChips steps={steps} label="Consulted" />
    </div>
  );
}

/**
 * The mock's handoff: the deliberation lifts away, and only then does the answer
 * take its place — so the two never occupy the frame together. Costs one
 * resolve-out beat of time-to-answer, which is the deliberate trade.
 *
 * Local state on purpose. The thread's auto-scroll effect keys on `messages`,
 * so putting this phase there would fire a second smooth-scroll on the swap.
 * A turn that mounts already-answered (history, a reload) starts at "body" and
 * never animates.
 */
type HandoffPhase = "ledger" | "out" | "body";

export function LedgerHandoff({ showLedger, ledger, body }: {
  showLedger: boolean;
  ledger: React.ReactNode;
  body: React.ReactNode;
}) {
  const [phase, setPhase] = useState<HandoffPhase>(showLedger ? "ledger" : "body");

  useEffect(() => {
    if (showLedger) setPhase("ledger");
    else setPhase(p => (p === "ledger" ? "out" : p));
  }, [showLedger]);

  useEffect(() => {
    if (phase !== "out") return;
    // The reduced-motion rule kills the lift with !important, so holding here
    // would just park a static copy on screen. Swap on the same frame instead.
    const reduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setPhase("body"); return; }
    const t = setTimeout(() => setPhase("body"), HANDOFF_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "ledger") return <>{ledger}</>;
  if (phase === "out") return <div className="reason-out">{ledger}</div>;
  return <>{body}</>;
}

/** One-line summary for the collapsed trace: sources touched + the last finding. */
export function traceLabel(steps: LedgerStep[]): string {
  const sources: string[] = [];
  for (const s of steps) if (s.source && !sources.includes(s.source)) sources.push(s.source);
  const lastFinding = [...steps].reverse().find(s => s.finding)?.finding;
  const consulted = sources.length > 0 ? `Consulted ${sources.join(" · ")}` : "Worked it through";
  return lastFinding ? `${consulted} — ${lastFinding}` : consulted;
}

/**
 * Persisted variant — the deliberation collapsed to a tappable line above the
 * verdict, expanding to the frozen ledger so the reasoning stays auditable.
 */
export function TraceBlock({ steps }: { steps: LedgerStep[] }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  return (
    <div className={`trace in in-1${open ? " open" : ""}`}>
      <button type="button" className="trace-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="tk"><IcTick /></span>
        {traceLabel(steps)}
        <span className="cv"><IcChev /></span>
      </button>
      {open && (
        <div className="trace-body">
          <div className="ledger">
            {steps.map(s => <StepRow key={s.id} verb={s.verb} status="done" finding={s.finding} />)}
            <StepRow verb={COMPOSE_VERB} status="done" />
          </div>
          <ConsultedChips steps={steps} label="Consulted" />
        </div>
      )}
    </div>
  );
}
