"use client";

import React, { useState, useMemo } from "react";
import { Sidebar } from "../components/Sidebar";
import { UserAvatar } from "../components/UserAvatar";
import { StatusBadge } from "../components/dashboard/primitives";
import { useChapter } from "../context/ChapterContext";
import {
  Brother,
  BrotherStatus,
  THRESHOLDS,
  getBrotherStatus,
  avg,
  fmt$,
} from "../data";
import { BROTHER_STYLES } from "../components/dashboard/styles";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return `${n.toFixed(0)}%`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

// Mini bar — fills a fixed-height track
function Bar({
  value, max = 100, colorClass,
}: {
  value: number;
  max?: number;
  colorClass: string;
}) {
  const w = clamp((value / max) * 100, 0, 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${w}%` }} />
    </div>
  );
}

// Radial-arc gauge used in the KPI strip
function Gauge({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const SIZE = 56;
  const R = 22;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const circ = 2 * Math.PI * R;
  const arc = circ * 0.75; // 270° arc
  const offset = arc - (clamp(value / max, 0, 1) * arc);
  const rotation = 135; // start from bottom-left

  return (
    <svg width={SIZE} height={SIZE} className="-rotate-[0deg]" viewBox={`0 0 ${SIZE} ${SIZE}`}>
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={5}
        strokeDasharray={`${arc} ${circ - arc}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${cx} ${cy})`}
      />
      {/* Fill */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${arc} ${circ - arc}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(${rotation} ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// Status color for Gauge fill
function statusColor(status: BrotherStatus) {
  if (status === "Good") return "#34d399";
  if (status === "Watch") return "#fbbf24";
  return "#f87171";
}

// ─── Stat card (chapter-wide KPI) ────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#141925] px-4 py-3.5 flex flex-col gap-1">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-[24px] font-bold leading-none tabular-nums ${accent}`}>{value}</p>
      <p className="text-[11px] text-slate-500 leading-tight">{sub}</p>
    </div>
  );
}

// ─── Brother detail drawer ────────────────────────────────────────────────────

function BrotherDrawer({ brother, onClose }: { brother: Brother; onClose: () => void }) {
  const status = getBrotherStatus(brother);

  const metrics = [
    {
      label: "Attendance",
      value: `${brother.attendance}%`,
      bar: brother.attendance,
      max: 100,
      color: brother.attendance < THRESHOLDS.attendanceAtRisk
        ? "bg-red-500"
        : brother.attendance < THRESHOLDS.attendanceWatch
          ? "bg-amber-500"
          : "bg-emerald-500",
      note: brother.attendance < THRESHOLDS.attendanceAtRisk
        ? `At risk — below ${THRESHOLDS.attendanceAtRisk}%`
        : brother.attendance < THRESHOLDS.attendanceWatch
          ? `Watch — below ${THRESHOLDS.attendanceWatch}%`
          : "On track",
    },
    {
      label: "GPA",
      value: brother.gpa.toFixed(2),
      bar: (brother.gpa / 4) * 100,
      max: 100,
      color: brother.gpa < THRESHOLDS.gpaAtRisk
        ? "bg-red-500"
        : brother.gpa < THRESHOLDS.gpaWatch
          ? "bg-amber-500"
          : "bg-indigo-400",
      note: brother.gpa < THRESHOLDS.gpaAtRisk
        ? `At risk — below ${THRESHOLDS.gpaAtRisk}`
        : brother.gpa < THRESHOLDS.gpaWatch
          ? `Watch — below ${THRESHOLDS.gpaWatch}`
          : "On track",
    },
    {
      label: "Service Hours",
      value: `${brother.serviceHours}h`,
      bar: brother.serviceHours,
      max: THRESHOLDS.serviceHoursGoal * 2,
      color: brother.serviceHours >= THRESHOLDS.serviceHoursGoal ? "bg-emerald-500" : "bg-amber-500",
      note: brother.serviceHours >= THRESHOLDS.serviceHoursGoal
        ? `Goal met (${THRESHOLDS.serviceHoursGoal}h)`
        : `${THRESHOLDS.serviceHoursGoal - brother.serviceHours}h below goal`,
    },
    {
      label: "Dues Owed",
      value: fmt$(brother.duesOwed),
      bar: brother.duesOwed === 0 ? 100 : 0,
      max: 100,
      color: brother.duesOwed === 0 ? "bg-emerald-500" : "bg-red-500",
      note: brother.duesOwed === 0 ? "Paid in full" : "Outstanding balance",
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-white/[0.06] bg-[#0d1117] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <p className="text-[15px] font-semibold text-white">{brother.name}</p>
            <p className="text-[12px] text-slate-500 mt-0.5">{brother.role}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Gauge + summary */}
        <div className="border-b border-white/[0.06] px-6 py-5">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <Gauge value={brother.attendance} max={100} color={statusColor(status)} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-bold tabular-nums text-white">{brother.attendance}%</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[12px] text-slate-400">Overall attendance</p>
              <p className="text-[11px] text-slate-600 leading-snug">
                GPA {brother.gpa.toFixed(2)} · {brother.serviceHours}h service
                {brother.duesOwed > 0 ? ` · owes ${fmt$(brother.duesOwed)}` : " · dues clear"}
              </p>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {metrics.map(m => (
            <div key={m.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-slate-400">{m.label}</span>
                <span className="text-[13px] font-semibold tabular-nums text-slate-200">{m.value}</span>
              </div>
              <Bar value={m.bar} max={m.max} colorClass={m.color} />
              <p className="mt-1 text-[11px] text-slate-600">{m.note}</p>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

// ─── Sort button ──────────────────────────────────────────────────────────────

type SortKey = "attendance" | "gpa" | "serviceHours" | "duesOwed" | "name";

function SortButton({
  label, sortKey, activeKey, dir, onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
        isActive ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {label}
      {isActive && (
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
          {dir === "asc"
            ? <path d="M8 3.5L3.5 9h9L8 3.5Z" />
            : <path d="M8 12.5L3.5 7h9L8 12.5Z" />}
        </svg>
      )}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrothersPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BrotherStatus | "All">("All");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Brother | null>(null);

  const { brotherList, isLoading } = useChapter();

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Chapter-wide KPIs ────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!brotherList.length) return null;
    const attRisk   = brotherList.filter(b => getBrotherStatus(b) === "At Risk").length;
    const watching  = brotherList.filter(b => getBrotherStatus(b) === "Watch").length;
    const duesTotal = brotherList.reduce((s, b) => s + b.duesOwed, 0);
    const svcMet    = brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length;
    return {
      avgAtt:    avg(brotherList.map(b => b.attendance)),
      avgGpa:    avg(brotherList.map(b => b.gpa)),
      attRisk,
      watching,
      duesTotal,
      svcMet,
      total:     brotherList.length,
    };
  }, [brotherList]);

  // ── Status counts for filter chips ──────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts = { All: brotherList.length, Good: 0, Watch: 0, "At Risk": 0 };
    brotherList.forEach(b => { counts[getBrotherStatus(b)]++; });
    return counts;
  }, [brotherList]);

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = brotherList.filter(b => {
      const q = search.toLowerCase();
      const matchQ = !q || b.name.toLowerCase().includes(q) || b.role.toLowerCase().includes(q);
      const matchS = statusFilter === "All" || getBrotherStatus(b) === statusFilter;
      return matchQ && matchS;
    });
    if (sortKey) {
      result = [...result].sort((a, b) => {
        if (sortKey === "name") {
          return sortDir === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        }
        const av = a[sortKey] as number, bv = b[sortKey] as number;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return result;
  }, [brotherList, search, statusFilter, sortKey, sortDir]);

  const filterChips: Array<{ label: string; value: BrotherStatus | "All" }> = [
    { label: "All",     value: "All"     },
    { label: "Good",    value: "Good"    },
    { label: "Watch",   value: "Watch"   },
    { label: "At Risk", value: "At Risk" },
  ];

  const chipActive = "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/20";
  const chipIdle   = "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200";

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Brotherhood"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Toolbar ── */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Brotherhood</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">
              {brotherList.length} members · chapter analytics
            </p>
          </div>
          <UserAvatar />
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">

            {/* ── KPI strip ── */}
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 rounded-xl border border-white/[0.06] bg-[#141925] animate-pulse" />
                ))}
              </div>
            ) : kpis && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  label="Avg Attendance"
                  value={pct(kpis.avgAtt)}
                  sub={`${kpis.attRisk} at risk · ${kpis.watching} on watch`}
                  accent={kpis.avgAtt < THRESHOLDS.attendanceAtRisk ? "text-red-400" : kpis.avgAtt < THRESHOLDS.attendanceWatch ? "text-amber-400" : "text-emerald-400"}
                />
                <KpiCard
                  label="Avg GPA"
                  value={kpis.avgGpa.toFixed(2)}
                  sub={`out of 4.0`}
                  accent={kpis.avgGpa < THRESHOLDS.gpaAtRisk ? "text-red-400" : kpis.avgGpa < THRESHOLDS.gpaWatch ? "text-amber-400" : "text-indigo-400"}
                />
                <KpiCard
                  label="Dues Owed"
                  value={fmt$(kpis.duesTotal)}
                  sub={`${brotherList.filter(b => b.duesOwed > 0).length} brothers outstanding`}
                  accent={kpis.duesTotal === 0 ? "text-emerald-400" : "text-red-400"}
                />
                <KpiCard
                  label="Service Goal"
                  value={`${kpis.svcMet} / ${kpis.total}`}
                  sub={`met ${THRESHOLDS.serviceHoursGoal}h goal`}
                  accent="text-white"
                />
              </div>
            )}

            {/* ── Status distribution bar ── */}
            {!isLoading && kpis && (
              <div className="rounded-xl border border-white/[0.06] bg-[#141925] px-5 py-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Status distribution</p>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full gap-0.5">
                  {statusCounts.Good > 0 && (
                    <div
                      className="bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ flex: statusCounts.Good }}
                      title={`Good: ${statusCounts.Good}`}
                    />
                  )}
                  {statusCounts.Watch > 0 && (
                    <div
                      className="bg-amber-500 rounded-full transition-all duration-500"
                      style={{ flex: statusCounts.Watch }}
                      title={`Watch: ${statusCounts.Watch}`}
                    />
                  )}
                  {statusCounts["At Risk"] > 0 && (
                    <div
                      className="bg-red-500 rounded-full transition-all duration-500"
                      style={{ flex: statusCounts["At Risk"] }}
                      title={`At Risk: ${statusCounts["At Risk"]}`}
                    />
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-5">
                  {[
                    { label: "Good",    count: statusCounts.Good,          color: "bg-emerald-500" },
                    { label: "Watch",   count: statusCounts.Watch,         color: "bg-amber-500"   },
                    { label: "At Risk", count: statusCounts["At Risk"],     color: "bg-red-500"     },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${color}`} />
                      <span className="text-[11px] text-slate-500">{label} <span className="font-semibold text-slate-300">{count}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Attendance leaderboard ── */}
            {!isLoading && brotherList.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-[#141925] px-5 py-4">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Attendance ranking</p>
                <div className="space-y-2.5">
                  {[...brotherList]
                    .sort((a, b) => b.attendance - a.attendance)
                    .map((b, i) => {
                      const status = getBrotherStatus(b);
                      const barColor = status === "At Risk" ? "bg-red-500" : status === "Watch" ? "bg-amber-500" : "bg-emerald-500";
                      return (
                        <div key={b.id} className="flex items-center gap-3">
                          <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-slate-700">{i + 1}</span>
                          <button
                            onClick={() => setSelected(b)}
                            className="min-w-0 w-28 shrink-0 truncate text-left text-[12px] text-slate-300 hover:text-indigo-300 transition-colors"
                          >
                            {b.name.split(" ")[0]}
                          </button>
                          <div className="flex-1">
                            <Bar value={b.attendance} max={100} colorClass={barColor} />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-300">
                            {b.attendance}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ── Roster table ── */}
            <div className="rounded-xl border border-white/[0.06] bg-[#141925] overflow-hidden">
              {/* Controls */}
              <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {filterChips.map(chip => (
                    <button
                      key={chip.value}
                      onClick={() => setStatusFilter(chip.value)}
                      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${statusFilter === chip.value ? chipActive : chipIdle}`}
                    >
                      {chip.label}
                      <span className="ml-1.5 tabular-nums opacity-60">
                        {statusCounts[chip.value]}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name or role…"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-3 text-[12px] text-slate-300 placeholder:text-slate-600 focus:border-indigo-500/40 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 sm:w-52"
                  />
                </div>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-x-4 border-b border-white/[0.04] px-5 py-2">
                <SortButton label="Name"     sortKey="name"         activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Att."     sortKey="attendance"   activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="GPA"      sortKey="gpa"          activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Service"  sortKey="serviceHours" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Dues"     sortKey="duesOwed"     activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <span className="text-[11px] font-medium text-slate-600">Status</span>
              </div>

              {/* Rows */}
              {isLoading ? (
                <div className="space-y-0">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-14 border-b border-white/[0.04] px-5 flex items-center gap-4 animate-pulse">
                      <div className="h-3 w-36 rounded bg-white/[0.05]" />
                      <div className="ml-auto h-3 w-24 rounded bg-white/[0.05]" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-slate-600">No brothers match your filters.</div>
              ) : (
                filtered.map(b => {
                  const status = getBrotherStatus(b);
                  const borderColor = BROTHER_STYLES[status].row;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelected(selected?.id === b.id ? null : b)}
                      className={`grid w-full grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-x-4 border-b border-l-2 border-white/[0.03] px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-white/[0.03] ${borderColor} ${selected?.id === b.id ? "bg-white/[0.03]" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-slate-200">{b.name}</p>
                        <p className="truncate text-[11px] text-slate-600">{b.role}</p>
                      </div>
                      <div className="flex w-16 flex-col items-end gap-1">
                        <span className={`text-[12px] font-semibold tabular-nums ${b.attendance < THRESHOLDS.attendanceAtRisk ? "text-red-400" : b.attendance < THRESHOLDS.attendanceWatch ? "text-amber-400" : "text-slate-300"}`}>
                          {b.attendance}%
                        </span>
                        <Bar value={b.attendance} max={100} colorClass={b.attendance < THRESHOLDS.attendanceAtRisk ? "bg-red-500" : b.attendance < THRESHOLDS.attendanceWatch ? "bg-amber-500" : "bg-emerald-500"} />
                      </div>
                      <span className={`w-10 text-right text-[12px] tabular-nums ${b.gpa < THRESHOLDS.gpaAtRisk ? "text-red-400" : b.gpa < THRESHOLDS.gpaWatch ? "text-amber-400" : "text-slate-400"}`}>
                        {b.gpa.toFixed(2)}
                      </span>
                      <span className={`w-14 text-right text-[12px] tabular-nums ${b.serviceHours >= THRESHOLDS.serviceHoursGoal ? "text-slate-400" : "text-amber-400"}`}>
                        {b.serviceHours}h
                      </span>
                      <span className={`w-14 text-right text-[12px] tabular-nums ${b.duesOwed > 0 ? "text-red-400" : "text-slate-600"}`}>
                        {b.duesOwed > 0 ? fmt$(b.duesOwed) : "—"}
                      </span>
                      <StatusBadge status={status} />
                    </button>
                  );
                })
              )}

              {filtered.length > 0 && (
                <div className="border-t border-white/[0.04] px-5 py-2.5 text-[11px] text-slate-600">
                  {filtered.length} of {brotherList.length} brothers
                </div>
              )}
            </div>

          </div>
        </main>
      </div>

      {/* Detail drawer */}
      {selected && <BrotherDrawer brother={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
