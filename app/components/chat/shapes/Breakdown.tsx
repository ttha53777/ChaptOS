"use client";

import type { CSSProperties } from "react";

import { fmtUsd } from "@/lib/money";
import { IcArrow, IcChev } from "../icons";
import { catVars, type RowHandlers } from "./common";
import { rowAction, type AnswerRow, type BreakdownShape } from "../types";

// ─── Breakdown ──────────────────────────────────────────────────────────────

export function BreakdownSheet({ shape, rows, h }: { shape: BreakdownShape; rows: AnswerRow[]; h: RowHandlers }) {
  // Bars share one scale — the biggest of any spend or budget — so a budget
  // tick past its bar is visibly room left, and an overhang is visibly over.
  const max = Math.max(...shape.parts.map(p => Math.max(p.amount, p.budget ?? 0)), 1);
  const pct = (n: number) => `${((n / max) * 100).toFixed(2)}%`;
  return (
    <div className="shp shp-brk in in-3">
      <div className="shp-h">
        <span className="shp-kicker">{shape.period}</span>
        {shape.hasBudget && (
          <div className="shp-legend">
            <span><i className="k-bud" />Budget</span>
            <span><i className="k-over" />Over</span>
          </div>
        )}
      </div>
      <div className="bk-rib" aria-hidden>
        {shape.parts.map((p, i) => (
          <b key={p.slug ?? `other-${i}`} style={{ ...catVars(p.slug, p.color, p.colorDark), ["--w" as string]: `${p.share}%`, ["--i" as string]: i } as CSSProperties} />
        ))}
      </div>
      <div className="bk-rows">
        {shape.parts.map((p, i) => {
          const row = rows[i];
          const over = p.budget != null && p.amount > p.budget;
          const action = row ? rowAction(row) : null;
          return (
            <button
              key={p.slug ?? `other-${i}`}
              type="button"
              className={`bk-r${i === 0 ? " lead" : ""}${i === h.selectedRow ? " sel" : ""}`}
              style={{ ...catVars(p.slug, p.color, p.colorDark), ["--i" as string]: i } as CSSProperties}
              disabled={!action}
              onClick={() => row && h.act(row)}
            >
              <span className="nm"><i /><span>{p.label}</span></span>
              <span className="trk" style={{ ["--w" as string]: pct(p.amount), ...(p.budget != null ? { ["--b" as string]: pct(p.budget) } : {}) } as CSSProperties}>
                <span className="fill" />
                {over && <span className="over" />}
                {p.budget != null && <span className="bud" title={`Budget ${fmtUsd(p.budget)}`} />}
              </span>
              <span className="amt">
                {fmtUsd(p.amount)}
                {p.budget != null
                  ? over ? <small className="ov">{fmtUsd(p.amount - p.budget)} over</small> : <small>of {fmtUsd(p.budget)}</small>
                  : shape.hasBudget ? <small>no budget</small> : null}
              </span>
              <span className="pct">{p.share}%</span>
              <span className="chev">{action === "nav" ? <IcArrow /> : action ? <IcChev /> : null}</span>
            </button>
          );
        })}
      </div>
      <div className="bk-foot">
        <span>{shape.kind === "income" ? "Total earned" : "Total spent"}</span>
        <b>{fmtUsd(shape.total)}</b>
      </div>
    </div>
  );
}
