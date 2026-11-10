"use client";

// The record (_design/Ask Chapt List Forms Mock.html §05) — a lookup for one
// thing answered with the thing: the peek card itself, inline, built by the
// same service as the peek sheet (so it shows exactly what tapping the row
// would). The row's own value rides on the card's head, so the fact that was
// asked for ("lowest GPA") is on the card, not only in the sentence.

import { IcChev } from "../icons";
import { PeekCardBody } from "../PeekCardBody";
import { rowAction, type AnswerRow, type RecordShape } from "../types";
import { iv, useSelectedScroll, type RowHandlers } from "./common";

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
  return (
    <div className={`shp-recs in in-3${shape.cards.length > 1 ? " two" : ""}`}>
      {shape.cards.map((_, i) => rows[i] && <Card key={i} shape={shape} i={i} row={rows[i]} h={h} />)}
    </div>
  );
}
