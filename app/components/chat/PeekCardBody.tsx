"use client";

// The body of a peek card — who/what it is, its facts, its sections. Shared by
// the peek sheet (a tapped row) and the inline record (an answer that WAS one
// record), so a card reads the same wherever it shows up and the two can't
// drift into showing different facts for the same thing.

import type { ReactNode } from "react";

import { KindGlyph } from "./icons";
import { initialsOf, type AnswerRow, type PeekCard, type PeekTone } from "./types";

export function toneClass(tone?: PeekTone): string {
  return tone ? ` t-${tone}` : "";
}

export function PeekCardBody({ card, title, subtitle, kind, aside }: {
  /** Null while the fetch is in flight: the header alone is drawn. */
  card: PeekCard | null;
  title: string;
  subtitle?: string;
  kind: AnswerRow["kind"];
  /** Extra in the header, after the badge — the inline record puts the asked-for figure here. */
  aside?: ReactNode;
}) {
  return (
    <>
      <div className="peek-id">
        {kind === "person"
          ? <span className="av">{initialsOf(title)}</span>
          : <span className="glyph"><KindGlyph kind={kind} /></span>}
        <span className="peek-name">
          <span className="t">{title}</span>
          {subtitle && <span className="s">{subtitle}</span>}
        </span>
        {card?.badge && <span className={`peek-badge${toneClass(card.badge.tone)}`}>{card.badge.label}</span>}
        {aside}
      </div>

      {/* Facts arrive together — until they do, the header alone is on screen,
          which is still more than the row said. */}
      {card && card.facts.length > 0 && (
        <div className="peek-facts in in-2">
          {card.facts.map(f => (
            <div key={f.k} className="fact">
              <span className="k">{f.k}</span>
              <span className={`v${f.mono ? " mono" : ""}${toneClass(f.tone)}`}>{f.v}</span>
            </div>
          ))}
        </div>
      )}

      {card?.sections.map(sec => (
        <div key={sec.label} className="peek-sec in in-3">
          <div className="sec-lbl">{sec.label}</div>
          {sec.rows.length === 0
            ? <div className="sec-empty">{sec.empty ?? "Nothing here."}</div>
            : (
              <div className="sec-rows">
                {sec.rows.map((r, i) => (
                  <div key={`${r.title}-${i}`} className="sec-row">
                    <span className="rb">
                      <span className="t">{r.title}</span>
                      {r.subtitle && <span className="s">{r.subtitle}</span>}
                    </span>
                    {r.value && <span className={`val${toneClass(r.tone)}`}>{r.value}</span>}
                  </div>
                ))}
              </div>
            )}
        </div>
      ))}
    </>
  );
}
