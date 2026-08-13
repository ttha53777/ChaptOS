"use client";

// The hybrid answer — a serif verdict sentence carrying the headline number,
// then tappable result rows, the server-derived Sources chips, follow-up
// chips, and the Helpful? feedback pair. Everything the model wrote renders
// as escaped text (React text nodes); the only markup honored is the single
// *emphasis* span in the verdict, parsed here — never injected as HTML.

import { useState } from "react";

import { IcArrow, IcChev, IcPlus, IcSpark, IcThumbDown, IcThumbUp, KindGlyph } from "./icons";
import { TraceBlock } from "./ReasoningLedger";
import { initialsOf, rowAction, type AnswerData, type AnswerRow, type AskBack, type AskBackQuestion, type LedgerStep } from "./types";

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

/**
 * The glyph key for a row: its screen label when it has one (advisory rows
 * carry a destination but no meaningful `kind`), else its kind. Lowercased
 * because KindGlyph's cases are the lowercase screen names.
 */
function glyphKind(row: AnswerRow): string {
  if (row.screen && row.kind === "generic") return row.screen.label.toLowerCase();
  return row.kind;
}

function ResultRow({ row, selected, onAsk, onPeek, onNav, onIdea }: {
  row: AnswerRow;
  selected: boolean;
  onAsk: (q: string) => void;
  onPeek: (row: AnswerRow) => void;
  onNav: (row: AnswerRow) => void;
  onIdea: (row: AnswerRow) => void;
}) {
  // A row the server could identify opens its record; a suggested event opens
  // the idea panel that can schedule it; one that names a screen navigates
  // there; one that's none of those falls back to the model's follow-up
  // question. The affordance says which — a chevron opens a record on the spot,
  // a plus drafts the event here, an arrow leaves for a screen, the spark spends
  // a turn asking — and a row that resolved to none of them (an ambiguous name,
  // say) renders inert rather than looking identical to its neighbours and then
  // swallowing the tap.
  const action = rowAction(row);
  return (
    <button
      type="button"
      className={`res${selected ? " sel" : ""}${action ? "" : " inert"}${action === "idea" ? " idea" : ""}`}
      disabled={!action}
      onClick={() => {
        if (action === "peek") onPeek(row);
        else if (action === "idea") onIdea(row);
        else if (action === "nav") onNav(row);
        else if (action === "ask") onAsk(row.ask!);
      }}
    >
      {row.kind === "person"
        ? <span className="av">{initialsOf(row.title)}</span>
        // An advisory row's glyph comes from the screen it points at, not its
        // kind — the model has no reason to pick a kind for a recommendation,
        // so keying off it leaves a column of identical dots. KindGlyph already
        // understands screen-ish names (treasury, roster, timeline).
        : <span className="glyph"><KindGlyph kind={glyphKind(row)} /></span>}
      <span className="rb">
        <span className="t">{row.title}</span>
        {row.subtitle && <span className="s">{row.subtitle}</span>}
      </span>
      {row.value && <span className="val">{row.value}</span>}
      <span className={`chev${action === "ask" ? " ask" : ""}${action === "idea" ? " plus" : ""}`}>
        {action === "peek" && <IcChev />}
        {action === "idea" && <IcPlus />}
        {action === "nav" && <IcArrow />}
        {action === "ask" && <IcSpark size={14} />}
      </span>
    </button>
  );
}

/** Selected chips per question, keyed by the question's index in the block. */
type AskBackPicks = Record<number, string[]>;

/**
 * Fold the staged picks into one reply. Questions the user left alone are
 * omitted entirely rather than sent empty — an unanswered question is not the
 * same claim as "no constraints", and the model should be free to work without
 * it. Each answered question carries its own text so a two-question reply can't
 * arrive as a bare list of chips with nothing saying which asked what.
 */
function composeReply(questions: AskBackQuestion[], picks: AskBackPicks): string {
  return questions
    .map((q, i) => {
      const chosen = picks[i] ?? [];
      return chosen.length > 0 ? `${q.question} ${chosen.join(", ")}` : "";
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * The answer's questions back to the user, with likely replies as chips.
 *
 * The unit of a reply is the BLOCK, not the question. When the model asks two
 * things ("optimize for what?" AND "what constraints?") they are one request,
 * so a tap on the first must not fire a turn that throws the second away
 * unanswered — the user gets to answer both and send once. Within a question,
 * `select` decides what a tap means: "one" swaps the choice (they're
 * alternatives), "many" toggles it (they stack).
 *
 * The exception is a lone question, which still sends on the first tap: with
 * nothing else to answer, a Continue would be pure ceremony, and that single
 * tap is the common case this surface was built around.
 */
function AskBackBlock({ askback, onAsk }: { askback: AskBack; onAsk: (q: string) => void }) {
  const [picks, setPicks] = useState<AskBackPicks>({});
  const questions = askback.questions;
  // One question with no second thing to answer stays a single tap.
  const instant = questions.length === 1 && questions[0].select !== "many";
  const staged = Object.values(picks).some(v => v.length > 0);

  const tap = (qi: number, q: AskBackQuestion, chip: string) => {
    if (instant) { onAsk(`${q.question} ${chip}`); return; }
    setPicks(prev => {
      const cur = prev[qi] ?? [];
      if (q.select === "many") {
        return { ...prev, [qi]: cur.includes(chip) ? cur.filter(c => c !== chip) : [...cur, chip] };
      }
      // Exclusive: a second pick replaces the first, and re-tapping the
      // current one clears it, so a mis-tap is recoverable without a reload.
      return { ...prev, [qi]: cur[0] === chip ? [] : [chip] };
    });
  };

  return (
    <div className="askback in in-4">
      {askback.lead && <p className="ab-lead">{askback.lead}</p>}
      {questions.map((q, qi) => (
        <div className="ab-q" key={`${q.question}-${qi}`}>
          <span className="ab-qt">{q.question}</span>
          <div className="chiprow">
            {q.chips.map(c => {
              const on = !instant && (picks[qi] ?? []).includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  className={`chip${on ? " on" : ""}`}
                  aria-pressed={instant ? undefined : on}
                  onClick={() => tap(qi, q, c)}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {/* One send for the whole block, and only once there's something to send —
          so an untouched ask-back still reads as chips, not as a form. */}
      {!instant && staged && (
        <div className="ab-send">
          <button type="button" className="chip send" onClick={() => onAsk(composeReply(questions, picks))}>
            Continue<IcArrow />
          </button>
        </div>
      )}
    </div>
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

export function AnswerBlock({ answer, steps, selectedRow, feedback, onAsk, onPeek, onNav, onIdea, onFeedback }: {
  answer: AnswerData;
  steps: LedgerStep[];
  /** Index of the keyboard-selected row, or -1. */
  selectedRow: number;
  feedback?: "up" | "down";
  onAsk: (q: string) => void;
  onPeek: (row: AnswerRow) => void;
  onNav: (row: AnswerRow) => void;
  onIdea: (row: AnswerRow) => void;
  onFeedback: (v: "up" | "down") => void;
}) {
  return (
    <div className="answer">
      <TraceBlock steps={steps} />
      <Verdict text={answer.verdict} />
      {answer.rows.length > 0 && (
        <div className="reslist in in-3">
          {answer.rows.map((r, i) => (
            <ResultRow key={`${r.title}-${i}`} row={r} selected={i === selectedRow} onAsk={onAsk} onPeek={onPeek} onNav={onNav} onIdea={onIdea} />
          ))}
        </div>
      )}
      {answer.askback && <AskBackBlock askback={answer.askback} onAsk={onAsk} />}
      <div className="in in-4">
        <div className="meta-row">
          <SourcesRow sources={answer.sources} />
          <FeedbackRow value={feedback} onFeedback={onFeedback} />
        </div>
        {!answer.askback && answer.follows.length > 0 && (
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
