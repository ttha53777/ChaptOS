"use client";
// The summary margin, as the app's SummaryCard draws it: the gist, the
// decisions, then the action items with their owners, each one tickable.
import type { Summary } from "./summarize";
import { Spark } from "./chrome";
import { ROLE_HOLDER } from "./roster";

export function SummaryCard({ summary, running, stale, onToggle, onResummarize, onHide }: {
  summary: Summary | null;
  running: boolean;
  stale: boolean;
  onToggle: (key: string) => void;
  onResummarize: () => void;
  onHide?: () => void;
}) {
  if (running) {
    return <div className="bld-sum" aria-live="polite">
      <div className="hd"><span className="chip"><Spark />Summarizing</span></div>
      <p className="run"><span className="spin" />Reading {summary?.lines ?? "the"} lines of minutes for decisions and owners…</p>
    </div>;
  }
  if (!summary) return null;
  return <div className={`bld-sum${stale ? " stale" : ""}`} aria-live="polite">
    <div className="hd">
      <span className="chip"><Spark />Summary</span>
      <span className="at">{stale ? "Notes changed since" : "Runs in your browser"}</span>
      {onHide && <button type="button" className="x" onClick={onHide} aria-label="Hide summary">×</button>}
    </div>
    {stale && <button type="button" className="restale" onClick={onResummarize}>Re-summarize to catch the new lines</button>}
    <p className="gist">{summary.gist}</p>
    <h5>Decisions</h5>
    {summary.decisions.length ? <ul className="dec">{summary.decisions.map(d => <li key={d}>{d}</li>)}</ul> : <p className="none">None recorded.</p>}
    <h5 className="acts-h">Action items</h5>
    {summary.actions.length ? (
      <ul className="acts">
        {summary.actions.map(a => (
          <li key={a.key}>
            <button type="button" className={`aitem${a.done ? " done" : ""}`} onClick={() => onToggle(a.key)} aria-pressed={a.done}>
              <span className="bx" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 13.2 9.4 18 19.5 6.4" /></svg></span>
              <span className="tx">
                <span className="t">{a.text}</span>
                <small>
                  {a.owner ? <span className={`own${a.role ? " role" : ""}`}>{a.owner}{a.role && ROLE_HOLDER[a.owner] && <em> ({ROLE_HOLDER[a.owner].split(" ")[0]})</em>}</span> : <span className="own none">No owner</span>}
                  {a.due && <> · by {a.due}</>}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    ) : <p className="none">No to-dos yet. Try a checklist line like “@Treasurer to send the reminder by Friday”.</p>}
  </div>;
}
