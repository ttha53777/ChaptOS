import React from "react";

/**
 * Tiny hand-rolled sparkline for the ledger strip — a single <polyline> scaled
 * to the viewBox. Replaces the Recharts <SparkLine> on the dashboard pane so the
 * warm strip carries no chart-lib weight. fill/stroke-width come from the
 * `.dash .measure svg polyline` rule; the inline attrs are fallbacks.
 */
export function LedgerSparkline({
  data,
  stroke,
  width = 88,
  height = 24,
}: {
  data: number[];
  stroke: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={points} style={{ stroke, fill: "none" }} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
