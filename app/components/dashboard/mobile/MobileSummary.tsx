"use client";

import { fmt$ } from "../../../data";
import { SvgIcon } from "../../Sidebar";
import { KPI_ICONS } from "../styles";
import type { KPIDrawerKey, MobileHealth, MobileKpis } from "./MobileDashboard";

const HEALTH_RING: Record<MobileHealth["label"], string> = {
  "Healthy":         "text-emerald-400",
  "Needs Attention": "text-amber-400",
  "Critical":        "text-red-400",
};

export function MobileSummary({ health, healthDelta, kpis, onExpandHealth, onOpenKpi }: {
  health: MobileHealth;
  healthDelta: number | null;
  kpis: MobileKpis;
  onExpandHealth: () => void;
  onOpenKpi: (k: KPIDrawerKey) => void;
}) {
  const ring = HEALTH_RING[health.label];

  // Each chip condenses a full KPICard into a glanceable tap target (no sparkline).
  const chips: { key: KPIDrawerKey; label: string; value: string; color: string }[] = [
    { key: "attendance", label: "Att",    value: `${kpis.avgAttendance.toFixed(0)}%`,           color: "text-blue-400"    },
    { key: "dues",       label: "Dues",   value: fmt$(kpis.outstandingDues),                    color: kpis.outstandingDues > 0 ? "text-amber-400" : "text-white" },
    { key: "gpa",        label: "GPA",    value: kpis.chapterGPA.toFixed(2),                    color: "text-violet-400"  },
    { key: "service",    label: "Svc",    value: `${kpis.totalServiceHrs}h`,                    color: "text-emerald-400" },
    { key: "treasury",   label: "Bank",   value: fmt$(kpis.liveBalance),                        color: "text-indigo-400"  },
    { key: "door",       label: "Door",   value: fmt$(kpis.totalDoorRev),                       color: "text-pink-400"    },
  ];

  return (
    <div className="px-3 pt-3 pb-2">
      {/* Compact health header */}
      <button
        onClick={onExpandHealth}
        className="mb-2.5 flex w-full items-center gap-3 rounded-xl card-premium px-3 py-2 text-left active:border-white/[0.14]"
      >
        <div className={`text-[26px] font-bold tabular-nums leading-none ${ring}`}>{health.score}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[13px] font-semibold ${ring}`}>{health.label}</span>
            {healthDelta !== null && (
              <span className={`text-[10px] font-semibold ${healthDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {healthDelta >= 0 ? "↑" : "↓"}{Math.abs(healthDelta)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500">Chapter health · tap for detail</p>
        </div>
        <svg className="h-4 w-4 shrink-0 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* KPI strip — 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-2">
        {chips.map(c => (
          <button
            key={c.key}
            onClick={() => onOpenKpi(c.key)}
            className="flex flex-col gap-0.5 rounded-xl card-premium px-2.5 py-2 text-left active:border-white/[0.14]"
          >
            <div className="flex items-center gap-1 text-slate-500">
              <SvgIcon d={KPI_ICONS[c.key] ?? ""} className="h-3 w-3" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{c.label}</span>
            </div>
            <span className={`truncate text-[14px] font-bold tabular-nums ${c.color}`}>{c.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
