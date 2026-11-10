"use client";

// Side by side (_design/Ask Chapt List Forms Mock.html §06) — the same few
// measures per row as columns, so the eye runs down each one. Only a cell under
// the org's own threshold is tinted; a blank is a dash and never tinted. Rows
// keep the order they came in; tapping a heading sorts, locally. On a phone the
// name column pins and the measures scroll.

import { useState } from "react";

import { rowAction, type AnswerRow, type TableShape } from "../types";
import { Affordance, initials, useSelectedScroll, type RowHandlers } from "./common";
import { fmtMetric, misses } from "./Ranked";

function Row({ row, i, shape, h }: { row: AnswerRow | undefined; i: number; shape: TableShape; h: RowHandlers }) {
  const action = row ? rowAction(row) : null;
  const sel = i === h.selectedRow;
  const ref = useSelectedScroll<HTMLTableRowElement>(sel);
  return (
    <tr
      ref={ref}
      className={`${sel ? "sel" : ""}${action ? "" : " inert"}`}
      tabIndex={action ? 0 : -1}
      onClick={() => row && action && h.act(row)}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && row && action) { e.preventDefault(); h.act(row); } }}
    >
      <td>
        <span className="tb-who">
          {row?.kind === "person" && <span className="av" aria-hidden>{initials(row.title)}</span>}
          <span className="rb"><span className="t">{row?.title}</span>{row?.subtitle && <span className="s">{row.subtitle}</span>}</span>
        </span>
      </td>
      {shape.cols.map(c => {
        const v = shape.cells[i]?.[c.key] ?? null;
        return (
          <td key={c.key}>
            {v == null
              ? <span className="nil" title="Not recorded">—</span>
              : <span className={misses(v, c.bar, c.better) ? "bad" : "ok"}>{fmtMetric(v, c.unit)}{c.unit === "hrs" ? " h" : ""}</span>}
          </td>
        );
      })}
      <td className="go-c"><Affordance action={action} /></td>
    </tr>
  );
}

export function TableSheet({ shape, rows, h }: { shape: TableShape; rows: AnswerRow[]; h: RowHandlers }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const order = shape.cells.map((_, i) => i);
  if (sort) {
    order.sort((a, b) => {
      const x = shape.cells[a][sort.key], y = shape.cells[b][sort.key];
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      return (x - y) * sort.dir;
    });
  }
  const tap = (key: string, better: "higher" | "lower") => setSort(s =>
    s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 }
    // First tap puts the worst first: lowest for higher-is-better, highest for lower.
    : { key, dir: better === "higher" ? 1 : -1 });

  return (
    <div className="shp shp-tb in in-3">
      <div className="tb-scroll">
        <table>
          <thead>
            <tr>
              <th><span className="shp-kicker">{shape.kicker}</span></th>
              {shape.cols.map(c => (
                <th key={c.key}>
                  <button
                    type="button"
                    onClick={() => tap(c.key, c.better)}
                    aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    <span className="shp-kicker">{c.label}</span>
                    {c.bar != null && <small>bar {fmtMetric(c.bar, c.unit)}</small>}
                  </button>
                </th>
              ))}
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {order.map(i => <Row key={i} row={rows[i]} i={i} shape={shape} h={h} />)}
          </tbody>
        </table>
      </div>
      {shape.truncated && <p className="shp-more">+ {shape.truncated.of - shape.cells.length} more not shown</p>}
    </div>
  );
}
