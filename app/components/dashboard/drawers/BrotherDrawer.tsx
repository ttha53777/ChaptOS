"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Brother } from "../../../data";
import { fmt$, getBrotherStatus } from "../../../data";
import { BrotherAvatar } from "../../BrotherAvatar";
import { useChapter } from "../../../context/ChapterContext";
import { useThresholds } from "../../../hooks/useThresholds";
import { useVocab } from "../../../hooks/useVocab";
import { StatusBadge, ConfirmDialog } from "../primitives";
import { inputCls } from "../styles";
import { orgFetch } from "../../../lib/api";
import { BrotherRoleChips } from "../../../[slug]/settings/sections/BrotherRoleChips";
import type { CustomFieldValues } from "@/lib/custom-member-fields";
import type { BrotherMetricRow } from "@/lib/services/metric-value-service";

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

type Tab = "profile" | "attendance" | "metrics";

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
  const { currentUser, avatarRevision, can } = useChapter();
  const customFieldDefs = currentUser?.org?.customMemberFields ?? [];
  const THRESHOLDS = useThresholds();
  const v = useVocab();
  const canManageRoles = can("MANAGE_ROLES");
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
  const [customFields, setCustomFields] = useState<CustomFieldValues>({});
  const [dirty,        setDirty]        = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [customFieldError, setCustomFieldError] = useState<string | null>(null);

  // Attendance history
  const [history,      setHistory]      = useState<AttendanceRow[]>([]);
  const [histLoading,  setHistLoading]  = useState(false);
  const [histError,    setHistError]    = useState<string | null>(null);

  // Custom metric values
  const [metrics,        setMetrics]        = useState<BrotherMetricRow[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError,   setMetricsError]   = useState<string | null>(null);
  const [metricEdits,    setMetricEdits]    = useState<Record<number, string>>({});
  const [metricsSaving,  setMetricsSaving]  = useState(false);
  const [metricsDirty,   setMetricsDirty]   = useState(false);
  const metricsLoadedFor = useRef<number | null>(null);

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
    setCustomFields({ ...(brother.customFields ?? {}) });
    setAddHours("");
    setDirty(false);
    setTab("profile");
    setHistory([]);
    setHistError(null);
    setExcusingEventId(null);
    setExcuseReason("");
    setRoleError(null);
    setCustomFieldError(null);
    setMetrics([]);
    setMetricEdits({});
    setMetricsDirty(false);
    setMetricsError(null);
    metricsLoadedFor.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brotherId]);

  // Fetch attendance history when switching to attendance tab
  const fetchHistory = useCallback(async (id: number) => {
    setHistLoading(true);
    setHistError(null);
    try {
      const res = await orgFetch(`/api/brothers/${id}/attendance`);
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

  const fetchMetrics = useCallback(async (id: number, signal: AbortSignal) => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const res = await orgFetch(`/api/brothers/${id}/metrics`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows: BrotherMetricRow[] = await res.json();
      setMetrics(rows);
      metricsLoadedFor.current = id;
      const edits: Record<number, string> = {};
      for (const row of rows) {
        edits[row.definitionId] = row.value !== null ? String(row.value) : "";
      }
      setMetricEdits(edits);
      setMetricsDirty(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMetricsError("Could not load metric values.");
    } finally {
      if (!signal.aborted) setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "metrics" || brotherId === null || metricsLoadedFor.current === brotherId || metricsLoading) return;
    const controller = new AbortController();
    fetchMetrics(brotherId, controller.signal);
    return () => controller.abort();
  }, [tab, brotherId, metricsLoading, fetchMetrics]);

  async function handleMetricsSave() {
    if (!brotherId || metricsSaving) return;
    setMetricsSaving(true);
    try {
      // Only include definitions with non-empty values
      const values: Record<string, number> = {};
      for (const row of metrics) {
        const raw = metricEdits[row.definitionId];
        if (raw === undefined || raw === "") continue;
        const parsed = parseFloat(raw);
        if (!isFinite(parsed) || parsed < 0) continue;
        values[String(row.definitionId)] = parsed;
      }
      const res = await orgFetch(`/api/brothers/${brotherId}/metrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: BrotherMetricRow[] = await res.json();
      setMetrics(updated);
      const edits: Record<number, string> = {};
      for (const row of updated) {
        edits[row.definitionId] = row.value !== null ? String(row.value) : "";
      }
      setMetricEdits(edits);
      setMetricsDirty(false);
    } catch {
      setMetricsError("Failed to save metric values. Please try again.");
    } finally {
      setMetricsSaving(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  function handleSave() {
    if (!brother) return;

    // Validate required custom fields before submitting.
    setCustomFieldError(null);
    for (const def of customFieldDefs) {
      if (def.required) {
        const val = customFields[def.id];
        if (val === null || val === undefined || String(val).trim() === "") {
          setCustomFieldError(`"${def.label}" is required.`);
          return;
        }
      }
    }

    onSave(brother.id, {
      name:         name.trim()  || brother.name,
      role:         role.trim()  || brother.role,
      gpa:          Math.min(4.0, Math.max(0, parseFloat(gpa)      || brother.gpa)),
      duesOwed:     Math.max(0,              parseFloat(duesOwed)   || 0),
      serviceHours: Math.max(0,              parseFloat(serviceHours) || 0),
      attendance:   brother.attendance,
      customFields,
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
      const res = await orgFetch("/api/excuses", {
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

  const orgMetricCount = currentUser?.org?.metricDefinitionCount ?? 0;
  const hasMetrics = orgMetricCount > 0;

  const status   = brother ? getBrotherStatus(brother, THRESHOLDS) : "Good";

  // Warm dusk avatar ring tint, keyed off the member's composite status.
  const statusRingClass: Record<typeof status, string> = {
    "Good":    "",
    "Watch":   "watch",
    "At Risk": "risk",
  };

  // tone = "" (on track) | "gold" (watch) | "rose" (at risk) — drives the
  // profile metric tile color + bar fill via the .dd-tile / .dd-track classes.
  const attTone = brother
    ? brother.attendance < THRESHOLDS.attendanceAtRisk ? "rose"
      : brother.attendance < THRESHOLDS.attendanceWatch ? "gold"
      : ""
    : "";
  const gpaTone = brother
    ? brother.gpa < THRESHOLDS.gpaAtRisk ? "rose"
      : brother.gpa < THRESHOLDS.gpaWatch ? "gold"
      : ""
    : "";

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
          label: v("Dues"), val: brother.duesOwed === 0 ? "Paid" : fmt$(brother.duesOwed),
          ok:   brother.duesOwed === 0,
          warn: false,
          tip:  "Must be $0",
        },
        {
          label: v("Service"), val: `${brother.serviceHours}h`,
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
          title={`Remove ${v("Member")}`}
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
        className={`dash-drawer-backdrop ${isOpen ? "" : "closed"}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div className={`dash-drawer ${isOpen ? "" : "closed"}`}>
        {brother && (
          <>
            {/* Header */}
            <div className="dd-head">
              <BrotherAvatar
                brother={brother}
                selfId={currentUser?.id ?? null}
                selfAvatarUrl={currentUser?.avatarUrl}
                avatarRevision={avatarRevision}
                size="lg"
                ringClassName={`dd-avatar-ring ${statusRingClass[status]}`}
              />
              <div className="min-w-0 flex-1">
                <h2 className="dd-title">{brother.name}</h2>
                <p className="dd-sub" style={{ textTransform: "none", letterSpacing: 0 }}>{brother.role}</p>
              </div>
              <StatusBadge status={status} />
              <button onClick={onClose} className="dd-x" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="dd-tabs">
              {(["profile", "attendance", ...(hasMetrics ? ["metrics" as const] : [])] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`dd-tab ${tab === t ? "on" : ""}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Scrollable body */}
            <div className="dd-body">

              {tab === "profile" && (
                <>
                  {/* Live stat tiles */}
                  <div className="dd-tiles">
                    {/* Attendance */}
                    <div className={`dd-tile ${attTone === "rose" ? "risk" : attTone === "gold" ? "warn" : ""}`}>
                      <p className="l">Attendance</p>
                      <p className={`n ${attTone}`}>{brother.attendance}%</p>
                      <div className="tt"><i className={attTone} style={{ width: `${brother.attendance}%` }} /></div>
                    </div>
                    {/* GPA */}
                    <div className={`dd-tile ${gpaTone === "rose" ? "risk" : gpaTone === "gold" ? "warn" : ""}`}>
                      <p className="l">GPA</p>
                      <p className={`n ${gpaTone}`}>{brother.gpa.toFixed(2)}</p>
                      <div className="tt"><i className={gpaTone} style={{ width: `${Math.min(100, Math.max(5, ((brother.gpa - 2.0) / 2.0) * 100))}%` }} /></div>
                    </div>
                    {/* Dues */}
                    <div className={`dd-tile ${brother.duesOwed > 0 ? "warn" : ""}`}>
                      <p className="l">{v("Dues")} Owed</p>
                      <p className={`n ${brother.duesOwed > 0 ? "gold" : "ok"}`}>
                        {brother.duesOwed > 0 ? fmt$(brother.duesOwed) : "Clear"}
                      </p>
                      {brother.duesOwed > 0 && canManageDues && (
                        <button onClick={handleQuickPayDues} className="dd-tile-act">
                          Mark Paid
                        </button>
                      )}
                    </div>
                    {/* Service */}
                    <div className={`dd-tile ${brother.serviceHours < THRESHOLDS.serviceHoursGoal ? "warn" : ""}`}>
                      <p className="l">Service Hours</p>
                      <p className={`n ${brother.serviceHours < THRESHOLDS.serviceHoursGoal ? "gold" : "ok"}`}>
                        {brother.serviceHours}<small> / {THRESHOLDS.serviceHoursGoal}h</small>
                      </p>
                      <form onSubmit={handleAddHoursSubmit} className="dd-tile-form">
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={addHours}
                          onChange={e => setAddHours(e.target.value)}
                          placeholder="hrs"
                        />
                        <button type="submit">+</button>
                      </form>
                    </div>
                  </div>

                  {/* Status factors */}
                  <div>
                    <p className="dd-label">Status Factors</p>
                    <div className="dd-panel">
                      {statusFactors.map(({ label, val, ok, warn, tip }) => {
                        const tone = ok ? "" : warn ? "watch" : "risk";
                        return (
                          <div key={label} className="dd-factor">
                            <div className={`d ${tone}`} />
                            <span className="k">{label}</span>
                            <span className={`v ${tone}`}>{val}</span>
                            {!ok && <span className="tip">{tip}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom member fields — shown when the org has defined any */}
                  {customFieldDefs.length > 0 && (
                    <div>
                      <p className="dd-label">Member Details</p>
                      {customFieldError && (
                        <p className="dd-err" style={{ marginBottom: 8 }}>{customFieldError}</p>
                      )}
                      <div className="dd-panel">
                        {customFieldDefs.map(def => {
                          const val = customFields[def.id];
                          const displayVal = val !== null && val !== undefined && String(val).trim() !== "" ? String(val) : null;
                          const isRequired = def.required;
                          const isEmpty = displayVal === null;

                          if (!canEditProfile) {
                            return (
                              <div key={def.id} className="dd-kv">
                                <span className="k">{def.label}</span>
                                <span className={`v ${isEmpty ? "empty" : ""}`}>
                                  {displayVal ?? "—"}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div key={def.id} className="dd-kv">
                              <label className="k">
                                {def.label}
                                {isRequired && <span style={{ color: "var(--rose)", marginLeft: 2 }}>*</span>}
                              </label>
                              <input
                                type={def.type === "number" ? "number" : "text"}
                                value={val !== null && val !== undefined ? String(val) : ""}
                                onChange={e => {
                                  const newVal = def.type === "number"
                                    ? (e.target.value === "" ? null : Number(e.target.value))
                                    : e.target.value;
                                  setCustomFields(prev => ({ ...prev, [def.id]: newVal }));
                                  setDirty(true);
                                }}
                                placeholder={def.placeholder ?? `Enter ${def.label.toLowerCase()}…`}
                                maxLength={def.type === "number" ? undefined : 255}
                                style={{ flex: 1, minWidth: 0 }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Roles — visible to anyone who can manage roles */}
                  {canManageRoles && (
                    <div>
                      <p className="dd-label">Roles</p>
                      {roleError && (
                        <p className="dd-err" style={{ marginBottom: 8 }}>{roleError}</p>
                      )}
                      <BrotherRoleChips
                        brotherId={brother.id}
                        initialRoles={brother.roles ?? []}
                        onError={setRoleError}
                      />
                    </div>
                  )}

                  {/* Edit form — only when admin or viewing self */}
                  {canEditProfile && (
                    <div>
                      <p className="dd-label">Edit Profile</p>
                      <div className="space-y-3">
                        <div>
                          <label className="dd-field-label">Name</label>
                          <input className={inputCls} value={name} onChange={e => { setName(e.target.value); setDirty(true); }} />
                        </div>
                        <div>
                          <label className="dd-field-label">Role / Committees</label>
                          <input className={inputCls} value={role} onChange={e => { setRole(e.target.value); setDirty(true); }} placeholder="President · Rush · …" />
                        </div>
                        <div className={`grid grid-cols-1 gap-3 ${canManageDues ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                          <div>
                            <label className="dd-field-label">GPA</label>
                            <input type="number" min="0" max="4" step="0.01" className={inputCls} value={gpa} onChange={e => { setGpa(e.target.value); setDirty(true); }} />
                          </div>
                          {canManageDues && (
                            <div>
                              <label className="dd-field-label">{v("Dues")} ($)</label>
                              <input type="number" min="0" className={inputCls} value={duesOwed} onChange={e => { setDuesOwed(e.target.value); setDirty(true); }} />
                            </div>
                          )}
                          <div>
                            <label className="dd-field-label">Service (h)</label>
                            <input type="number" min="0" className={inputCls} value={serviceHours} onChange={e => { setServiceHours(e.target.value); setDirty(true); }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "metrics" && (
                <div>
                  <p className="dd-label">Custom Metrics</p>

                  {metricsLoading && (
                    <div>
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="dd-skel" />
                      ))}
                    </div>
                  )}

                  {metricsError && (
                    <div className="dd-err">
                      {metricsError}
                      <button onClick={() => { metricsLoadedFor.current = null; setMetricsError(null); }}>Retry</button>
                    </div>
                  )}

                  {!metricsLoading && !metricsError && metrics.length === 0 && (
                    <p className="dd-empty">No metrics defined yet.</p>
                  )}

                  {!metricsLoading && !metricsError && metrics.length > 0 && (
                    <div className="dd-panel">
                      {metrics.map(row => {
                        const tone =
                          row.status === "on_track" ? ""
                          : row.status === "watch"    ? "watch"
                          : row.status === "at_risk"  ? "risk"
                          : "";
                        const valTone =
                          row.status === "on_track" ? ""
                          : row.status === "watch"    ? "watch"
                          : row.status === "at_risk"  ? "risk"
                          : "";

                        if (!canEditProfile) {
                          return (
                            <div key={row.definitionId} className="dd-factor">
                              <div className={`d ${tone}`} />
                              <span className="k">{row.name}{row.unit ? ` (${row.unit})` : ""}</span>
                              <span className={`v ${valTone}`}>
                                {row.value !== null ? row.value : "—"}
                              </span>
                              <span className="tip">Goal {row.goal}{row.unit ? row.unit : ""}</span>
                            </div>
                          );
                        }

                        return (
                          <div key={row.definitionId} className="dd-factor">
                            <div className={`d ${tone}`} />
                            <label className="k">{row.name}{row.unit ? ` (${row.unit})` : ""}</label>
                            <input
                              type="number"
                              min="0"
                              max="1000000"
                              step="any"
                              value={metricEdits[row.definitionId] ?? ""}
                              onChange={e => {
                                setMetricEdits(prev => ({ ...prev, [row.definitionId]: e.target.value }));
                                setMetricsDirty(true);
                              }}
                              placeholder="—"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <span className="tip">/{row.goal}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {tab === "attendance" && (
                <div>
                  <p className="dd-label">Mandatory Event History — Active {v("Period")}</p>

                  {histLoading && (
                    <div>
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="dd-skel" />
                      ))}
                    </div>
                  )}

                  {histError && (
                    <div className="dd-err">
                      {histError}
                      <button onClick={() => brotherId !== null && fetchHistory(brotherId)}>Retry</button>
                    </div>
                  )}

                  {!histLoading && !histError && history.length === 0 && (
                    <p className="dd-empty">No mandatory events recorded yet.</p>
                  )}

                  {!histLoading && !histError && history.length > 0 && (
                    <div className="dd-feed">
                      {history.map(row => {
                        const isExcusing = excusingEventId === row.calendarEventId;
                        const pendingExcuse  = row.excuseStatus === "pending";
                        const rejectedExcuse = row.excuseStatus === "rejected";
                        const dotTone = row.excused
                          ? "gold"
                          : pendingExcuse
                            ? "gold"
                            : rejectedExcuse
                              ? "risk"
                              : row.attended === true
                                ? "ok"
                                : row.attended === false
                                  ? "risk"
                                  : "none";
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
                          <div key={row.calendarEventId} className="dd-att">
                            <div className="top">
                              <div className={`d ${dotTone}`} />
                              <div className="body">
                                <p className="t">{row.title}</p>
                                <p className="m">{fmtDate(row.date)} · {label}</p>
                                {rejectedExcuse && row.excuseRejection && (
                                  <p className="rej">Reason: {row.excuseRejection}</p>
                                )}
                              </div>
                              {canSubmitExcuse && (
                                <button
                                  onClick={() => { setExcusingEventId(isExcusing ? null : row.calendarEventId); setExcuseReason(""); }}
                                  className="excuse"
                                >
                                  {isExcusing ? "Cancel" : rejectedExcuse ? "Re-submit" : "Excuse"}
                                </button>
                              )}
                            </div>
                            {isExcusing && (
                              <form onSubmit={handleExcuseSubmit} className="dd-tile-form" style={{ marginTop: 10 }}>
                                <input
                                  autoFocus
                                  value={excuseReason}
                                  onChange={e => setExcuseReason(e.target.value)}
                                  placeholder="Reason for absence…"
                                  required
                                  style={{ flex: 1 }}
                                />
                                <button
                                  type="submit"
                                  disabled={excuseSaving || !excuseReason.trim()}
                                  className="dd-btn-primary"
                                  style={{ width: "auto", padding: "6px 14px", fontSize: 11 }}
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
            <div className="dd-foot">
              {tab === "profile" && canEditProfile && (
                <button onClick={handleSave} disabled={!dirty} className="dd-btn-primary">
                  Save Changes
                </button>
              )}
              {tab === "metrics" && canEditProfile && (
                <button onClick={handleMetricsSave} disabled={!metricsDirty || metricsSaving} className="dd-btn-primary">
                  {metricsSaving ? "Saving…" : "Save Metrics"}
                </button>
              )}
              {onDelete && canDelete && (
                <button onClick={() => setConfirmDelete(true)} className="dd-btn-danger">
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
