"use client";

// Yes or no (_design/Ask Chapt List Forms Mock.html §13) — the word is stamped,
// computed from the records (the model can't choose it). Everyone the question
// covered is one small face, exceptions ringed; the exceptions are the only
// rows, the rest fold into one line, and a clean yes has no rows at all. One
// thing ("is the deposit paid?") is the stamp plus that record as its evidence.

import { IcTick } from "../icons";
import type { AnswerRow, YesNoShape } from "../types";
import { FoldLine, initials, useFold, type RenderRow, type RowHandlers } from "./common";

const FACES = 24;

export function YesNoSheet({ shape, rows, h, renderRow }: { shape: YesNoShape; rows: AnswerRow[]; h: RowHandlers; renderRow: RenderRow }) {
  const fail = shape.items.map((it, i) => (it.pass ? -1 : i)).filter(i => i >= 0);
  const pass = shape.items.map((it, i) => (it.pass ? i : -1)).filter(i => i >= 0);
  const one = shape.items.length === 1;
  const [open, toggle] = useFold(h.selectedRow, pass);
  const people = rows.every(r => r.kind === "person");
  const faces = shape.items.slice(0, FACES);
  const firstNames = pass.map(i => rows[i]?.title.split(/\s+/)[0]).filter(Boolean);

  return (
    <div className={`shp shp-yn ${shape.holds ? "yes" : "no"} in in-3`}>
      <div className="yn-top">
        <span className="yn-st" aria-label={shape.holds ? "Yes" : "No"}>{shape.holds ? "Yes" : "No"}</span>
        <span className="yn-h">
          <span className="t">{shape.headline}</span>
          <span className="s">{shape.kicker}</span>
          {!one && people && (
            <span className="yn-pips" aria-hidden>
              {faces.map((it, i) => (
                <span key={i} className={`av${it.pass ? "" : " fail"}`} title={rows[i]?.title}>{initials(rows[i]?.title ?? "")}</span>
              ))}
              {shape.items.length > FACES && <span className="more">+ {shape.items.length - FACES}</span>}
            </span>
          )}
        </span>
      </div>
      {one && <div className="yn-x"><div className="reslist">{rows.slice(0, 1).map(renderRow)}</div></div>}
      {!one && fail.length > 0 && (
        <>
          <div className="yn-x">
            <span className="shp-kicker">{people
              ? fail.length === 1 ? "The one who hasn't" : `The ${fail.length} who haven't`
              : fail.length === 1 ? "The exception" : `The ${fail.length} exceptions`}</span>
            <div className="reslist">{fail.map(i => renderRow(rows[i], i))}</div>
          </div>
          {pass.length > 0 && (
            <>
              <FoldLine open={open} onToggle={toggle} mark={<IcTick size={11} />}>
                <b>{people ? `${pass.length} who ${pass.length === 1 ? "has" : "have"}` : `${pass.length} more that ${pass.length === 1 ? "does" : "do"}`}</b>{firstNames.length > 0 && <> · {firstNames.slice(0, 6).join(", ")}{firstNames.length > 6 ? ", …" : ""}</>}
              </FoldLine>
              {open && <div className="yn-rest reslist">{pass.map(i => renderRow(rows[i], i))}</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}
