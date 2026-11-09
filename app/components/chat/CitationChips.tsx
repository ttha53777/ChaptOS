"use client";

// Where in an attached file an answer row came from. Every chip is a unit the
// server showed the model this turn (citations are attested, never trusted),
// and tapping one opens that passage's extracted text.

import { IcFile, IcSheet } from "./icons";
import type { AnswerCitation } from "./types";

export function CitationChips({ citations, onOpen, className = "" }: {
  citations: AnswerCitation[] | undefined;
  onOpen: (c: AnswerCitation) => void;
  className?: string;
}) {
  if (!citations?.length) return null;
  return (
    <div className={`cites ${className}`}>
      {citations.map(c => (
        <button key={`${c.attachmentId}:${c.unit}`} type="button" className="cite-chip" onClick={() => onOpen(c)}>
          {c.kind === "xlsx" || c.kind === "csv" ? <IcSheet size={12} /> : <IcFile size={12} />}
          <span className="cn">{c.name}</span>
          <span className="cl">{c.locator}</span>
        </button>
      ))}
    </div>
  );
}

/** Keep only well-formed citations from an untrusted payload. */
export function parseCitations(raw: unknown): AnswerCitation[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((c): c is AnswerCitation =>
    !!c && typeof c === "object"
    && typeof (c as AnswerCitation).attachmentId === "string"
    && typeof (c as AnswerCitation).unit === "string"
    && typeof (c as AnswerCitation).name === "string"
    && typeof (c as AnswerCitation).locator === "string");
  return out.length ? out : undefined;
}
