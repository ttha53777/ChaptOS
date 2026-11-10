"use client";

import { useState, type CSSProperties } from "react";

import { initials, type RenderRow, type RowHandlers } from "./common";
import type { AnswerRow, TallyMark, TallyShape } from "../types";

const personRow = (m: TallyMark): AnswerRow =>
  ({ kind: "person", title: m.name, ...(m.value ? { value: m.value } : {}), ref: { type: "member", id: m.id } });

// ─── Tally ──────────────────────────────────────────────────────────────────

export function TallySheet({ shape, rows, h, renderRow }: {
  shape: TallyShape;
  rows: AnswerRow[];
  h: RowHandlers;
  renderRow: RenderRow;
}) {
  const [tip, setTip] = useState<{ m: TallyMark; x: number; y: number } | null>(null);
  const [more, setMore] = useState(false);
  const marks = shape.marks;
  // Everyone the list above doesn't already show, still in rank order.
  const listed = new Set(rows.map(r => r.ref?.id));
  const extra = (marks ?? []).filter(m => m.state !== "rest" && !listed.has(m.id));
  const cols = Math.max(1, Math.min(26, shape.of));
  const colsSm = Math.max(1, Math.min(13, shape.of));

  const showTip = (m: TallyMark, el: HTMLElement) => {
    const dots = el.parentElement!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setTip({ m, x: r.left - dots.left + r.width / 2, y: r.top - dots.top });
  };

  return (
    <div className="shp shp-tally in in-3">
      <div className="shp-h">
        <div className="tl-n">{shape.hit}<span> / {shape.of} {shape.hitWord}</span></div>
        <div className="shp-legend">
          {shape.topLabel && <span><i className="k-top" />{shape.topLabel}</span>}
          <span><i className="k-hit" />{shape.hitLegend}</span>
          <span><i className="k-rest" />{shape.restLegend}</span>
        </div>
      </div>

      {marks ? (
        <div
          className="tl-dots"
          style={{ ["--cols" as string]: cols, ["--cols-sm" as string]: colsSm } as CSSProperties}
          onMouseLeave={() => setTip(null)}
        >
          {marks.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`tl-dot ${m.state}`}
              style={{ ["--i" as string]: i } as CSSProperties}
              aria-label={`${m.name}${m.value ? `, ${m.value}` : m.state === "rest" ? `, ${shape.restLegend.toLowerCase()}` : ""}`}
              onMouseEnter={e => showTip(m, e.currentTarget)}
              onFocus={e => showTip(m, e.currentTarget)}
              onBlur={() => setTip(null)}
              onClick={() => h.onPeek(personRow(m))}
            />
          ))}
          {tip && (
            <span className="tl-tip" style={{ left: tip.x, top: tip.y }} aria-hidden>
              {tip.m.name}<b>{tip.m.value ?? (tip.m.state === "rest" ? shape.restLegend.toLowerCase() : shape.hitLegend.toLowerCase())}</b>
            </span>
          )}
        </div>
      ) : (
        // Too many people to count as dots — the proportion is the point.
        <div className="tl-bar" role="img" aria-label={`${shape.hit} of ${shape.of} ${shape.hitWord}`}>
          <b style={{ width: `${shape.of ? (shape.hit / shape.of) * 100 : 0}%` }} />
        </div>
      )}

      {rows.length > 0 && <div className="reslist">{rows.map(renderRow)}</div>}

      {extra.length > 0 && (
        <>
          {more && (
            <div className="tl-more">
              {extra.map(m => (
                <button key={m.id} type="button" className="tl-chip" onClick={() => h.onPeek(personRow(m))}>
                  <span className="av">{initials(m.name)}</span>{m.name}{m.value && <b>{m.value}</b>}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="tl-more-btn" aria-expanded={more} onClick={() => setMore(v => !v)}>
            {more ? "Show fewer" : `+ ${extra.length} more ${extra.length === 1 && shape.metric === "owes_dues" ? "who owes" : shape.metric === "owes_dues" ? "who owe" : shape.hitWord}`}
          </button>
        </>
      )}
    </div>
  );
}
