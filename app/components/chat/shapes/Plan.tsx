"use client";

// Game plan (_design/Ask Chapt List Forms Mock.html §11) — advisory rows sized by
// how much they matter: "do first" rows are cards with room for the why, "then"
// rows are plain rows, "later" rows are a quiet line each. Client-only: the wire
// is the same tiered rows every advisory answer already sends, so this is the
// same answer drawn differently, and an older client still draws the list.
//
// Steps and option menus are not priorities. With a single tier present this
// isn't used and the list stays (isPlanRows).

import type { ReactNode } from "react";

import { IcArrow, IcChev, IcPlus, IcSpark } from "../icons";
import { rowAction, type AnswerRow, type AnswerTier } from "../types";
import { iv, useSelectedScroll, type RowHandlers } from "./common";

const TIERS: AnswerTier[] = ["high", "medium", "later"];
const LABEL: Record<AnswerTier, string> = { high: "Do first", medium: "Then", later: "When there's time" };

/** Every row has a tier, and at least two different tiers are present. */
export function isPlanRows(rows: AnswerRow[]): boolean {
  return rows.length > 1 && rows.every(r => r.tier) && new Set(rows.map(r => r.tier)).size >= 2;
}

/** The row's own action, as a pill: where it takes you, or that it drafts an event. */
function Go({ row }: { row: AnswerRow }): ReactNode {
  const action = rowAction(row);
  if (action === "idea") return <span className="go plus"><IcPlus size={11} />Draft the event</span>;
  if (action === "nav") return <span className="go">{row.screen!.label}<IcArrow size={11} /></span>;
  if (action === "peek") return <span className="go">Open<IcChev size={11} /></span>;
  if (action === "ask") return <span className="go ask"><IcSpark size={11} />Ask</span>;
  return null;
}

function Item({ row, i, n, tier, h }: { row: AnswerRow; i: number; n: number; tier: AnswerTier; h: RowHandlers }) {
  const action = rowAction(row);
  const sel = i === h.selectedRow;
  const ref = useSelectedScroll<HTMLButtonElement>(sel);
  const cls = tier === "high" ? "gp-c" : "gp-r";
  return (
    <button
      ref={ref}
      type="button"
      className={`${cls}${sel ? " sel" : ""}${action ? "" : " inert"}`}
      style={iv(n)}
      disabled={!action}
      onClick={() => h.act(row)}
    >
      <span className="gp-no">{n}</span>
      {tier === "high" ? (
        <>
          <span className="t">{row.title}</span>
          {row.subtitle && <span className="s">{row.subtitle}</span>}
        </>
      ) : (
        <span className="gp-tx">
          <span className="t">{row.title}</span>
          {row.subtitle && tier === "medium" && <span className="s">{row.subtitle}</span>}
        </span>
      )}
      <Go row={row} />
    </button>
  );
}

export function PlanBlock({ rows, h }: { rows: AnswerRow[]; h: RowHandlers }) {
  // Numbered in answer order, which is best-first (parseComposeAnswer holds the
  // tiers to that order), so the numbers read straight down the bands.
  const indexed = rows.map((row, i) => ({ row, i }));
  return (
    <div className="gp in in-3">
      {TIERS.map(tier => {
        const items = indexed.filter(x => x.row.tier === tier);
        if (items.length === 0) return null;
        return (
          <div key={tier} className={`gp-band ${tier}`}>
            <div className="gp-l shp-kicker">{LABEL[tier]}</div>
            <div className={tier === "high" ? "gp-1" : tier === "medium" ? "gp-2" : "gp-3"}>
              {items.map(({ row, i }) => <Item key={`${row.title}-${i}`} row={row} i={i} n={i + 1} tier={tier} h={h} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
