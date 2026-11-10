"use client";

// Roll call (_design/Ask Chapt List Forms Mock.html §07) — people as name chips
// under a count, with a split only when it matters (excused or not). Two names
// or forty draw the same way, so "who missed chapter?" looks the same every
// week. The group the question is about leads; the other is drawn softer, with
// no claim that one is good and the other bad.

import { type AnswerRow, type RollShape } from "../types";
import { initials, iv, RowButton, type RowHandlers } from "./common";

export function RollSheet({ shape, rows, h }: { shape: RollShape; rows: AnswerRow[]; h: RowHandlers }) {
  return (
    <div className="shp shp-roll in in-3">
      {shape.groups.map((g, gi) => {
        const idx = shape.items.map((it, i) => (it.group === gi ? i : -1)).filter(i => i >= 0);
        return (
          <div key={gi} className={`roll-g${g.flag ? " flag" : " soft"}`}>
            <div className="roll-n" style={iv(gi * 4)}>
              <b>{idx.length}</b>
              <span className="shp-kicker">{g.label}</span>
            </div>
            <div className="roll-c">
              {idx.map((i, k) => {
                const r = rows[i];
                const note = shape.items[i].note;
                return (
                  <RowButton key={i} row={r} i={i} h={h} className="who-chip" style={iv(gi * 4 + k)}>
                    <span className="av" aria-hidden>{initials(r?.title ?? "")}</span>
                    {r?.title}
                    {note && <em>{note}</em>}
                  </RowButton>
                );
              })}
            </div>
          </div>
        );
      })}
      {shape.truncated && <p className="shp-more">+ {shape.truncated.of - shape.items.length} more not shown</p>}
    </div>
  );
}
