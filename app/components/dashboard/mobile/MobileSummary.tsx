"use client";

import { fmt$ } from "../../../data";
import { SvgIcon } from "../../Sidebar";
import { KPI_ICONS } from "../styles";
import type { Announcement } from "../AnnouncementCard";
import type { KPIDrawerKey, MobileKpis } from "./MobileDashboard";

const PIN_PATH = "M5 11l5-5 7 7-5 5-7-7zm12 6l4 4M9 7l8 8";

export function MobileSummary({ announcement, kpis, onEditAnnouncement, onOpenKpi }: {
  announcement: Announcement | null;
  kpis: MobileKpis;
  onEditAnnouncement: () => void;
  onOpenKpi: (k: KPIDrawerKey) => void;
}) {
  const title = announcement?.title ?? "Welcome to your chapter dashboard";
  const preview = announcement?.body ?? "Tap to post the first announcement.";

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
      {/* Compact pinned announcement */}
      <button
        onClick={onEditAnnouncement}
        className="mb-2.5 flex w-full items-center gap-3 rounded-xl card-premium px-3 py-2 text-left active:border-white/[0.14]"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400"
          aria-hidden
        >
          <SvgIcon d={PIN_PATH} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{title}</div>
          <p className="truncate text-[11px] text-slate-400">{preview}</p>
        </div>
        <svg className="h-4 w-4 shrink-0 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828 9 14l.172-2.828z" />
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
