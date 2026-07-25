"use client";

// The reasoning ledger — the thinking state made legible. Each tool call the
// server runs streams in as a step on a ruled margin: an active step spins, a
// settled step posts its finding (mono, right-aligned) to the margin, and the
// sources touched accrue as "Consulted" chips (the same chip the answer's
// Sources row uses). A standing final "Composing the answer" line makes the
// batch-honest plan legible: it stays pending until the steps settle, goes
// active when the model is writing, and the whole ledger collapses into a
// tappable trace above the verdict once the answer lands (see TraceBlock).

import { useState } from "react";
import { IcChev, IcTick } from "./icons";
import type { LedgerStep, StepStatus } from "./types";

const COMPOSE_VERB = "Composing the answer";

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
  for (const s of steps) if (s.source && !sources.includes(s.source)) sources.push(s.source);
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
    <div className={`trace${open ? " open" : ""}`}>
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
