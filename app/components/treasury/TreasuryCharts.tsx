"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmt$ } from "../../data";
import { catColor } from "./chart-colors";

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function PieTooltip({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number; payload?: { fill?: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const color = item.payload?.fill ?? "var(--muted)";
  return (
    <div style={{
      background: "rgba(10,12,20,0.94)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
      boxShadow: "0 12px 28px -8px rgba(var(--shade-rgb),calc(0.8*var(--shade-k)))", padding: "8px 12px", minWidth: 130,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: "var(--muted)", flex: 1 }}>{item.name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-geist-mono, monospace)" }}>
          {fmt$(Math.round(Number(item.value ?? 0)))}
        </span>
      </div>
    </div>
  );
}

// ─── Donut / Pie chart ────────────────────────────────────────────────────────

/** `color` is the category's own stored hex; null falls back to the ramp position. */
interface DonutEntry { name: string; value: number; color?: string | null }

export function TreasuryDonutChart({ data }: { data: DonutEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={84}
          outerRadius={100}
          dataKey="value"
          nameKey="name"
          paddingAngle={4}
          strokeWidth={0}
          animationDuration={900}
          animationEasing="ease-out"
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={catColor(entry.color, index)}
              stroke={catColor(entry.color, index)}
              strokeWidth={0}
            />
          ))}
        </Pie>
        <Tooltip content={<PieTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
