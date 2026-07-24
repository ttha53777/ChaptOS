"use client";

// The hybrid answer — a serif verdict sentence carrying the headline number,
// then tappable result rows, the server-derived Sources chips, follow-up
// chips, and the Helpful? feedback pair. Everything the model wrote renders
// as escaped text (React text nodes); the only markup honored is the single
// *emphasis* span in the verdict, parsed here — never injected as HTML.

import { IcChev, IcThumbDown, IcThumbUp, KindGlyph } from "./icons";
import { TraceBlock } from "./ReasoningLedger";
import { initialsOf, type AnswerData, type AnswerRow, type LedgerStep } from "./types";

function Verdict({ text }: { text: string }) {
  const m = /\*([^*]+)\*/.exec(text);
  if (!m || m.index === undefined) return <p className="verdict in in-2">{text.replace(/\*/g, "")}</p>;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length).replace(/\*/g, "");
  return (
    <p className="verdict in in-2">
      {before}<em>{m[1]}</em>{after}
    </p>
  );
}

function ResultRow({ row, selected, onAsk }: { row: AnswerRow; selected: boolean; onAsk: (q: string) => void }) {
  const tappable = Boolean(row.ask);
  return (
    <button
      type="button"
      className={`res${selected ? " sel" : ""}`}
      disabled={!tappable}
      onClick={() => row.ask && onAsk(row.ask)}
    >
      {row.kind === "person"
        ? <span className="av">{initialsOf(row.title)}</span>
        : <span className="glyph"><KindGlyph kind={row.kind} /></span>}
      <span className="rb">
        <span className="t">{row.title}</span>
        {row.subtitle && <span className="s">{row.subtitle}</span>}
      </span>
      {row.value && <span className="val">{row.value}</span>}
      <span className="chev"><IcChev /></span>
    </button>
  );
}

export function SourcesRow({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="sources">
      <span className="lbl">Sources</span>
      {sources.map(s => <span key={s} className="src"><i />{s}</span>)}
    </div>
  );
}

export function FeedbackRow({ value, onFeedback }: {
  value?: "up" | "down";
  onFeedback: (v: "up" | "down") => void;
}) {
  return (
    <div className="feedback">
      <span className="fl">Helpful?</span>
      <button type="button" className={`fbtn${value === "up" ? " on" : ""}`} aria-label="Helpful" onClick={() => onFeedback("up")}>
        <IcThumbUp />
      </button>
      <button type="button" className={`fbtn${value === "down" ? " on" : ""}`} aria-label="Not helpful" onClick={() => onFeedback("down")}>
        <IcThumbDown />
      </button>
    </div>
  );
}

export function AnswerBlock({ answer, steps, selectedRow, feedback, onAsk, onFeedback }: {
  answer: AnswerData;
  steps: LedgerStep[];
  /** Index of the keyboard-selected row, or -1. */
  selectedRow: number;
  feedback?: "up" | "down";
  onAsk: (q: string) => void;
  onFeedback: (v: "up" | "down") => void;
}) {
  return (
    <div className="answer">
      <TraceBlock steps={steps} />
      <Verdict text={answer.verdict} />
      {answer.rows.length > 0 && (
        <div className="reslist in in-3">
          {answer.rows.map((r, i) => (
            <ResultRow key={`${r.title}-${i}`} row={r} selected={i === selectedRow} onAsk={onAsk} />
          ))}
        </div>
      )}
      <div className="in in-4">
        <div className="meta-row">
          <SourcesRow sources={answer.sources} />
          <FeedbackRow value={feedback} onFeedback={onFeedback} />
        </div>
        {answer.follows.length > 0 && (
          <div className="follows">
            {answer.follows.map(f => (
              <button key={f.label} type="button" className="chip" onClick={() => onAsk(f.ask)}>{f.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
