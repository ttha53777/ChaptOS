"use client";

// Past due (_design/Ask Chapt List Forms Mock.html §10) — open work that's late,
// measured back from one shared edge: today. Bar length is today minus the due
// date and nothing else. The scale is whole weeks, rounded up from the oldest
// row and capped at eight, so one ancient task doesn't flatten the rest into
// slivers; a capped bar gets a broken end and its label keeps the real number.
// When every row was due the same day the bars would say nothing, so they go.

import type { CSSProperties } from "react";

import { rowAction, type AnswerRow, type PastDueOwner, type PastDueShape } from "../types";
import { Affordance, daysBetween, initials, iv, RowButton, type RowHandlers } from "./common";

const MAX_WEEKS = 8;

function Who({ owner }: { owner: PastDueOwner }) {
  if (owner.kind === "none") return <span className="av none" aria-label="No owner">?</span>;
  if (owner.kind === "everyone") return <span className="av all" aria-label="Everyone">All</span>;
  return <span className={`av${owner.kind === "role" ? " role" : ""}`} aria-hidden>{initials(owner.label.replace(/ \+\d+$/, ""))}</span>;
}

export function PastDueSheet({ shape, rows, h }: { shape: PastDueShape; rows: AnswerRow[]; h: RowHandlers }) {
  const late = shape.items.map(it => Math.max(1, daysBetween(it.date, shape.today)));
  const oldest = Math.max(...late, 1);
  const weeks = Math.min(MAX_WEEKS, Math.max(1, Math.ceil(oldest / 7)));
  const span = weeks * 7;
  const track = new Set(shape.items.map(it => it.date)).size > 1;
  const longLate = late.filter(d => d > 14).length;

  return (
    <div className="shp shp-pd in in-3">
      <div className="shp-h">
        <span className="shp-kicker">Open and past due · {shape.truncated?.of ?? shape.items.length}</span>
        {track && (
          <div className="shp-legend">
            <span><i className="k-late" />Late</span>
            {longLate > 0 && <span><i className="k-old" />Over two weeks</span>}
          </div>
        )}
      </div>
      <div className="pd-rows">
        {track && (
          <div className="pd-ax" aria-hidden>
            <span />
            <span />
            <span className="pd-trk">
              <span className="pd-in">
                {/* Past four weeks every label won't fit: mark every other one, and never crowd Today. */}
                {Array.from({ length: weeks }, (_, k) => weeks - k).filter(w => weeks <= 4 || (w % 2 === 0)).map(w => (
                  <span key={w} style={{ ["--x" as string]: `${((w / weeks) * 100).toFixed(2)}%` } as CSSProperties}>{w} wk{w > 1 ? "s" : ""}</span>
                ))}
                <span className="now" style={{ ["--x" as string]: "0%" } as CSSProperties}>Today</span>
              </span>
            </span>
          </div>
        )}
        {shape.items.map((it, i) => {
          const r = rows[i];
          const d = late[i];
          const capped = d > span;
          return (
            <RowButton
              key={i}
              row={r}
              i={i}
              h={h}
              className={`pd-r${d > 14 ? " old" : ""}${capped ? " cap" : ""}${track ? "" : " flat"}`}
              style={iv(i)}
              label={`${r?.title ?? ""}, ${d} days late, ${it.owner.label}`}
            >
              <Who owner={it.owner} />
              <span className="rb">
                <span className="t">{r?.title}</span>
                {r?.subtitle && <span className="s">{r.subtitle}</span>}
              </span>
              {track ? (
                <span className="pd-trk">
                  <span className="pd-in" style={{ ["--w" as string]: Math.min(1, d / span).toFixed(4), ["--wk" as string]: weeks } as CSSProperties}>
                    <span className="pd-v">{d} day{d === 1 ? "" : "s"}</span>
                    <span className="pd-bar" />
                  </span>
                </span>
              ) : (
                <span className="pd-flat">{d} day{d === 1 ? "" : "s"} late</span>
              )}
              <Affordance action={r ? rowAction(r) : null} />
            </RowButton>
          );
        })}
      </div>
      {shape.truncated && <p className="shp-more">+ {shape.truncated.of - shape.items.length} more not shown</p>}
    </div>
  );
}
