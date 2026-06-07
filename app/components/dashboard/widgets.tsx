import React from "react";
import dynamic from "next/dynamic";

const SparkLine = dynamic(() => import("./SparkLine"), {
  ssr: false,
  loading: () => <div className="h-7 w-full rounded bg-white/[0.04]" />,
});
import type { ActivityEntry, Brother } from "../../data";
import { KPI_SPARKLINES } from "../../data";
import { useThresholds } from "../../hooks/useThresholds";
import { SvgIcon } from "../Sidebar";
import { Card } from "./primitives";
import { KPI_ICONS } from "./styles";

// ─── ChapterMomentumWidget ────────────────────────────────────────────────
// Sized and styled to match the surrounding KPICards (rounded-xl, p-4,
// rounded-lg icon tile, uppercase 10px label, bold value). Spans 2 KPI slots
// on xl so the metric breakdown bars have room to breathe. Mirrors the
// chapter-health data exactly — same score, label, and 5-metric breakdown.
export function ChapterMomentumWidget({ score, label, breakdown, onExpand }: {
  score: number;                          // 0-100 — composite chapter health
  label: "Healthy" | "Needs Attention" | "Critical";
  breakdown: Record<string, number>;      // metric → 0-100 (Attendance, GPA, Dues, Service, Deadlines)
  onExpand?: () => void;
}) {
  const accent     = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  const iconBg     = score >= 80 ? "bg-emerald-500/10" : score >= 60 ? "bg-amber-500/10" : "bg-red-500/10";
  const iconColor  = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  const glowColor  = score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : "#f87171";
  const gradientStyle = { background: `radial-gradient(ellipse at 15% 15%, ${glowColor}14 0%, transparent 65%), #10121a` };

  const entries = Object.entries(breakdown);
  const interactive = !!onExpand;
  const sparkStroke = score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : "#f87171";
  const sparkData = KPI_SPARKLINES.health.map((v, i) => ({ i, v }));

  const inner = (
    <div className="flex h-full flex-1 items-center gap-5">
      {/* Left column: same header structure as KPICard so visual rhythm matches */}
      <div className="flex shrink-0 flex-col self-start">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <svg className={`h-4 w-4 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Chapter Health</p>
            <p className={`mt-0.5 text-[22px] font-bold leading-none tracking-tight ${accent}`}>
              {score}<span className="text-[14px] text-slate-500">/100</span>
            </p>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">{label}</p>
          </div>
        </div>
        <div className="mt-2 -mx-1 h-[28px] w-[180px]">
          <SparkLine data={sparkData} stroke={sparkStroke} />
        </div>
      </div>

      {/* Vertical divider, like a column break */}
      <div className="h-16 w-px shrink-0 bg-white/[0.06]" />

      {/* Right column: stacked metric rows. justify-between distributes the
          5 rows across the card's full height so they line up with the KPI
          siblings without feeling cramped. */}
      <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch py-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2.5">
            <span className="w-[68px] shrink-0 text-[11px] text-slate-400">{k}</span>
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ width: `${v}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-300">{v}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onExpand}
        style={gradientStyle}
        className="card-premium flex h-full w-full flex-col rounded-xl border border-white/[0.06] bg-[#10121a] p-4 text-left transition-all duration-200 hover:border-white/[0.12] cursor-pointer group"
      >
        {inner}
      </button>
    );
  }
  return (
    <Card style={gradientStyle} className="!rounded-xl flex h-full flex-col p-4 transition-all duration-200 hover:border-white/[0.12] cursor-default">
      {inner}
    </Card>
  );
}

export function KPICard({ label, value, trend, iconKey, sparkData, accent = "text-white", iconBg = "bg-indigo-500/10", iconColor = "text-indigo-400", strokeColor = "#6366f1", glowColor, onClick }: {
  label: string; value: string; trend: string; iconKey: string; sparkData: number[];
  accent?: string; iconBg?: string; iconColor?: string; strokeColor?: string;
  glowColor?: string;
  onClick?: () => void;
}) {
  const chartData = sparkData.map((v, i) => ({ i, v }));
  const gradientStyle = glowColor
    ? { background: `radial-gradient(ellipse at 15% 15%, ${glowColor}14 0%, transparent 65%), #10121a` }
    : undefined;
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <SvgIcon d={KPI_ICONS[iconKey] ?? ""} className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">{label}</p>
          <p className={`mt-0.5 text-[22px] font-bold leading-none tracking-tight ${accent}`}>{value}</p>
          <p className="mt-1 truncate text-[11px] leading-snug text-slate-400">{trend}</p>
        </div>
      </div>
      <div className="mt-2 -mx-1 h-[28px]">
        <SparkLine data={chartData} stroke={strokeColor} />
      </div>
      {onClick && (
        <div className="mt-1.5 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
          <span className="text-[10px] text-slate-600">View details</span>
          <svg className="h-3 w-3 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={gradientStyle} className="card-premium rounded-xl border border-white/[0.06] bg-[#10121a] flex flex-col p-4 w-full text-left transition-all duration-200 hover:border-white/[0.12] cursor-pointer group">
        {inner}
      </button>
    );
  }
  return (
    <Card style={gradientStyle} className="!rounded-xl flex flex-col p-4 transition-all duration-200 hover:border-white/[0.12] cursor-default">
      {inner}
    </Card>
  );
}

export function ChartWidget({ title, stat, caption, accentColor, children }: {
  title: string; stat: string; caption: string; accentColor?: string; children: React.ReactNode;
}) {
  const gradientStyle = accentColor
    ? { background: `linear-gradient(to bottom, ${accentColor}0d 0%, #10121a 55%)` }
    : undefined;
  return (
    <Card style={gradientStyle} className="overflow-hidden">
      <div className="flex items-start justify-between px-4 pt-4 pb-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-0.5 text-[17px] font-bold tracking-tight text-white">{stat}</p>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">{caption}</p>
      </div>
      <div className="h-[96px] px-1 pb-3">{children}</div>
    </Card>
  );
}

export function ActivityFeed({ entries, onExpand }: { entries: ActivityEntry[]; onExpand?: () => void }) {
  const dot: Record<ActivityEntry["type"], string> = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    info:    "bg-blue-400",
  };

  return (
    <Card style={{ background: "linear-gradient(to bottom, #10b98110 0%, #10121a 50%)" }} className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={onExpand}>
      <div className="h-[3px] bg-emerald-500/50" />
      <div className="border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-white">Activity Feed</h2>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
            {onExpand && (
              <button onClick={(e) => { e.stopPropagation(); onExpand(); }} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-300 transition-colors">
                All
                <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[12px] text-slate-500">No recent activity</p>
        </div>
      ) : (
        <div className="max-h-[220px] overflow-y-auto divide-y divide-white/[0.04]">
          {entries.map(e => (
            <div key={e.id} className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.type]}`} />
              <p className="flex-1 text-[12px] leading-snug text-slate-300">{e.message}</p>
              <span className="shrink-0 text-[10px] text-slate-500">{e.timestamp}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function AttBar({ pct }: { pct: number }) {
  const THRESHOLDS = useThresholds();
  const bar  = pct >= THRESHOLDS.attendanceWatch ? "bg-emerald-400" : pct >= THRESHOLDS.attendanceAtRisk ? "bg-amber-400" : "bg-red-400";
  const text = pct >= THRESHOLDS.attendanceWatch ? "text-white" : pct >= THRESHOLDS.attendanceAtRisk ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`tabular-nums text-[13px] font-medium ${text}`}>{pct}%</span>
    </div>
  );
}

export function SortTh({ label, active, dir, onClick }: {
  label: string; colKey: keyof Brother; active: boolean; dir: "asc" | "desc"; onClick: () => void;
}) {
  return (
    <th onClick={onClick} className="group cursor-pointer select-none px-3 py-2.5 text-left">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 transition-colors group-hover:text-slate-300">
        {label}
        <span className={`transition-opacity ${active ? "opacity-100 text-slate-400" : "opacity-0 group-hover:opacity-40"}`}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </span>
    </th>
  );
}
