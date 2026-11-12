"use client";

// Figure (_design/Ask Chapt Answer System Mock.html#figure) — one quantity,
// drawn big: the number, its change since a date, a sparkline only when the
// history is real, and how it's counted. The server guarantees the terms add up
// to the figure (lib/ai-shapes-figure.ts); this file only draws.

import type { CSSProperties } from "react";

import { fmtUsd } from "@/lib/money";
import type { FigureShape } from "../types";
import { fmtDay, iv } from "./common";

function Big({ value, unit }: { value: number; unit: FigureShape["unit"] }) {
  if (unit === "count") return <span className="fg-n">{value.toLocaleString("en-US")}</span>;
  const whole = Math.trunc(Math.abs(value));
  const cents = Math.round((Math.abs(value) - whole) * 100);
  return (
    <span className="fg-n">
      {value < 0 ? "−" : ""}${whole.toLocaleString("en-US")}
      {cents > 0 && <small>.{String(cents).padStart(2, "0")}</small>}
    </span>
  );
}

/** The running value as a line over its own range; the last point is the figure. */
function Spark({ series }: { series: NonNullable<FigureShape["series"]> }) {
  const W = 600, H = 62, PAD = 6;
  const vals = series.map(p => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = series.map((p, i) => [
    (i / Math.max(1, series.length - 1)) * W,
    PAD + (1 - (p.value - lo) / span) * (H - PAD * 2),
  ] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <div className="fg-spark">
      <div className="fg-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <path className="area" d={`${line} L${W} ${H} L0 ${H} Z`} />
          <path className="line" d={line} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="fg-dot" style={{ left: `${(lx / W) * 100}%`, top: `${(ly / H) * 100}%` } as CSSProperties} />
      </div>
      <span className="fg-ax">{fmtDay(series[0].date)} → today</span>
    </div>
  );
}

export function FigureSheet({ shape }: { shape: FigureShape }) {
  const money = shape.unit === "usd";
  return (
    <div className="shp fg in in-3">
      <div className="shp-h"><span className="shp-kicker">{shape.kicker}</span></div>
      <div className="fg-top">
        <Big value={shape.value} unit={shape.unit} />
        {shape.delta && (
          <span className={`fg-delta${shape.delta.by < 0 ? " down" : ""}`}>
            {shape.delta.by < 0 ? "▼" : "▲"} {money ? fmtUsd(Math.abs(shape.delta.by)) : Math.abs(shape.delta.by)} since {fmtDay(shape.delta.since)}
          </span>
        )}
      </div>
      {shape.series && <Spark series={shape.series} />}
      {shape.split && (
        <div className="fg-split" style={{ gridTemplateColumns: `repeat(${shape.split.length}, minmax(0, 1fr))` }}>
          {shape.split.map((p, i) => (
            <div key={p.label} style={iv(i)}><b>{p.count.toLocaleString("en-US")}</b><span>{p.label}</span></div>
          ))}
        </div>
      )}
      {shape.terms && (
        <div className="fg-eq">
          <span className="shp-kicker">How it&apos;s counted</span>
          <div className="fg-terms">
            {shape.terms.map((t, i) => (
              <span key={t.label} className="fg-tw">
                {i > 0 && <span className="fg-op">{t.op === "-" ? "−" : "+"}</span>}
                {i === 0 && t.op === "-" && <span className="fg-op">−</span>}
                <span className="fg-term"><b>{fmtUsd(t.amount)}</b><span>{t.label}</span></span>
              </span>
            ))}
            <span className="fg-tw">
              <span className="fg-op">=</span>
              <span className="fg-term tot"><b>{fmtUsd(shape.value)}</b><span>{shape.metric === "balance" ? "Balance" : "Total"}</span></span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
