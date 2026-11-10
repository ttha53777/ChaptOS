"use client";

// Nothing yet (_design/Ask Chapt List Forms Mock.html §12) — a zero that leaves
// no doubt: one empty slot (a blank calendar page, exactly what there are none
// of), the filter in the org's own word, how much was searched, and what those
// records are filed as instead — one tap re-asks about any of them. "Plan one"
// shows only when the asker may propose an event.

import { IcPlus, IcTick } from "../icons";
import type { ZeroShape } from "../types";
import type { RowHandlers } from "./common";

export function ZeroSheet({ shape, h }: { shape: ZeroShape; h: RowHandlers }) {
  // "yet" / "in Fall 2026" / "since Aug 24" / "Aug 24 – Nov 10".
  const when = shape.period === "All time" ? "yet"
    : /^(since|through) /.test(shape.period) || shape.period.includes("–") ? shape.period : `in ${shape.period}`;
  return (
    <div className="shp shp-zero in in-3">
      <div className="zr">
        <span className="zr-0" aria-hidden />
        <span className="zr-b">
          <span className="t">No {shape.noun} filed as {shape.filter} {when}</span>
          <span className="s"><IcTick size={11} />Checked all {shape.searched.count} {shape.noun} {shape.searched.scope}</span>
        </span>
        {shape.canCreate && h.onIdea && (
          <button
            type="button"
            className="chip zr-plan"
            onClick={() => h.onIdea!({ kind: "event", title: `A ${shape.filter.toLowerCase()} event`, subtitle: `Nothing filed as ${shape.filter} ${when}`, tier: "later", screen: { label: "Events", path: "/events" } })}
          >
            <IcPlus size={11} />Plan one
          </button>
        )}
      </div>
      {shape.instead.length > 0 && h.onAsk && (
        <div className="zr-near">
          <span className="shp-kicker">The {shape.searched.count} are filed as</span>
          {shape.instead.map(c => (
            <button key={c.slug} type="button" onClick={() => h.onAsk!(`How many ${c.label} events have we had${shape.period === "All time" ? "" : ` in ${shape.period}`}?`)}>
              {c.label}<i>{c.count}</i>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
