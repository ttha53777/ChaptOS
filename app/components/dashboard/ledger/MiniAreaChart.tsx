import React, { useId } from "react";

/**
 * Treasury rail area chart, ported from the mock SVG. Plots the trend balances
 * as a filled area + line, then a dashed projection segment to `projected`.
 * Hand-rolled (no Recharts) to match the editorial look and keep the rail light.
 */
export function MiniAreaChart({
  trend,
  projected,
  stroke = "var(--vio)",
  height = 84,
}: {
  trend: { month: string; balance: number }[];
  projected: number;
  stroke?: string;
  height?: number;
}) {
  const gradId = useId();
  const width = 300;
  const baseline = 80;
  const yTop = 6;
  const yBot = 66;
  const n = trend.length;
  if (n === 0) return null;

  const step = width / n; // last actual point lands at (n-1)*step; projection at n*step = width
  const vals = trend.map(t => t.balance);
  const all = [...vals, projected];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const mapY = (v: number) => yTop + (1 - (v - min) / span) * (yBot - yTop);

  const pts = vals.map((v, i) => [i * step, mapY(v)] as const);
  const last = pts[pts.length - 1];
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${last[0].toFixed(1)},${baseline} L0,${baseline} Z`;
  const projX = n * step;
  const projY = mapY(projected);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: stroke, stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: stroke, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" style={{ stroke }} strokeWidth={1.8} strokeLinecap="round" />
      <path
        d={`M${last[0].toFixed(1)},${last[1].toFixed(1)} L${projX.toFixed(1)},${projY.toFixed(1)}`}
        fill="none"
        style={{ stroke }}
        strokeWidth={1.4}
        strokeDasharray="3 4"
        opacity={0.7}
      />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={3} style={{ fill: stroke }} />
    </svg>
  );
}
