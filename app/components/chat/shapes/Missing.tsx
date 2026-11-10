"use client";

import type { CSSProperties } from "react";

import { KindGlyph } from "../icons";
import type { RenderRow } from "./common";
import type { AnswerRow, MissingShape } from "../types";

// ─── Not found ──────────────────────────────────────────────────────────────

/** The glyph each searched place gets — the screen it lives on. */
const LOOK_GLYPH: Record<MissingShape["looked"][number]["source"], string> = {
  events: "timeline", service: "service", programming: "programming", deadlines: "tasks", docs: "docs",
};

export function MissingSheet({ shape, rows, renderRow }: {
  shape: MissingShape;
  rows: AnswerRow[];
  renderRow: RenderRow;
}) {
  return (
    <>
      <div className="shp shp-miss in in-3">
        <div className="shp-h"><span className="shp-kicker">Where I looked</span></div>
        <span className="nomatch" aria-hidden>No match</span>
        <div className="looked">
          {shape.looked.map((l, i) => (
            <div key={l.source} className="lk" style={{ ["--i" as string]: i } as CSSProperties}>
              <span className="g"><KindGlyph kind={LOOK_GLYPH[l.source]} size={12} /></span>
              <span className="w">{l.label}<small>{l.scope}</small></span>
              <span className="z">0 of {l.of}</span>
            </div>
          ))}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="closest in in-3">
          <span className="shp-kicker">Closest I found</span>
          <div className="reslist">{rows.map(renderRow)}</div>
        </div>
      )}
    </>
  );
}
