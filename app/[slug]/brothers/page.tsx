"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Sidebar } from "../../components/Sidebar";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { Modal, FieldLabel } from "../../components/dashboard/primitives";
import { inputDuskCls, btnDuskGhostCls, btnDuskActionCls } from "../../components/dashboard/styles";
import { BrotherDrawer } from "../../components/dashboard/drawers/BrotherDrawer";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { useVocab } from "../../hooks/useVocab";
import { useThresholds } from "../../hooks/useThresholds";
import {
  Brother,
  BrotherStatus,
  getBrotherStatus,
  avg,
  fmt$,
  fmtDate,
} from "../../data";
import { requestJson } from "../../lib/api";
import "../../components/dashboard/dashboard-ledger.css";
import "../../components/dashboard/brotherhood-ledger.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

// Minimal service-event shape for the Brother-drawer "Log service hours" picker.
type ServiceEventOption = { id: number; title: string; date: string };

// Warm "Chapter Ledger" KPI cell — non-interactive (no per-KPI drawer on this page).
// `note` carries the optional gold "needs attention" subline.
function Measure({ label, prefix, value, unit, note, noteTone }: {
  label: string; prefix?: string; value: string; unit?: string; note: string; noteTone?: "warn" | "ok";
}) {
  return (
    <div className="measure">
      <p className="k">{label}</p>
      <p className="v">{prefix && <small>{prefix}</small>}{value}{unit && <small>{unit}</small>}</p>
      <p className={`note${noteTone ? ` ${noteTone}` : ""}`}>{note}</p>
    </div>
  );
}

// Status pill in the warm pane — mirrors RosterTable's STATUS_TAG so rows match
// the `.dash` palette (the cold <StatusBadge> stays in use inside the drawer).
const STATUS_TAG: Record<BrotherStatus, { cls: string; label: string }> = {
  "Good":    { cls: "st-good",  label: "GOOD" },
  "Watch":   { cls: "st-watch", label: "WATCH" },
  "At Risk": { cls: "st-risk",  label: "AT RISK" },
};

type SortKey = "attendance" | "gpa" | "serviceHours" | "duesOwed" | "name";

// Sortable table header cell (mono caps, violet active arrow).
function SortHead({ label, sortKey, activeKey, dir, onClick, numeric }: {
  label: string; sortKey: SortKey; activeKey: SortKey | null; dir: "asc" | "desc";
  onClick: (k: SortKey) => void; numeric?: boolean;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`sortable${numeric ? " num" : ""}`}
      onClick={() => onClick(sortKey)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}{active && <span className="arrow">{dir === "asc" ? " ↑" : " ↓"}</span>}
    </th>
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
        <FieldLabel tone="dusk">Name</FieldLabel>
        <input required className={inputDuskCls} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
      </div>
      <div>
        <FieldLabel tone="dusk">Role / Committees</FieldLabel>
        <input required className={inputDuskCls} value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. President · Rush" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <FieldLabel tone="dusk">GPA</FieldLabel>
          <input type="number" min="0" max="4" step="0.01" className={inputDuskCls} value={gpa} onChange={e => setGpa(e.target.value)} />
        </div>
        <div>
          <FieldLabel tone="dusk">Dues ($)</FieldLabel>
          <input type="number" min="0" className={inputDuskCls} value={duesOwed} onChange={e => setDuesOwed(e.target.value)} />
        </div>
        <div>
          <FieldLabel tone="dusk">Service (h)</FieldLabel>
          <input type="number" min="0" className={inputDuskCls} value={serviceHours} onChange={e => setServiceHours(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[rgba(236,231,221,0.12)] bg-[#161310] px-4 py-1.5 text-[13px] text-[#c9c2b4] transition-colors hover:border-[rgba(236,231,221,0.22)] hover:text-[#ece7dd]">Cancel</button>
        <button type="submit" className="rounded-lg bg-[#a78bfa] px-4 py-1.5 text-[13px] font-semibold text-[#1a1206] transition-colors hover:bg-[#b9a0fb]">Add Brother</button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrothersPage() {
  const { currentUser, brotherList, setBrotherList, isLoading, avatarRevision, can } = useChapter();
  const v = useVocab();
  const toast = useToast();
  const THRESHOLDS = useThresholds();
  const canBrothers = can("MANAGE_BROTHERS");
  // Distinct from MANAGE_BROTHERS — gates the pending-excuse chip + drawer review.
  const canAttendance = can("MANAGE_ATTENDANCE");
  const customFieldDefs = useMemo(
    () => (currentUser?.org?.customMemberFields ?? []).filter(f => f.showOnRoster).sort((a, b) => a.rosterOrder - b.rosterOrder),
    [currentUser?.org?.customMemberFields],
  );
  const selfId = currentUser?.id ?? null;

  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [search,           setSearch]           = useState("");
  const [statusFilter,     setStatusFilter]     = useState<BrotherStatus | "All">("All");
  const [sortKey,          setSortKey]          = useState<SortKey | null>(null);
  const [sortDir,          setSortDir]          = useState<"asc" | "desc">("asc");
  const [selectedId,       setSelectedId]       = useState<number | null>(null);
  const [showAddModal,     setShowAddModal]     = useState(false);
  // "Record Payment" modal — opened from the Pay button on a roster row or the
  // Brother drawer. Holds the target brother; the amount entered is deducted
  // from their outstanding dues.
  const [payTarget,        setPayTarget]        = useState<Brother | null>(null);
  const [payAmountStr,     setPayAmountStr]     = useState("");
  // Pending-excuse counts keyed by brotherId — drives the roster review chip.
  // Loaded once for MANAGE_ATTENDANCE holders; missing key = 0 (no chip).
  const [pendingCounts,    setPendingCounts]    = useState<Record<number, number>>({});
  const [pageError,        setPageError]        = useState<string | null>(null);
  const [deleteError,      setDeleteError]      = useState<string | null>(null);
  // "Log service hours" modal (opened from the Brother drawer's + control).
  const [logHoursFor,     setLogHoursFor]     = useState<Brother | null>(null);
  const [logHoursEvents,  setLogHoursEvents]  = useState<ServiceEventOption[]>([]);
  const [logHoursEventId, setLogHoursEventId] = useState<number | null>(null);
  const [logHoursStr,     setLogHoursStr]     = useState("");
  const [logHoursBusy,    setLogHoursBusy]    = useState(false);

  function openLogServiceHours(b: Brother) {
    setLogHoursFor(b);
    setLogHoursStr("");
    setLogHoursEventId(null);
    requestJson<ServiceEventOption[]>("/api/service-events")
      .then(events => {
        const sorted = [...events].sort((a, z) => z.date.localeCompare(a.date));
        setLogHoursEvents(sorted);
        setLogHoursEventId(sorted[0]?.id ?? null);
      })
      .catch(() => toast.error("Could not load service events."));
  }

  // Load pending-excuse counts for the review chip (MANAGE_ATTENDANCE only).
  useEffect(() => {
    if (!canAttendance) { setPendingCounts({}); return; }
    requestJson<Record<number, number>>("/api/excuses/pending-counts")
      .then(setPendingCounts)
      .catch(() => {});
  }, [canAttendance]);

  // After a drawer approve/reject, drop the acted-on member's chip (floor 0) and
  // patch attendance on approval (mirrors the Timeline review queue).
  const handleExcuseDecided = useCallback(
    (brotherId: number, _action: "approve" | "reject", attendance: number | null) => {
      setPendingCounts(prev => {
        const next = Math.max(0, (prev[brotherId] ?? 0) - 1);
        return { ...prev, [brotherId]: next };
      });
      if (attendance !== null) {
        setBrotherList(prev => prev.map(b => b.id === brotherId ? { ...b, attendance } : b));
      }
    },
    [setBrotherList],
  );

  async function submitLogServiceHours() {
    if (!logHoursFor || logHoursEventId == null) return;
    const hours = Math.max(0, parseFloat(logHoursStr) || 0);
    const b = logHoursFor;
    setLogHoursBusy(true);
    try {
      await requestJson(`/api/service-events/${logHoursEventId}/participation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ brotherId: b.id, hours }] }),
      });
      // serviceHours is recomputed server-side from participations; pull fresh totals.
      const fresh = await requestJson<Brother[]>("/api/brothers");
      setBrotherList(fresh);
      toast.success("Service hours logged.");
      setLogHoursFor(null);
    } catch {
      toast.error("Could not log service hours.");
    } finally {
      setLogHoursBusy(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!brotherList.length) return null;
    const attRisk  = brotherList.filter(b => getBrotherStatus(b, THRESHOLDS) === "At Risk").length;
    const watching = brotherList.filter(b => getBrotherStatus(b, THRESHOLDS) === "Watch").length;
    const duesTotal = brotherList.reduce((s, b) => s + b.duesOwed, 0);
    const svcMet   = brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length;
    return { avgAtt: avg(brotherList.map(b => b.attendance)), avgGpa: avg(brotherList.map(b => b.gpa)), attRisk, watching, duesTotal, svcMet, total: brotherList.length };
  }, [brotherList, THRESHOLDS]);

  const statusCounts = useMemo(() => {
    const counts = { All: brotherList.length, Good: 0, Watch: 0, "At Risk": 0 };
    brotherList.forEach(b => { counts[getBrotherStatus(b, THRESHOLDS)]++; });
    return counts;
  }, [brotherList, THRESHOLDS]);

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = brotherList.filter(b => {
      const q = search.toLowerCase();
      const matchQ = !q || b.name.toLowerCase().includes(q) || b.role.toLowerCase().includes(q);
      const matchS = statusFilter === "All" || getBrotherStatus(b, THRESHOLDS) === statusFilter;
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
  }, [brotherList, search, statusFilter, sortKey, sortDir, THRESHOLDS]);

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

  // Opens the Record Payment modal pre-filled with the full outstanding balance.
  const payDues = useCallback((b: Brother) => {
    setPayTarget(b);
    setPayAmountStr(b.duesOwed > 0 ? String(b.duesOwed) : "");
  }, []);

  const submitPayment = useCallback(() => {
    if (!payTarget) return;
    const amount = Math.max(0, parseFloat(payAmountStr) || 0);
    if (amount === 0) return;
    const b = payTarget;
    const newOwed = Math.max(0, b.duesOwed - amount);
    setPayTarget(null);
    setPayAmountStr("");
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, duesOwed: newOwed } : x));
    requestJson<Brother>(`/api/brothers/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duesOwed: newOwed }),
    }).catch(() => {
      setBrotherList(prev => prev.map(x => x.id === b.id ? b : x));
      setPageError("Dues update failed. Changes were reverted.");
    });
  }, [payTarget, payAmountStr, setBrotherList]);

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
        getBrotherStatus(b, THRESHOLDS),
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

  // Status filter is driven by BOTH the segmented "Standing" bar and the chips.
  const statusChips: Array<{ label: string; value: BrotherStatus | "All"; count: number }> = [
    { label: "All",     value: "All",     count: statusCounts.All },
    { label: "Good",    value: "Good",    count: statusCounts.Good },
    { label: "Watch",   value: "Watch",   count: statusCounts.Watch },
    { label: "At Risk", value: "At Risk", count: statusCounts["At Risk"] },
  ];
  const segments: Array<{ value: BrotherStatus; cls: string; dotCls: string; label: string; count: number }> = [
    { value: "Good",    cls: "s-good",  dotCls: "bg-sage", label: "Good",    count: statusCounts.Good },
    { value: "Watch",   cls: "s-watch", dotCls: "bg-gold", label: "Watch",   count: statusCounts.Watch },
    { value: "At Risk", cls: "s-risk",  dotCls: "bg-rose", label: "At risk", count: statusCounts["At Risk"] },
  ];
  const toggleStatus = (s: BrotherStatus) => setStatusFilter(statusFilter === s ? "All" : s);

  // Live "needs attention" sentence for the editorial header.
  const duesOwingCount = brotherList.filter(b => b.duesOwed > 0).length;
  const belowAttend    = brotherList.filter(b => b.attendance < THRESHOLDS.attendanceWatch).length;

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Brotherhood" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar (mobile/tablet only — hidden at lg+ where the sidebar is
            static and the Export/New actions live in the editorial header below). ── */}
        <header className="toolbar-frosted dash-toolbar relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[#958d7c] hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="tb-title text-[14px] font-semibold leading-tight text-[#ece7dd]">{v("Member", true)}</p>
            <p className="tb-org hidden text-[11px] leading-tight text-[#958d7c] sm:block">{currentUser?.org?.name ?? "ChaptOS"} · {v("Member")} Roster</p>
          </div>
          {/* Mobile-only quick actions; the desktop Export/New live in the editorial header below. */}
          <div className="tb-actions flex shrink-0 items-center gap-2 lg:hidden">
            <button
              onClick={handleExport}
              title="Export CSV"
              className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(236,231,221,0.12)] bg-white/[0.04] text-[#958d7c] transition-all hover:border-[rgba(236,231,221,0.24)] hover:bg-white/[0.08] hover:text-[#ece7dd]"
            >
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            {canBrothers && (
              <button
                onClick={() => setShowAddModal(true)}
                className="tb-btn flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-white/[0.04] px-3.5 text-[12px] font-semibold text-indigo-200 transition-all hover:border-indigo-400/35 hover:bg-indigo-500/[0.08] hover:text-white"
              >
                <svg className="h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">New</span>
              </button>
            )}
          </div>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          {/* Warm editorial pane, scoped under `.dash` (dashboard-ledger.css +
              brotherhood-ledger.css). Sidebar, toolbar, drawers and modals are
              outside this wrapper and keep their own styling. */}
          <div className="dash" data-dashboard-theme="dusk">

            {/* ── Error bands ── */}
            {pageError && (
              <div className="page-err">
                <p>{pageError}</p>
                <button onClick={() => setPageError(null)}>Dismiss</button>
              </div>
            )}
            {deleteError && (
              <div className="page-err warn">
                <p>{deleteError}</p>
                <button onClick={() => setDeleteError(null)}>Dismiss</button>
              </div>
            )}

            {/* ── Editorial header ── */}
            <div className="pagehead">
              <div>
                <p className="kicker">{currentUser?.org?.name ?? "ChaptOS"} &ensp;·&ensp; {v("Member")} Roster</p>
                <h1>The <em>{v("Member", true)}</em></h1>
                {kpis && (
                  <p className="summary">
                    {kpis.total} {v("Member", true).toLowerCase()} active.{" "}
                    <b>{statusCounts["At Risk"]} at risk</b> and <b>{statusCounts.Watch} on watch</b>
                    {(duesOwingCount > 0 || belowAttend > 0) && <>
                      {" "}— {duesOwingCount > 0 && <>{duesOwingCount} owe {fmt$(kpis.duesTotal)} in {v("Dues").toLowerCase()}</>}
                      {duesOwingCount > 0 && belowAttend > 0 && " and "}
                      {belowAttend > 0 && <>{belowAttend} sit below the {THRESHOLDS.attendanceWatch}% attendance line</>}
                    </>}.
                  </p>
                )}
              </div>
              <div className="head-actions">
                <button className="btn" onClick={handleExport} title="Export CSV">
                  <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Export
                </button>
                {canBrothers && (
                  <button className="btn primary" onClick={() => setShowAddModal(true)}>
                    <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" /></svg>
                    New {v("Member")}
                  </button>
                )}
              </div>
            </div>

            {/* ── Ledger strip ── */}
            {isLoading ? (
              <div className="ledger-skel" style={{ marginTop: 22 }}>{[...Array(5)].map((_, i) => <i key={i} />)}</div>
            ) : kpis && (
              <section className="ledger" style={{ marginTop: 22 }}>
                <Measure
                  label="Attendance" value={kpis.avgAtt.toFixed(1)} unit="%"
                  note={belowAttend > 0 ? `${belowAttend} below ${THRESHOLDS.attendanceWatch}%` : "all on track"}
                  noteTone={belowAttend > 0 ? "warn" : "ok"}
                />
                <Measure
                  label={`${v("Meetings")} GPA`} value={kpis.avgGpa.toFixed(2)}
                  note={`${brotherList.filter(b => b.gpa < THRESHOLDS.gpaWatch).length} below ${THRESHOLDS.gpaWatch.toFixed(1)}`}
                />
                <Measure
                  label={`${v("Dues")} outstanding`} prefix="$" value={kpis.duesTotal.toLocaleString()}
                  note={duesOwingCount > 0 ? `${duesOwingCount} ${v("Member", true).toLowerCase()} owe` : "all paid up"}
                  noteTone={duesOwingCount > 0 ? "warn" : "ok"}
                />
                <Measure
                  label={`${v("Service")} hours`} value={String(brotherList.reduce((s, b) => s + b.serviceHours, 0))} unit="h"
                  note={`${kpis.svcMet} of ${kpis.total} on track`}
                />
                <Measure
                  label="In good standing" value={String(statusCounts.Good)} unit={` / ${kpis.total}`}
                  note={`${Math.round((statusCounts.Good / Math.max(1, kpis.total)) * 100)}% of ${v("Meetings").toLowerCase()}`}
                  noteTone="ok"
                />
              </section>
            )}

            {/* ── Standing — interactive segmented bar ── */}
            {!isLoading && kpis && (
              <section className="dist">
                <div className="dist-head">
                  <h2>Standing</h2>
                  <span className="hint">Click a band to filter</span>
                </div>
                <div className="seg">
                  {segments.filter(s => s.count > 0).map(s => (
                    <button
                      key={s.value}
                      className={`${s.cls}${statusFilter !== "All" && statusFilter !== s.value ? " dim" : ""}`}
                      style={{ flex: s.count }}
                      onClick={() => toggleStatus(s.value)}
                      title={`${s.label} · ${s.count} — click to filter`}
                      aria-label={`Filter ${s.label}`}
                    />
                  ))}
                </div>
                <div className="seg-legend">
                  {segments.map(s => (
                    <button
                      key={s.value}
                      className={statusFilter === s.value ? "active" : undefined}
                      onClick={() => toggleStatus(s.value)}
                    >
                      <span className={`dot ${s.dotCls}`} />
                      <span className="lbl">{s.label}</span>
                      <span className="ct">{s.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── Roster ── */}
            <section className="card roster" style={{ marginTop: 14 }} aria-label="Roster">
              <div className="card-h">
                <h2>Roster <span className="count-chip" style={{ color: "var(--muted)", background: "var(--card-2)" }}>{filtered.length} shown</span></h2>
                <div className="roster-tools">
                  <div className="filters">
                    {statusChips.map(chip => (
                      <button
                        key={chip.value}
                        className={statusFilter === chip.value ? "on" : undefined}
                        onClick={() => setStatusFilter(chip.value)}
                      >
                        {chip.label} {chip.count}
                      </button>
                    ))}
                  </div>
                  <div className="search">
                    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4.3-4.3" /></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or role…" />
                  </div>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>{v("Member")}</th>
                      <SortHead label="Attendance" sortKey="attendance"   activeKey={sortKey} dir={sortDir} onClick={toggleSort} />
                      <SortHead label="GPA"        sortKey="gpa"          activeKey={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                      <SortHead label={v("Service")} sortKey="serviceHours" activeKey={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                      <SortHead label={v("Dues")}  sortKey="duesOwed"     activeKey={sortKey} dir={sortDir} onClick={toggleSort} numeric />
                      <th className="num">Status</th>
                      {customFieldDefs.map(f => (
                        <th key={f.id} className="num">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      [...Array(6)].map((_, i) => (
                        <tr key={i}><td colSpan={6 + customFieldDefs.length} style={{ padding: 0 }}><div className="row-skel" /></td></tr>
                      ))
                    ) : filtered.length === 0 ? (
                      <tr className="empty-row"><td colSpan={6 + customFieldDefs.length}>No {v("Member", true).toLowerCase()} match your filters.</td></tr>
                    ) : (
                      filtered.map(b => {
                        const status = getBrotherStatus(b, THRESHOLDS);
                        const tag = STATUS_TAG[status];
                        const attCls = b.attendance >= THRESHOLDS.attendanceWatch ? "sage" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "gold" : "rose";
                        const attBar = b.attendance >= THRESHOLDS.attendanceWatch ? "bg-sage" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "bg-gold" : "bg-rose";
                        const gpaCls = b.gpa < THRESHOLDS.gpaAtRisk ? "rose" : b.gpa < THRESHOLDS.gpaWatch ? "gold" : "";
                        const svcCls = b.serviceHours < THRESHOLDS.serviceHoursGoal ? "gold" : "muted";
                        return (
                          <tr
                            key={b.id}
                            className={selectedId === b.id ? "sel" : undefined}
                            onClick={() => setSelectedId(selectedId === b.id ? null : b.id)}
                          >
                            <td>
                              <div className="b-name">
                                <BrotherAvatar
                                  brother={b}
                                  selfId={selfId}
                                  selfAvatarUrl={currentUser?.avatarUrl}
                                  avatarRevision={avatarRevision}
                                  size="xs"
                                  ringClassName="bg-[var(--vio-bg)] text-[var(--vio)] text-[10px]"
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div className="nm">
                                    {b.name}
                                    {canAttendance && (pendingCounts[b.id] ?? 0) > 0 && (
                                      <span className="excuse-chip" title={`${pendingCounts[b.id]} pending excuse ${pendingCounts[b.id] === 1 ? "review" : "reviews"}`}>
                                        {pendingCounts[b.id]}
                                      </span>
                                    )}
                                  </div>
                                  <div className="rl">{b.role}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="attb">
                                <span className="track"><i className={attBar} style={{ width: `${clamp(b.attendance, 0, 100)}%` }} /></span>
                                <span className={attCls}>{b.attendance}%</span>
                              </div>
                            </td>
                            <td className="num"><span className={`mono ${gpaCls}`}>{b.gpa.toFixed(2)}</span></td>
                            <td className="num"><span className={`mono ${svcCls}`}>{b.serviceHours}h</span></td>
                            <td className="num">
                              {b.duesOwed > 0 ? (
                                <>
                                  <span className="mono gold">{fmt$(b.duesOwed)}</span>
                                  {canBrothers && (
                                    <button type="button" className="row-act pay-act" onClick={e => { e.stopPropagation(); payDues(b); }}>Pay</button>
                                  )}
                                </>
                              ) : (
                                <span className="mono muted">—</span>
                              )}
                            </td>
                            <td className="num"><span className={`status-tag ${tag.cls}`}>{tag.label}</span></td>
                            {customFieldDefs.map(f => (
                              <td key={f.id} className="num"><span className="mono muted">{b.customFields?.[f.id] != null ? String(b.customFields[f.id]) : "—"}</span></td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {!isLoading && filtered.length > 0 && (
                <div className="table-foot">
                  {filtered.length} of {brotherList.length} {v("Member", true).toLowerCase()} · {statusCounts.Good} good · {statusCounts.Watch} watch · {statusCounts["At Risk"]} at risk &ensp;—&ensp; click a row for profile, {v("Dues").toLowerCase()} &amp; {v("Service").toLowerCase()} log
                </div>
              )}
            </section>

          </div>
        </main>
      </div>

      {/* ── Add Brother Modal ── */}
      {showAddModal && (
        <Modal title={`New ${v("Member")}`} tone="dusk" onClose={() => setShowAddModal(false)}>
          <AddBrotherForm
            onSubmit={handleAddBrother}
            onCancel={() => setShowAddModal(false)}
          />
        </Modal>
      )}

      {/* ── Brother Drawer (already Ledger-styled) ── */}
      <BrotherDrawer
        brotherId={selectedId}
        brotherList={brotherList}
        onClose={() => setSelectedId(null)}
        onSave={updateBrother}
        onPayDues={payDues}
        onLogServiceHours={openLogServiceHours}
        onDelete={deleteBrother}
        isAdmin={canBrothers}
        canManageExcuses={canAttendance}
        onExcuseDecided={handleExcuseDecided}
        selfId={selfId}
      />

      {/* ── Log Service Hours Modal ── */}
      {logHoursFor && (
        <Modal title="Log Service Hours" tone="dusk" onClose={() => !logHoursBusy && setLogHoursFor(null)}>
          <div className="space-y-4">
            <p className="text-[12px] text-[#958d7c]">
              Logging hours for <span className="font-semibold text-[#ece7dd]">{logHoursFor.name}</span> against a service event.
            </p>
            <div>
              <FieldLabel tone="dusk">Service Event</FieldLabel>
              {logHoursEvents.length === 0 ? (
                <p className="mt-1 text-[12px] text-[#6b6354]">No service events yet. Create one on the Service page first.</p>
              ) : (
                <select
                  className={inputDuskCls}
                  value={logHoursEventId ?? ""}
                  onChange={e => setLogHoursEventId(e.target.value ? Number(e.target.value) : null)}
                >
                  {logHoursEvents.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title} · {fmtDate(ev.date)}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <FieldLabel tone="dusk">Hours</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                className={inputDuskCls}
                value={logHoursStr}
                placeholder="0"
                autoFocus
                onChange={e => setLogHoursStr(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && logHoursEventId != null && logHoursStr !== "") submitLogServiceHours(); }}
              />
              <p className="mt-1.5 text-[11px] text-[#6b6354]">
                Sets {logHoursFor.name.split(" ")[0]}&apos;s hours for this event. Their total recomputes from all logged events.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLogHoursFor(null)}
                disabled={logHoursBusy}
                className={btnDuskGhostCls}
              >
                Cancel
              </button>
              <button
                onClick={submitLogServiceHours}
                disabled={logHoursBusy || logHoursEventId == null || logHoursStr === ""}
                className={btnDuskActionCls}
              >
                {logHoursBusy ? "Saving…" : "Log Hours"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Record Payment Modal ── */}
      {payTarget && (
        <Modal title="Record Payment" tone="dusk" onClose={() => setPayTarget(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-[#958d7c] mb-3">
                {payTarget.name} currently owes{" "}
                <span className="font-semibold text-[#ddb36a]">{fmt$(payTarget.duesOwed)}</span>
              </p>
              <FieldLabel tone="dusk">Amount Paid ($)</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputDuskCls}
                value={payAmountStr}
                onChange={e => setPayAmountStr(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") submitPayment(); }}
              />
              {(() => {
                const amt = parseFloat(payAmountStr) || 0;
                if (amt <= 0) return null;
                const newOwed = Math.max(0, payTarget.duesOwed - amt);
                return (
                  <p className="mt-1.5 text-[11px] text-[#958d7c]">
                    New balance:{" "}
                    <span className={newOwed === 0 ? "text-[#a78bfa] font-semibold" : "text-[#c9c2b4]"}>
                      {fmt$(newOwed)}
                    </span>
                  </p>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayTarget(null)} className={btnDuskGhostCls}>
                Cancel
              </button>
              <button
                onClick={submitPayment}
                disabled={!(parseFloat(payAmountStr) > 0)}
                className={btnDuskActionCls}
              >
                Record Payment
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
