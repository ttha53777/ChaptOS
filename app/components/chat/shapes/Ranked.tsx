"use client";

// Standings (_design/Ask Chapt List Forms Mock.html §01) — one number per row as
// bars on one scale, the org's own threshold drawn through all of them, and the
// rows that miss it under a cut line. Dated rows (meetings) keep date order with
// a date stub and no rank: the number is still what's drawn. With no threshold
// set there's no cut and no colour. A row with nothing recorded is said so, and
// never coloured.

import type { CSSProperties } from "react";

import { fmtUsd } from "@/lib/money";
import { rowAction, type AnswerRow, type MetricUnit, type RankedShape } from "../types";
import { Affordance, DateStub, initials, iv, RowButton, type RowHandlers } from "./common";

export function fmtMetric(n: number | null, unit: MetricUnit): string {
  if (n == null) return "not recorded";
  if (unit === "hrs") return `${n}`;
  if (unit === "usd") return fmtUsd(n);
  if (unit === "pct") return `${Math.round(n)}%`;
  return n.toFixed(2);
}

/** Does this reading miss the bar? Never for a row with no reading. */
export function misses(n: number | null, bar: number | null, better: "higher" | "lower"): boolean {
  if (n == null || bar == null) return false;
  return better === "higher" ? n < bar : n > bar;
}

export function RankedSheet({ shape, rows, h }: { shape: RankedShape; rows: AnswerRow[]; h: RowHandlers }) {
  const span = Math.max(shape.max - shape.min, 1e-9);
  const at = (n: number) => Math.min(1, Math.max(0, (n - shape.min) / span));
  const bar = shape.bar;
  const byDate = shape.order === "date";
  const failing = shape.items.filter(it => misses(it.num, bar?.at ?? null, shape.better)).length;
  const firstFail = byDate || !bar ? -1 : shape.items.findIndex(it => misses(it.num, bar.at, shape.better));
  const style = { ...(bar ? { ["--bar" as string]: at(bar.at).toFixed(4) } : {}) } as CSSProperties;

  return (
    <div className="shp shp-rk in in-3">
      <div className="shp-h">
        <span className="shp-kicker">{shape.kicker}</span>
        {bar && <div className="shp-legend"><span><i className="k-bar" />{bar.label}</span></div>}
      </div>
      <div className={`rk-rows${byDate ? " by-date" : ""}${bar ? " has-bar" : ""}${shape.min > 0 ? " broken" : ""}`} style={style}>
        {shape.items.map((it, i) => {
          const r = rows[i];
          const miss = misses(it.num, bar?.at ?? null, shape.better);
          const none = it.num == null;
          return (
            <div key={i} className="rk-slot">
              {i === firstFail && (
                <div className="rk-cut" style={iv(i)}>{shape.better === "higher" ? "Under the bar" : "Over the bar"} · {failing}</div>
              )}
              <RowButton
                row={r}
                i={i}
                h={h}
                className={`rk-r${miss ? " under" : ""}${none ? " none" : ""}${it.num === 0 && shape.better === "higher" ? " zero" : ""}`}
                style={iv(i)}
                label={`${r?.title ?? ""}, ${fmtMetric(it.num, shape.unit)}`}
              >
                {byDate && it.date
                  ? <DateStub date={it.date} tone={miss ? "late" : "week"} />
                  : <span className="n">{none ? "" : i + 1}</span>}
                {!byDate && (r?.kind === "person"
                  ? <span className="av" aria-hidden>{initials(r.title)}</span>
                  : <span className="av blank" aria-hidden />)}
                <span className="t">{r?.title}</span>
                <span className="rk-trk" style={{ ["--w" as string]: none ? 0 : at(it.num!).toFixed(4) } as CSSProperties}>
                  {!none && <span className="rk-fill" />}
                  <span className="rk-v">{fmtMetric(it.num, shape.unit)}{!none && shape.unit === "hrs" ? <small> hrs</small> : null}</span>
                </span>
                <Affordance action={r ? rowAction(r) : null} />
              </RowButton>
            </div>
          );
        })}
      </div>
      {shape.truncated && <p className="shp-more">+ {shape.truncated.of - shape.items.length} more not shown</p>}
    </div>
  );
}
