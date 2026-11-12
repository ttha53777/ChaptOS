"use client";

// The record (_design/Ask Chapt List Forms Mock.html §05) — a lookup for one
// thing answered with the thing: the peek card itself, inline, built by the
// same service as the peek sheet (so it shows exactly what tapping the row
// would). The row's own value rides on the card's head, so the fact that was
// asked for ("lowest GPA") is on the card, not only in the sentence.

import { IcChev } from "../icons";
import { PeekCardBody } from "../PeekCardBody";
import { rowAction, type AnswerRow, type PeekCard, type RecordShape } from "../types";
import { daysBetween, dayNum, dowShort, iv, monShort, useSelectedScroll, type RowHandlers } from "./common";

/** "in 23 days", "today", "3 days ago" — from the card's own date. */
function countdown(date: string): string {
  const n = daysBetween(new Date().toISOString().slice(0, 10), date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/**
 * The Fact card (_design/Ask Chapt Answer System Mock.html#facts): one dated
 * record — an event, a deadline — as a ticket. The date stub sits where the eye
 * starts, the card's own facts in a grid, and the button that opens it.
 */
function Ticket({ card, row, h }: { card: PeekCard & { date: string }; row: AnswerRow; h: RowHandlers }) {
  const ahead = daysBetween(new Date().toISOString().slice(0, 10), card.date) >= 0;
  return (
    <div className={`fc${h.selectedRow === 0 ? " sel" : ""}${ahead ? "" : " past"}`}>
      <div className="fc-stub"><span className="m">{monShort(card.date)}</span><span className="d">{dayNum(card.date)}</span><span className="w">{dowShort(card.date).toUpperCase()}</span></div>
      <div className="fc-b">
        <div className="fc-h">
          <h3>{card.title}</h3>
          {card.badge && <span className="fc-badge">{card.badge.label}</span>}
          <span className="fc-when">{countdown(card.date)}</span>
        </div>
        <dl className="fc-dl">
          {card.facts.map(f => (
            <div key={f.k}><dt>{f.k}</dt><dd className={f.mono ? "mono" : undefined}>{f.v}</dd></div>
          ))}
        </dl>
        {rowAction(row) && (
          <div className="fc-act">
            <button type="button" className="sp-go" onClick={() => h.act(row)}>Open the {card.type === "task" ? "task" : "event"}<IcChev size={11} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ shape, i, row, h }: { shape: RecordShape; i: number; row: AnswerRow; h: RowHandlers }) {
  const card = shape.cards[i];
  const sel = i === h.selectedRow;
  const ref = useSelectedScroll<HTMLDivElement>(sel);
  return (
    <div ref={ref} className={`rec-card${sel ? " sel" : ""}`} style={iv(i)}>
      <PeekCardBody
        card={card}
        title={card.title}
        subtitle={card.subtitle}
        kind={row.kind}
        aside={row.value ? <span className="rec-val">{row.value}</span> : null}
      />
      {rowAction(row) && (
        <div className="rec-act">
          <button type="button" className="chip" onClick={() => h.act(row)}>Open the record<IcChev size={11} /></button>
        </div>
      )}
    </div>
  );
}

export function RecordSheet({ shape, rows, h }: { shape: RecordShape; rows: AnswerRow[]; h: RowHandlers }) {
  const only = shape.cards.length === 1 ? shape.cards[0] : null;
  if (only?.date && (only.type === "event" || only.type === "task") && rows[0]) {
    return <div className="shp-recs in in-3"><Ticket card={only as PeekCard & { date: string }} row={rows[0]} h={h} /></div>;
  }
  return (
    <div className={`shp-recs in in-3${shape.cards.length > 1 ? " two" : ""}`}>
      {shape.cards.map((_, i) => rows[i] && <Card key={i} shape={shape} i={i} row={rows[i]} h={h} />)}
    </div>
  );
}
