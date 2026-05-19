"use client";

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { fmt$ } from "../../data";

// ─── Colors ───────────────────────────────────────────────────────────────────

const DONUT_COLORS = [
  "#2563eb", "#0f766e", "#ca8a04", "#7c3aed",
  "#be123c", "#15803d", "#c2410c", "#475569",
];

export function catColor(name: string, index: number): string {
  return DONUT_COLORS[index % DONUT_COLORS.length];
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function MultiTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(10,12,20,0.94)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
      boxShadow: "0 12px 28px -8px rgba(0,0,0,0.8)", padding: "8px 12px", minWidth: 140,
    }}>
      {label && <p style={{ fontSize: 10, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</p>}
      {payload.map(item => (
        <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: item.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "#94a3b8", flex: 1 }}>{item.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-geist-mono, monospace)" }}>
            {fmt$(Math.round(Number(item.value ?? 0)))}
          </span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number; payload?: { fill?: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const color = item.payload?.fill ?? "#94a3b8";
  return (
    <div style={{
      background: "rgba(10,12,20,0.94)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
      boxShadow: "0 12px 28px -8px rgba(0,0,0,0.8)", padding: "8px 12px", minWidth: 130,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: "#94a3b8", flex: 1 }}>{item.name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-geist-mono, monospace)" }}>
          {fmt$(Math.round(Number(item.value ?? 0)))}
        </span>
      </div>
    </div>
  );
}

// ─── Area + Biweekly bar chart ────────────────────────────────────────────────

interface RunningEntry { label: string; balance: number; expenses: number }
interface BiweekEntry  { period: string; net: number }

export function TreasuryAreaChart({ data, biweeklyData, semester }: {
  data: RunningEntry[];
  biweeklyData: BiweekEntry[];
  semester: string;
}) {
  return (
    <>
      <div className="px-2 pb-4">
        {data.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center">
            <p className="text-[12px] text-slate-600">No transactions yet for {semester}</p>
          </div>
        ) : (
          <>
            <div className="mb-1 flex justify-end gap-3 px-4 text-[10px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />Balance</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />Expenses</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#38bdf8" stopOpacity={0.22} />
                    <stop offset="85%"  stopColor="#38bdf8" stopOpacity={0.02} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#f87171" stopOpacity={0.22} />
                    <stop offset="85%"  stopColor="#f87171" stopOpacity={0.02} />
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#334155" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "#334155" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip content={<MultiTooltip />} />
                <Area type="monotone" dataKey="balance" name="Balance" stroke="#38bdf8" strokeWidth={2} fill="url(#balGrad)" dot={false} activeDot={{ r: 4, fill: "#38bdf8", strokeWidth: 0 }} animationDuration={900} animationEasing="ease-out" />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f87171" strokeWidth={2} fill="url(#expenseGrad)" dot={false} activeDot={{ r: 4, fill: "#f87171", strokeWidth: 0 }} animationDuration={900} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {biweeklyData.length > 0 && (
        <div className="border-t border-white/[0.05] px-2 pt-1 pb-3">
          <p className="mb-1 px-4 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">Biweekly Net</p>
          <ResponsiveContainer width="100%" height={52}>
            <BarChart data={biweeklyData} margin={{ top: 2, right: 8, bottom: 0, left: -16 }} barSize={12}>
              <XAxis dataKey="period" tick={{ fontSize: 8, fill: "#334155" }} axisLine={false} tickLine={false} interval={0} />
              <Tooltip content={<MultiTooltip />} />
              <Bar dataKey="net" name="Net" radius={[2, 2, 0, 0]} animationDuration={800} animationEasing="ease-out">
                {biweeklyData.map((entry, i) => (
                  <Cell key={i} fill={entry.net >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

// ─── Donut / Pie chart ────────────────────────────────────────────────────────

interface DonutEntry { name: string; value: number }

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
              fill={catColor(entry.name, index)}
              stroke={catColor(entry.name, index)}
              strokeWidth={0}
            />
          ))}
        </Pie>
        <Tooltip content={<PieTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
