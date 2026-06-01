"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Sidebar } from "../../components/Sidebar";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { UserAvatar } from "../../components/UserAvatar";
import { StatusBadge, Modal, FieldLabel, ConfirmDialog } from "../../components/dashboard/primitives";
import { inputCls } from "../../components/dashboard/styles";
import { BrotherDrawer } from "../../components/dashboard/drawers/BrotherDrawer";
import { useChapter } from "../../context/ChapterContext";
import {
  Brother,
  BrotherStatus,
  THRESHOLDS,
  getBrotherStatus,
  avg,
  fmt$,
} from "../../data";
import { BROTHER_STYLES } from "../../components/dashboard/styles";
import { requestJson } from "../../lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return `${n.toFixed(0)}%`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

// Mini bar
function Bar({ value, max = 100, colorClass }: { value: number; max?: number; colorClass: string }) {
  const w = clamp((value / max) * 100, 0, 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${w}%` }} />
    </div>
  );
}

// KPI card
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#10121a] px-4 py-3.5 flex flex-col gap-1">
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-[24px] font-bold leading-none tabular-nums ${accent}`}>{value}</p>
      <p className="text-[11px] text-slate-500 leading-tight">{sub}</p>
    </div>
  );
}

// Sort button
type SortKey = "attendance" | "gpa" | "serviceHours" | "duesOwed" | "name";

function SortButton({ label, sortKey, activeKey, dir, onClick }: {
  label: string; sortKey: SortKey; activeKey: SortKey | null; dir: "asc" | "desc"; onClick: (k: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${isActive ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
    >
      {label}
      {isActive && (
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
          {dir === "asc" ? <path d="M8 3.5L3.5 9h9L8 3.5Z" /> : <path d="M8 12.5L3.5 7h9L8 12.5Z" />}
        </svg>
      )}
    </button>
  );
}

// Add Brother form
function AddBrotherForm({ onSubmit, onCancel }: {
  onSubmit: (data: Omit<Brother, "id" | "attendance">) => void;
  onCancel: () => void;
}) {
  const [name,         setName]         = useState("");
  const [role,         setRole]         = useState("");
  const [gpa,          setGpa]          = useState("0.00");
  const [duesOwed,     setDuesOwed]     = useState("0");
  const [serviceHours, setServiceHours] = useState("0");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name:         name.trim(),
      role:         role.trim(),
      gpa:          Math.min(4.0, Math.max(0, parseFloat(gpa) || 0)),
      duesOwed:     Math.max(0, parseFloat(duesOwed) || 0),
      serviceHours: Math.max(0, parseFloat(serviceHours) || 0),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <FieldLabel>Name</FieldLabel>
        <input required className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
      </div>
      <div>
        <FieldLabel>Role / Committees</FieldLabel>
        <input required className={inputCls} value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. President · Rush" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <FieldLabel>GPA</FieldLabel>
          <input type="number" min="0" max="4" step="0.01" className={inputCls} value={gpa} onChange={e => setGpa(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Dues ($)</FieldLabel>
          <input type="number" min="0" className={inputCls} value={duesOwed} onChange={e => setDuesOwed(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Service (h)</FieldLabel>
          <input type="number" min="0" className={inputCls} value={serviceHours} onChange={e => setServiceHours(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors">Cancel</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">Add Brother</button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrothersPage() {
  const { currentUser, brotherList, setBrotherList, isLoading, avatarRevision, can } = useChapter();
  const canBrothers = can("MANAGE_BROTHERS");
  const selfId = currentUser?.id ?? null;

  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [search,           setSearch]           = useState("");
  const [statusFilter,     setStatusFilter]     = useState<BrotherStatus | "All">("All");
  const [sortKey,          setSortKey]          = useState<SortKey | null>(null);
  const [sortDir,          setSortDir]          = useState<"asc" | "desc">("asc");
  const [selectedId,       setSelectedId]       = useState<number | null>(null);
  const [showAddModal,     setShowAddModal]     = useState(false);
  const [pageError,        setPageError]        = useState<string | null>(null);
  const [deleteError,      setDeleteError]      = useState<string | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!brotherList.length) return null;
    const attRisk  = brotherList.filter(b => getBrotherStatus(b) === "At Risk").length;
    const watching = brotherList.filter(b => getBrotherStatus(b) === "Watch").length;
    const duesTotal = brotherList.reduce((s, b) => s + b.duesOwed, 0);
    const svcMet   = brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length;
    return { avgAtt: avg(brotherList.map(b => b.attendance)), avgGpa: avg(brotherList.map(b => b.gpa)), attRisk, watching, duesTotal, svcMet, total: brotherList.length };
  }, [brotherList]);

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
        if (sortKey === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        const av = a[sortKey] as number, bv = b[sortKey] as number;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return result;
  }, [brotherList, search, statusFilter, sortKey, sortDir]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const handleAddBrother = useCallback(async (data: Omit<Brother, "id" | "attendance">) => {
    const optimisticId = -Date.now();
    const optimistic: Brother = { ...data, id: optimisticId, attendance: 0 };
    setBrotherList(prev => [...prev, optimistic]);
    setShowAddModal(false);
    setPageError(null);
    try {
      const saved = await requestJson<Brother>("/api/brothers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, attendance: 0 }),
      });
      setBrotherList(prev => prev.map(b => b.id === optimisticId ? saved : b));
    } catch {
      setBrotherList(prev => prev.filter(b => b.id !== optimisticId));
      setPageError("Failed to add brother. Please try again.");
    }
  }, [setBrotherList]);

  const updateBrother = useCallback((id: number, updates: Omit<Brother, "id">) => {
    const prev = brotherList.find(b => b.id === id);
    if (!prev) return;
    setBrotherList(list => list.map(b => b.id === id ? { ...b, ...updates } : b));
    requestJson<Brother>(`/api/brothers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    }).catch(() => {
      setBrotherList(list => list.map(b => b.id === id ? prev : b));
      setPageError("Update failed. Changes were reverted.");
    });
  }, [brotherList, setBrotherList]);

  const payDues = useCallback((b: Brother) => {
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, duesOwed: 0 } : x));
    requestJson<Brother>(`/api/brothers/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duesOwed: 0 }),
    }).catch(() => {
      setBrotherList(prev => prev.map(x => x.id === b.id ? b : x));
      setPageError("Dues update failed. Changes were reverted.");
    });
  }, [setBrotherList]);

  const addServiceHours = useCallback((b: Brother, hours: number) => {
    const newHrs = b.serviceHours + hours;
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, serviceHours: newHrs } : x));
    requestJson<Brother>(`/api/brothers/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceHours: newHrs }),
    }).catch(() => {
      setBrotherList(prev => prev.map(x => x.id === b.id ? b : x));
      setPageError("Service hours update failed. Changes were reverted.");
    });
  }, [setBrotherList]);

  const deleteBrother = useCallback(async (b: Brother) => {
    setBrotherList(prev => prev.filter(x => x.id !== b.id));
    setSelectedId(null);
    setDeleteError(null);
    try {
      await requestJson<void>(`/api/brothers/${b.id}`, { method: "DELETE" });
    } catch (err) {
      setBrotherList(prev => [...prev, b]);
      const msg = err instanceof Error && err.message.includes("attendance records")
        ? "Cannot remove a brother with attendance records."
        : "Failed to remove brother.";
      setDeleteError(msg);
    }
  }, [setBrotherList]);

  // ── CSV export ────────────────────────────────────────────────────────────
  function handleExport() {
    const rows = [
      ["Name", "Role", "Attendance %", "GPA", "Service Hours", "Dues Owed", "Status"],
      ...filtered.map(b => [
        b.name,
        b.role,
        String(b.attendance),
        b.gpa.toFixed(2),
        String(b.serviceHours),
        b.duesOwed.toFixed(2),
        getBrotherStatus(b),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brotherhood-roster.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const filterChips: Array<{ label: string; value: BrotherStatus | "All" }> = [
    { label: "All", value: "All" },
    { label: "Good", value: "Good" },
    { label: "Watch", value: "Watch" },
    { label: "At Risk", value: "At Risk" },
  ];

  const chipActive = "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/20";
  const chipIdle   = "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200";

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Brotherhood" onNavClick={() => {}} />

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
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">{currentUser?.org?.name ?? "ChaptOS"} · Brotherhood Roster</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleExport}
              title="Export CSV"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-slate-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            {canBrothers && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-white/[0.04] px-3.5 text-[12px] font-semibold text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-indigo-400/35 hover:bg-indigo-500/[0.08] hover:text-white"
              >
                <svg className="h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">New Brother</span>
              </button>
            )}
            <UserAvatar />
          </div>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">

            {/* ── Error toasts ── */}
            {pageError && (
              <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                <p className="text-[13px] text-red-300">{pageError}</p>
                <button onClick={() => setPageError(null)} className="ml-4 text-[11px] text-red-400 hover:text-red-200">Dismiss</button>
              </div>
            )}
            {deleteError && (
              <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <p className="text-[13px] text-amber-300">{deleteError}</p>
                <button onClick={() => setDeleteError(null)} className="ml-4 text-[11px] text-amber-400 hover:text-amber-200">Dismiss</button>
              </div>
            )}

            {/* ── KPI strip ── */}
            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl border border-white/[0.06] bg-[#10121a] animate-pulse" />)}
              </div>
            ) : kpis && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Avg Attendance" value={pct(kpis.avgAtt)} sub={`${kpis.attRisk} at risk · ${kpis.watching} on watch`} accent={kpis.avgAtt < THRESHOLDS.attendanceAtRisk ? "text-red-400" : kpis.avgAtt < THRESHOLDS.attendanceWatch ? "text-amber-400" : "text-emerald-400"} />
                <KpiCard label="Avg GPA" value={kpis.avgGpa.toFixed(2)} sub="out of 4.0" accent={kpis.avgGpa < THRESHOLDS.gpaAtRisk ? "text-red-400" : kpis.avgGpa < THRESHOLDS.gpaWatch ? "text-amber-400" : "text-indigo-400"} />
                <KpiCard label="Dues Owed" value={fmt$(kpis.duesTotal)} sub={`${brotherList.filter(b => b.duesOwed > 0).length} brothers outstanding`} accent={kpis.duesTotal === 0 ? "text-emerald-400" : "text-red-400"} />
                <KpiCard label="Service Goal" value={`${kpis.svcMet} / ${kpis.total}`} sub={`met ${THRESHOLDS.serviceHoursGoal}h goal`} accent="text-white" />
              </div>
            )}

            {/* ── Status distribution bar ── */}
            {!isLoading && kpis && (
              <div className="rounded-xl border border-white/[0.06] bg-[#10121a] px-5 py-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Status distribution</p>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full gap-0.5">
                  {statusCounts.Good > 0 && (
                    <button
                      onClick={() => setStatusFilter(statusFilter === "Good" ? "All" : "Good")}
                      className="bg-emerald-500 rounded-full transition-all duration-500 hover:opacity-80"
                      style={{ flex: statusCounts.Good }}
                      title={`Good: ${statusCounts.Good} — click to filter`}
                    />
                  )}
                  {statusCounts.Watch > 0 && (
                    <button
                      onClick={() => setStatusFilter(statusFilter === "Watch" ? "All" : "Watch")}
                      className="bg-amber-500 rounded-full transition-all duration-500 hover:opacity-80"
                      style={{ flex: statusCounts.Watch }}
                      title={`Watch: ${statusCounts.Watch} — click to filter`}
                    />
                  )}
                  {statusCounts["At Risk"] > 0 && (
                    <button
                      onClick={() => setStatusFilter(statusFilter === "At Risk" ? "All" : "At Risk")}
                      className="bg-red-500 rounded-full transition-all duration-500 hover:opacity-80"
                      style={{ flex: statusCounts["At Risk"] }}
                      title={`At Risk: ${statusCounts["At Risk"]} — click to filter`}
                    />
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-5">
                  {[
                    { label: "Good",    count: statusCounts.Good,        color: "bg-emerald-500" },
                    { label: "Watch",   count: statusCounts.Watch,       color: "bg-amber-500"   },
                    { label: "At Risk", count: statusCounts["At Risk"],  color: "bg-red-500"     },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${color}`} />
                      <span className="text-[11px] text-slate-500">{label} <span className="font-semibold text-slate-300">{count}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Roster table ── */}
            <div className="rounded-xl border border-white/[0.06] bg-[#10121a] overflow-x-auto">
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
                      <span className="ml-1.5 tabular-nums opacity-60">{statusCounts[chip.value]}</span>
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
              <div className="grid min-w-[560px] grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-x-4 border-b border-white/[0.04] px-5 py-2">
                <SortButton label="Name"    sortKey="name"         activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Att."    sortKey="attendance"   activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="GPA"     sortKey="gpa"          activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Service" sortKey="serviceHours" activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortButton label="Dues"    sortKey="duesOwed"     activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
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
                      onClick={() => setSelectedId(selectedId === b.id ? null : b.id)}
                      className={`grid w-full min-w-[560px] grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-x-4 border-b border-l-2 border-white/[0.03] px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-white/[0.03] ${borderColor} ${selectedId === b.id ? "bg-white/[0.03]" : ""}`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <BrotherAvatar
                          brother={b}
                          selfId={selfId}
                          selfAvatarUrl={currentUser?.avatarUrl}
                          avatarRevision={avatarRevision}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-200">{b.name}</p>
                          <p className="truncate text-[11px] text-slate-600">{b.role}</p>
                        </div>
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

            {/* ── Attendance leaderboard ── */}
            {!isLoading && brotherList.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-[#10121a] px-5 py-4">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Attendance ranking</p>
                <div className="space-y-2.5">
                  {[...brotherList].sort((a, b) => b.attendance - a.attendance).map((b, i) => {
                    const status = getBrotherStatus(b);
                    const barColor = status === "At Risk" ? "bg-red-500" : status === "Watch" ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <div key={b.id} className="flex items-center gap-3">
                        <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-slate-700">{i + 1}</span>
                        <button
                          onClick={() => setSelectedId(b.id)}
                          className="min-w-0 w-28 shrink-0 truncate text-left text-[12px] text-slate-300 hover:text-indigo-300 transition-colors"
                        >
                          {b.name.split(" ")[0]}
                        </button>
                        <div className="flex-1">
                          <Bar value={b.attendance} max={100} colorClass={barColor} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-300">{b.attendance}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── Add Brother Modal ── */}
      {showAddModal && (
        <Modal title="New Brother" onClose={() => setShowAddModal(false)}>
          <AddBrotherForm
            onSubmit={handleAddBrother}
            onCancel={() => setShowAddModal(false)}
          />
        </Modal>
      )}

      {/* ── Brother Drawer ── */}
      <BrotherDrawer
        brotherId={selectedId}
        brotherList={brotherList}
        onClose={() => setSelectedId(null)}
        onSave={updateBrother}
        onPayDues={payDues}
        onAddServiceHours={addServiceHours}
        onDelete={deleteBrother}
        isAdmin={canBrothers}
        selfId={selfId}
      />
    </div>
  );
}
