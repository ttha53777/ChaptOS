"use client";

// Progress (_design/Ask Chapt List Forms Mock.html §04) — one block per row so
// the strip IS the count, not a percentage to trust. Stuck rows (late, or owned
// by nobody) come first; finished work folds to one line — unless the finished
// rows are the answer, when the open ones fold instead. Past two dozen rows the
// blocks become a three-part bar with counts.

import type { CSSProperties } from "react";

import { IcTick } from "../icons";
import { rowAction, type AnswerRow, type StatusShape } from "../types";
import { Affordance, dueLabel, FoldLine, fmtDay, iv, RowButton, useFold, type RowHandlers } from "./common";

type State = StatusShape["items"][number]["state"];
const LABEL: Record<State, string> = { stuck: "Stuck", open: "In motion", done: "Done" };
const BLOCKS = 24;

function Mark({ state }: { state: State }) {
  return <span className="sx-m">{state === "done" ? <IcTick size={10} /> : state === "stuck" ? "!" : ""}</span>;
}

export function StatusSheet({ shape, rows, h }: { shape: StatusShape; rows: AnswerRow[]; h: RowHandlers }) {
  const by: Record<State, number[]> = { stuck: [], open: [], done: [] };
  shape.items.forEach((it, i) => by[it.state].push(i));
  const folded = shape.focus === "done" ? [...by.stuck, ...by.open] : by.done;
  const shown: State[] = shape.focus === "done" ? ["done"] : ["stuck", "open"];
  const [open, toggle] = useFold(h.selectedRow, folded);
  const n = shape.items.length;

  const dLabel = (i: number) => {
    const it = shape.items[i];
    if (it.state === "done") return it.date ? fmtDay(it.date) : "done";
    if (it.why === "unowned" && !(it.date && it.date < shape.today)) return "no owner";
    return it.date ? (it.date < shape.today ? dueLabel(shape.today, it.date, true) : `due ${dueLabel(shape.today, it.date, false)}`) : "no date";
  };

  const row = (i: number, k: number) => {
    const it = shape.items[i];
    const r = rows[i];
    return (
      <RowButton key={i} row={r} i={i} h={h} className={`sx-r ${it.state}`} style={iv(k % 6)}>
        <Mark state={it.state} />
        <span className="rb">
          <span className="t">{r?.title}</span>
          {it.state !== "done" && r?.subtitle && <span className="s">{r.subtitle}</span>}
        </span>
        <span className="d">{dLabel(i)}</span>
        <Affordance action={r ? rowAction(r) : null} />
      </RowButton>
    );
  };

  const foldText = (() => {
    const names = folded.map(i => rows[i]?.title).filter(Boolean);
    const head = shape.focus === "done" ? `${folded.length} still open` : `${folded.length} done`;
    return <><b>{head}</b>{names.length > 0 && <> · {names.slice(0, 3).join(", ")}{names.length > 3 ? `, +${names.length - 3}` : ""}</>}</>;
  })();

  return (
    <div className="shp shp-sx in in-3">
      <div className="shp-h"><span className="shp-kicker">{shape.kicker}</span></div>
      {n <= BLOCKS ? (
        <div className="sx-strip">
          {shape.items.map((it, i) => (
            <RowButton key={i} row={rows[i]} i={i} h={h} className={`sx-b ${it.state}`} style={iv(i)} label={`${rows[i]?.title ?? ""}, ${LABEL[it.state]}`}>
              {it.state === "done" ? <IcTick size={11} /> : it.state === "stuck" ? "!" : null}
            </RowButton>
          ))}
        </div>
      ) : (
        <div className="sx-bar" role="img" aria-label={`${by.done.length} done, ${by.open.length} in motion, ${by.stuck.length} stuck`}>
          {(["done", "open", "stuck"] as State[]).map(s => by[s].length > 0 && <b key={s} className={s} style={{ flex: by[s].length } as CSSProperties} />)}
        </div>
      )}
      <div className="sx-key">
        {(["done", "open", "stuck"] as State[]).map(s => (
          <span key={s} style={{ flex: Math.max(by[s].length, 1) } as CSSProperties}><b>{by[s].length}</b>{LABEL[s].toLowerCase()}</span>
        ))}
      </div>
      {shown.map(s => by[s].length > 0 && (
        <div key={s} className={`sx-grp ${s}`}>
          <span className="sx-gl shp-kicker">{LABEL[s]} · {by[s].length}</span>
          {by[s].map((i, k) => row(i, k))}
        </div>
      ))}
      {folded.length > 0 && (
        <div className="sx-grp folded">
          <FoldLine open={open} onToggle={toggle} mark={shape.focus === "done" ? "·" : <IcTick size={10} />}>{foldText}</FoldLine>
          {open && folded.map((i, k) => row(i, k))}
        </div>
      )}
    </div>
  );
}
