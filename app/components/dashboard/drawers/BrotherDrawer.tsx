"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { Brother } from "../../../data";
import { THRESHOLDS, fmt$, getBrotherStatus } from "../../../data";
import { ProfileAvatar } from "../../ProfileAvatar";
import { useChapter } from "../../../context/ChapterContext";
import { FieldLabel, StatusBadge, ConfirmDialog } from "../primitives";
import { inputCls } from "../styles";

type AttendanceRow = {
  calendarEventId: number;
  title: string;
  date: string;
  attended: boolean | null;
  excused: boolean;
  excuseReason: string | null;
  excuseStatus: "pending" | "approved" | "rejected" | null;
  excuseRejection: string | null;
};

type Tab = "profile" | "attendance";

export function BrotherDrawer({
  brotherId,
  brotherList,
  onClose,
  onSave,
  onPayDues,
  onAddServiceHours,
  onDelete,
  isAdmin = true,
  selfId = null,
}: {
  brotherId: number | null;
  brotherList: Brother[];
  onClose: () => void;
  onSave: (id: number, updates: Omit<Brother, "id">) => void;
  onPayDues: (b: Brother) => void;
  onAddServiceHours: (b: Brother, hours: number) => void;
  onDelete?: (b: Brother) => void;
  /** When false, restrict to "view + self-edit" mode. Defaults true for back-compat. */
  isAdmin?: boolean;
  /** Brother id of the current viewer; used to allow self-edits when not admin. */
  selfId?: number | null;
}) {
  const { currentUser, avatarRevision } = useChapter();
  const isSelf = brotherId !== null && selfId === brotherId;
  const canEditProfile = isAdmin || isSelf;        // name, role, gpa, serviceHours
  const canManageDues  = isAdmin;                  // duesOwed field + "Mark Paid"
  const canDelete      = isAdmin;
  const isOpen = brotherId !== null;
  const brother = brotherId !== null ? brotherList.find(b => b.id === brotherId) ?? null : null;

  const [tab,          setTab]          = useState<Tab>("profile");
  const [name,         setName]         = useState("");
  const [role,         setRole]         = useState("");
  const [gpa,          setGpa]          = useState("");
  const [duesOwed,     setDuesOwed]     = useState("");
  const [serviceHours, setServiceHours] = useState("");
  const [addHours,     setAddHours]     = useState("");
  const [dirty,        setDirty]        = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Attendance history
  const [history,      setHistory]      = useState<AttendanceRow[]>([]);
  const [histLoading,  setHistLoading]  = useState(false);
  const [histError,    setHistError]    = useState<string | null>(null);

  // Excuse form state: calendarEventId being excused
  const [excusingEventId, setExcusingEventId] = useState<number | null>(null);
  const [excuseReason,    setExcuseReason]    = useState("");
  const [excuseSaving,    setExcuseSaving]    = useState(false);

  // Sync form fields when a different brother is selected
  useEffect(() => {
    if (!brother) return;
    setName(brother.name);
    setRole(brother.role);
    setGpa(String(brother.gpa));
    setDuesOwed(String(brother.duesOwed));
    setServiceHours(String(brother.serviceHours));
    setAddHours("");
    setDirty(false);
    setTab("profile");
    setHistory([]);
    setHistError(null);
    setExcusingEventId(null);
    setExcuseReason("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brotherId]);

  // Fetch attendance history when switching to attendance tab
  const fetchHistory = useCallback(async (id: number) => {
    setHistLoading(true);
    setHistError(null);
    try {
      const res = await fetch(`/api/brothers/${id}/attendance`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHistory(await res.json());
    } catch {
      setHistError("Could not load attendance history.");
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "attendance" && brotherId !== null && history.length === 0 && !histLoading) {
      fetchHistory(brotherId);
    }
  }, [tab, brotherId, history.length, histLoading, fetchHistory]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  function handleSave() {
    if (!brother) return;
    onSave(brother.id, {
      name:         name.trim()  || brother.name,
      role:         role.trim()  || brother.role,
      gpa:          Math.min(4.0, Math.max(0, parseFloat(gpa)      || brother.gpa)),
      duesOwed:     Math.max(0,              parseFloat(duesOwed)   || 0),
      serviceHours: Math.max(0,              parseFloat(serviceHours) || 0),
      attendance:   brother.attendance,
    });
    setDirty(false);
    onClose();
  }

  function handleQuickPayDues() {
    if (!brother) return;
    onPayDues(brother);
  }

  function handleAddHoursSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brother) return;
    const hrs = parseFloat(addHours);
    if (!hrs || hrs <= 0) return;
    onAddServiceHours(brother, hrs);
    setServiceHours(String(Math.max(0, parseFloat(serviceHours) || 0) + hrs));
    setAddHours("");
  }

  async function handleExcuseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brother || excusingEventId === null || !excuseReason.trim()) return;
    setExcuseSaving(true);
    try {
      const res = await fetch("/api/excuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarEventId: excusingEventId, brotherId: brother.id, reason: excuseReason.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Server tells us whether the excuse was auto-approved (admin caller) or queued (member caller).
      const payload = await res.json().catch(() => null) as { excuseStatus?: "pending" | "approved" | "rejected" } | null;
      const newStatus = payload?.excuseStatus ?? "approved";
      setHistory(prev => prev.map(row =>
        row.calendarEventId === excusingEventId
          ? {
              ...row,
              excused:         newStatus === "approved",
              excuseReason:    excuseReason.trim(),
              excuseStatus:    newStatus,
              excuseRejection: null,
            }
          : row
      ));
      setExcusingEventId(null);
      setExcuseReason("");
    } catch {
      // keep form open so user can retry
    } finally {
      setExcuseSaving(false);
    }
  }

  const status   = brother ? getBrotherStatus(brother) : "Good";
  const initials = brother
    ? brother.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : "";

  const statusRing: Record<typeof status, string> = {
    "Good":    "ring-emerald-500/40 bg-emerald-500/15 text-emerald-400",
    "Watch":   "ring-amber-500/40  bg-amber-500/15   text-amber-400",
    "At Risk": "ring-red-500/40    bg-red-500/15     text-red-400",
  };

  const attColor = brother
    ? brother.attendance < THRESHOLDS.attendanceAtRisk ? "text-red-400"
      : brother.attendance < THRESHOLDS.attendanceWatch ? "text-amber-400"
      : "text-white"
    : "text-white";
  const attBar = brother
    ? brother.attendance < THRESHOLDS.attendanceAtRisk ? "bg-red-400"
      : brother.attendance < THRESHOLDS.attendanceWatch ? "bg-amber-400"
      : "bg-blue-400"
    : "bg-blue-400";
  const gpaColor = brother
    ? brother.gpa < THRESHOLDS.gpaAtRisk ? "text-red-400"
      : brother.gpa < THRESHOLDS.gpaWatch ? "text-amber-400"
      : "text-white"
    : "text-white";
  const gpaBar = brother
    ? brother.gpa < THRESHOLDS.gpaAtRisk ? "bg-red-400"
      : brother.gpa < THRESHOLDS.gpaWatch ? "bg-amber-400"
      : "bg-violet-400"
    : "bg-violet-400";

  const statusFactors = brother
    ? [
        {
          label: "Attendance", val: `${brother.attendance}%`,
          ok:   brother.attendance >= THRESHOLDS.attendanceWatch,
          warn: brother.attendance >= THRESHOLDS.attendanceAtRisk && brother.attendance < THRESHOLDS.attendanceWatch,
          tip:  `Goal ≥ ${THRESHOLDS.attendanceWatch}%`,
        },
        {
          label: "GPA", val: brother.gpa.toFixed(2),
          ok:   brother.gpa >= THRESHOLDS.gpaWatch,
          warn: brother.gpa >= THRESHOLDS.gpaAtRisk && brother.gpa < THRESHOLDS.gpaWatch,
          tip:  `Goal ≥ ${THRESHOLDS.gpaWatch}`,
        },
        {
          label: "Dues", val: brother.duesOwed === 0 ? "Paid" : fmt$(brother.duesOwed),
          ok:   brother.duesOwed === 0,
          warn: false,
          tip:  "Must be $0",
        },
        {
          label: "Service", val: `${brother.serviceHours}h`,
          ok:   brother.serviceHours >= THRESHOLDS.serviceHoursGoal,
          warn: false,
          tip:  `Goal ${THRESHOLDS.serviceHoursGoal}h`,
        },
      ]
    : [];

  function fmtDate(d: string) {
    const [, mm, dd] = d.split("-");
    return `${mm}/${dd}`;
  }

  return (
    <>
      {confirmDelete && brother && (
        <ConfirmDialog
          title="Remove Brother"
          confirmLabel="Remove"
          message={
            <>Remove <span className="font-semibold text-white">{brother.name}</span> from the roster? This cannot be undone.</>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDelete?.(brother); }}
        />
      )}

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#0c0e14] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[420px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        {brother && (
          <>
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
              {isSelf ? (
                <ProfileAvatar
                  name={currentUser?.name ?? brother.name}
                  avatarUrl={currentUser?.avatarUrl}
                  revision={avatarRevision}
                  size="lg"
                  ringClassName={`ring-2 ${statusRing[status]}`}
                />
              ) : (
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ${statusRing[status]}`}>
                  <span className="text-[12px] font-bold">{initials}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-semibold text-white">{brother.name}</h2>
                <p className="truncate text-[10px] text-slate-500">{brother.role}</p>
              </div>
              <StatusBadge status={status} />
              <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white transition-colors">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 border-b border-white/[0.07]">
              {(["profile", "attendance"] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-2.5 text-[12px] font-medium capitalize transition-colors relative ${tab === t ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {t}
                  {tab === t && <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-indigo-400" />}
                </button>
              ))}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

              {tab === "profile" && (
                <>
                  {/* Live stat tiles */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Attendance */}
                    <div className={`rounded-lg px-3 py-2.5 border ${brother.attendance < THRESHOLDS.attendanceAtRisk ? "bg-red-500/10 border-red-500/20" : brother.attendance < THRESHOLDS.attendanceWatch ? "bg-amber-500/10 border-amber-500/20" : "bg-white/[0.04] border-white/[0.06]"}`}>
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Attendance</p>
                      <p className={`text-[20px] font-bold tabular-nums leading-none ${attColor}`}>{brother.attendance}%</p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className={`h-full rounded-full ${attBar}`} style={{ width: `${brother.attendance}%` }} />
                      </div>
                    </div>
                    {/* GPA */}
                    <div className={`rounded-lg px-3 py-2.5 border ${brother.gpa < THRESHOLDS.gpaAtRisk ? "bg-red-500/10 border-red-500/20" : brother.gpa < THRESHOLDS.gpaWatch ? "bg-amber-500/10 border-amber-500/20" : "bg-white/[0.04] border-white/[0.06]"}`}>
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">GPA</p>
                      <p className={`text-[20px] font-bold tabular-nums leading-none ${gpaColor}`}>{brother.gpa.toFixed(2)}</p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className={`h-full rounded-full ${gpaBar}`} style={{ width: `${Math.min(100, Math.max(5, ((brother.gpa - 2.0) / 2.0) * 100))}%` }} />
                      </div>
                    </div>
                    {/* Dues */}
                    <div className={`rounded-lg px-3 py-2.5 border ${brother.duesOwed > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-white/[0.04] border-white/[0.06]"}`}>
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Dues Owed</p>
                      <p className={`text-[20px] font-bold tabular-nums leading-none ${brother.duesOwed > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {brother.duesOwed > 0 ? fmt$(brother.duesOwed) : "Clear"}
                      </p>
                      {brother.duesOwed > 0 && canManageDues && (
                        <button onClick={handleQuickPayDues} className="mt-1.5 w-full rounded-md bg-emerald-500/15 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 hover:bg-emerald-500/25 transition-colors">
                          Mark Paid
                        </button>
                      )}
                    </div>
                    {/* Service */}
                    <div className={`rounded-lg px-3 py-2.5 border ${brother.serviceHours < THRESHOLDS.serviceHoursGoal ? "bg-amber-500/10 border-amber-500/20" : "bg-white/[0.04] border-white/[0.06]"}`}>
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Service Hours</p>
                      <p className={`leading-none ${brother.serviceHours < THRESHOLDS.serviceHoursGoal ? "text-amber-400" : "text-emerald-400"}`}>
                        <span className="text-[20px] font-bold tabular-nums">{brother.serviceHours}</span>
                        <span className="text-[12px] font-medium text-slate-500"> / {THRESHOLDS.serviceHoursGoal}h</span>
                      </p>
                      <form onSubmit={handleAddHoursSubmit} className="mt-1.5 flex gap-1">
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={addHours}
                          onChange={e => setAddHours(e.target.value)}
                          placeholder="hrs"
                          className="w-full rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-300 placeholder:text-slate-600 ring-1 ring-inset ring-white/[0.1] focus:outline-none focus:ring-indigo-500/40"
                        />
                        <button type="submit" className="shrink-0 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-inset ring-white/[0.1] hover:bg-indigo-500/15 hover:text-indigo-400 hover:ring-indigo-500/25 transition-colors">
                          +
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Status factors */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status Factors</p>
                    <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                      {statusFactors.map(({ label, val, ok, warn, tip }) => (
                        <div key={label} className="flex items-center gap-3">
                          <div className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-400" : warn ? "bg-amber-400" : "bg-red-400"}`} />
                          <span className="w-24 shrink-0 text-[12px] font-medium text-slate-400">{label}</span>
                          <span className={`tabular-nums text-[12px] font-semibold ${ok ? "text-white" : warn ? "text-amber-400" : "text-red-400"}`}>{val}</span>
                          {!ok && <span className="ml-auto shrink-0 text-[10px] text-slate-600">{tip}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Edit form — only when admin or viewing self */}
                  {canEditProfile && (
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Edit Profile</p>
                      <div className="space-y-3">
                        <div>
                          <FieldLabel>Name</FieldLabel>
                          <input className={inputCls} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} />
                        </div>
                        <div>
                          <FieldLabel>Role / Committees</FieldLabel>
                          <input className={inputCls} value={role} onChange={e => { setRole(e.target.value); setDirty(true); }} placeholder="President · Rush · …" />
                        </div>
                        <div className={`grid grid-cols-1 gap-3 ${canManageDues ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                          <div>
                            <FieldLabel>GPA</FieldLabel>
                            <input type="number" min="0" max="4" step="0.01" className={inputCls} value={gpa} onChange={e => { setGpa(e.target.value); setDirty(true); }} />
                          </div>
                          {canManageDues && (
                            <div>
                              <FieldLabel>Dues ($)</FieldLabel>
                              <input type="number" min="0" className={inputCls} value={duesOwed} onChange={e => { setDuesOwed(e.target.value); setDirty(true); }} />
                            </div>
                          )}
                          <div>
                            <FieldLabel>Service (h)</FieldLabel>
                            <input type="number" min="0" className={inputCls} value={serviceHours} onChange={e => { setServiceHours(e.target.value); setDirty(true); }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "attendance" && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Mandatory Event History — Active Semester
                  </p>

                  {histLoading && (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
                      ))}
                    </div>
                  )}

                  {histError && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-400">
                      {histError}
                      <button onClick={() => brotherId !== null && fetchHistory(brotherId)} className="ml-2 underline">Retry</button>
                    </div>
                  )}

                  {!histLoading && !histError && history.length === 0 && (
                    <p className="text-[12px] text-slate-600">No mandatory events recorded yet.</p>
                  )}

                  {!histLoading && !histError && history.length > 0 && (
                    <div className="space-y-1.5">
                      {history.map(row => {
                        const isExcusing = excusingEventId === row.calendarEventId;
                        const pendingExcuse  = row.excuseStatus === "pending";
                        const rejectedExcuse = row.excuseStatus === "rejected";
                        const dot = row.excused
                          ? "bg-amber-400"
                          : pendingExcuse
                            ? "bg-amber-400/40"
                            : rejectedExcuse
                              ? "bg-red-400/60"
                              : row.attended === true
                                ? "bg-emerald-400"
                                : row.attended === false
                                  ? "bg-red-400"
                                  : "bg-slate-700";
                        const label = row.excused
                          ? "Excused"
                          : pendingExcuse
                            ? "Excuse pending"
                            : rejectedExcuse
                              ? "Excuse rejected"
                              : row.attended === true ? "Attended" : row.attended === false ? "Absent" : "No record";
                        // Allow re-submission only if there is no excuse yet, or the existing one was rejected.
                        const canSubmitExcuse = row.attended === false && !row.excused && !pendingExcuse && onDelete;

                        return (
                          <div key={row.calendarEventId} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-medium text-slate-200">{row.title}</p>
                                <p className="text-[10px] text-slate-600">{fmtDate(row.date)} · {label}</p>
                                {rejectedExcuse && row.excuseRejection && (
                                  <p className="mt-1 text-[10px] italic text-red-300/80">Reason: {row.excuseRejection}</p>
                                )}
                              </div>
                              {canSubmitExcuse && (
                                <button
                                  onClick={() => { setExcusingEventId(isExcusing ? null : row.calendarEventId); setExcuseReason(""); }}
                                  className="shrink-0 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 transition-colors"
                                >
                                  {isExcusing ? "Cancel" : rejectedExcuse ? "Re-submit" : "Excuse"}
                                </button>
                              )}
                            </div>
                            {isExcusing && (
                              <form onSubmit={handleExcuseSubmit} className="mt-2 flex gap-2">
                                <input
                                  autoFocus
                                  value={excuseReason}
                                  onChange={e => setExcuseReason(e.target.value)}
                                  placeholder="Reason for absence…"
                                  required
                                  className="flex-1 rounded-md border border-white/[0.08] bg-[#0a0d14] px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none"
                                />
                                <button
                                  type="submit"
                                  disabled={excuseSaving || !excuseReason.trim()}
                                  className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                                >
                                  {excuseSaving ? "…" : "Save"}
                                </button>
                              </form>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-white/[0.07] px-5 py-4 space-y-2">
              {tab === "profile" && canEditProfile && (
                <button
                  onClick={handleSave}
                  disabled={!dirty}
                  className={`w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all ${dirty ? "bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer" : "bg-white/[0.04] text-slate-600 cursor-not-allowed"}`}
                >
                  Save Changes
                </button>
              )}
              {onDelete && canDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-[12px] font-medium text-red-400 hover:bg-red-500/15 transition-colors"
                >
                  Remove from Roster
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
