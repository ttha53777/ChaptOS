"use client";

// Logbook (_design/Ask Chapt List Forms Mock.html §03) — things that already
// happened: the count leads, then one shelf per month of small dated tickets.
// A month with nothing in it isn't drawn. The count is drawn only over the
// whole set; a cut set ("+ N more") shows its shelves without a headline.
// One ticket is still a logbook: the form follows the question, not the count.

import { useEffect, useState } from "react";

import type { AnswerRow, LogbookShape } from "../types";
import { dayNum, dowShort, iv, monthName, RowButton, yearOf, type RowHandlers } from "./common";

/** Past this many in one month, the shelf shows its first few and "+ N more". */
const MONTH_FULL = 12;
const MONTH_SHOWN = 8;

interface Shelf { key: string; year: number; month: string; idx: number[] }

function Month({ shelf, shape, rows, h, soFar, base }: {
  shelf: Shelf;
  shape: LogbookShape;
  rows: AnswerRow[];
  h: RowHandlers;
  soFar: boolean;
  base: number;
}) {
  const long = shelf.idx.length > MONTH_FULL;
  const hidden = long ? shelf.idx.slice(MONTH_SHOWN) : [];
  const [open, setOpen] = useState(false);
  const selHidden = hidden.includes(h.selectedRow);
  useEffect(() => { if (selHidden) setOpen(true); }, [selHidden]);
  const shown = long && !open ? shelf.idx.slice(0, MONTH_SHOWN) : shelf.idx;
  return (
    <div className="lg-m" style={iv(base)}>
      <div className="lg-ml">
        <span><span className="m">{shelf.month}</span>{soFar && <small>so far</small>}</span>
        <span className="c">{shelf.idx.length}</span>
      </div>
      <div className="lg-tk">
        {shown.map((i, k) => {
          const it = shape.items[i];
          const r = rows[i];
          return (
            <RowButton key={i} row={r} i={i} h={h} className="tk" style={iv(base + k + 1)} label={`${r?.title ?? ""}, ${monthName(it.date)} ${dayNum(it.date)}`}>
              <span className="dt"><u>{dowShort(it.date).toUpperCase()}</u><i>{dayNum(it.date)}</i></span>
              <span className="nm">
                <span className="t">{r?.title}</span>
                {r?.subtitle && <span className="s">{r.subtitle}</span>}
              </span>
            </RowButton>
          );
        })}
        {long && (
          <button type="button" className="lg-more" aria-expanded={open} onClick={() => setOpen(v => !v)}>
            {open ? "Show fewer" : `+ ${hidden.length} more`}
          </button>
        )}
      </div>
    </div>
  );
}

export function LogbookSheet({ shape, rows, h }: { shape: LogbookShape; rows: AnswerRow[]; h: RowHandlers }) {
  const shelves: Shelf[] = [];
  shape.items.forEach((it, i) => {
    const key = it.date.slice(0, 7);
    const last = shelves[shelves.length - 1];
    if (last?.key === key) last.idx.push(i);
    else shelves.push({ key, year: yearOf(it.date), month: monthName(it.date), idx: [i] });
  });
  const years = new Set(shelves.map(s => s.year)).size > 1;
  const n = shape.items.length;
  const noun = n === 1 ? shape.noun.one : shape.noun.many;
  let base = 1;

  return (
    <div className="shp shp-lg in in-3">
      {shape.truncated ? (
        <div className="shp-h"><span className="shp-kicker">Latest {n} of {shape.truncated.of} {shape.noun.many} · {shape.period}</span></div>
      ) : (
        <div className="lg-head">
          <b>{n}</b>
          <span className="shp-kicker">{noun} · {shape.period}</span>
        </div>
      )}
      {shelves.map((s, si) => {
        const yearHead = years && (si === 0 || shelves[si - 1].year !== s.year);
        const at = base;
        base += s.idx.length + 1;
        return (
          <div key={s.key} className="lg-shelf">
            {yearHead && <div className="lg-y shp-kicker">{s.year}</div>}
            <Month shelf={s} shape={shape} rows={rows} h={h} soFar={s.key === shape.today.slice(0, 7)} base={at} />
          </div>
        );
      })}
    </div>
  );
}
