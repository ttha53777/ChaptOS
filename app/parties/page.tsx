"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Sidebar } from "../components/Sidebar";
import { UserAvatar } from "../components/UserAvatar";
import { Card, Modal, FieldLabel, ConfirmDialog } from "../components/dashboard/primitives";
import { inputCls } from "../components/dashboard/styles";
import { useChapter } from "../context/ChapterContext";
import { PartyEvent, fmt$, fmtDate } from "../data";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try { const b = await res.json(); detail = typeof b?.error === "string" ? `: ${b.error}` : ""; } catch { /* ignore */ }
    throw new Error(`${url} returned ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function profit(p: PartyEvent) { return p.doorRevenue - p.expenses; }
function needsWrapUp(p: PartyEvent) { return !p.completed && p.date < todayStr(); }

// ─── types ────────────────────────────────────────────────────────────────────

type TimeTab   = "All" | "Upcoming" | "Past";
type TypeFilter = "All" | "Open" | "Closed";
type SortKey   = "date" | "doorRevenue" | "expenses" | "profit" | "attendance";
type SortDir   = "asc" | "desc";
type ModalKind = "add" | "edit" | "wrap-up";

const ADD_FORM_EMPTY = {
  name: "", date: todayStr(), partyType: "Open" as "Open" | "Closed",
  theme: "", collabOrg: "",
};

const WRAP_FORM_EMPTY = {
  doorRevenue: "", expenses: "", attendance: "", notes: "",
};

// ─── sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="card-premium rounded-xl border border-white/[0.06] bg-[#10121a] px-4 py-3.5 flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">{label}</p>
      <p className={`text-[22px] font-bold leading-none tracking-tight tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function PartyTypeBadge({ type }: { type: "Open" | "Closed" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${
      type === "Open"
        ? "bg-indigo-500/15 text-indigo-400 ring-1 ring-inset ring-indigo-500/25"
        : "bg-slate-500/15 text-slate-400 ring-1 ring-inset ring-slate-500/20"
    }`}>{type}</span>
  );
}

function WrapUpBadge() {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/25">
      Needs wrap-up
    </span>
  );
}

// ─── Add party form (minimal) ─────────────────────────────────────────────────

function AddPartyForm({ onSubmit, onClose }: {
  onSubmit: (data: typeof ADD_FORM_EMPTY) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(ADD_FORM_EMPTY);
  const set = (k: keyof typeof ADD_FORM_EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-3">
      <div>
        <FieldLabel>Party name *</FieldLabel>
        <input className={inputCls} required value={form.name} onChange={set("name")} placeholder="Spring Rush Social" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date *</FieldLabel>
          <input type="date" className={inputCls} required value={form.date} onChange={set("date")} />
        </div>
        <div>
          <FieldLabel>Party type</FieldLabel>
          <select className={inputCls} value={form.partyType} onChange={e => setForm(f => ({ ...f, partyType: e.target.value as "Open" | "Closed" }))}>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div>
          <FieldLabel>Theme</FieldLabel>
          <input className={inputCls} value={form.theme} onChange={set("theme")} placeholder="All White, Black & Gold…" />
        </div>
        <div>
          <FieldLabel>Collab org</FieldLabel>
          <input className={inputCls} value={form.collabOrg} onChange={set("collabOrg")} placeholder="KDF, DSP…" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-slate-300 hover:bg-white/[0.07] transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
          Add Party
        </button>
      </div>
    </form>
  );
}

// ─── Edit party form ──────────────────────────────────────────────────────────

function EditPartyForm({ party, onSubmit, onClose }: {
  party: PartyEvent;
  onSubmit: (data: Partial<PartyEvent>) => void;
  onClose: () => void;
}) {
  const [name,      setName]      = useState(party.name);
  const [date,      setDate]      = useState(party.date);
  const [partyType, setPartyType] = useState<"Open" | "Closed">(party.partyType);
  const [theme,     setTheme]     = useState(party.theme);
  const [collabOrg, setCollabOrg] = useState(party.collabOrg);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ name, date, partyType, theme, collabOrg }); }} className="space-y-3">
      <div>
        <FieldLabel>Party name *</FieldLabel>
        <input className={inputCls} required value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date *</FieldLabel>
          <input type="date" className={inputCls} required value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Party type</FieldLabel>
          <select className={inputCls} value={partyType} onChange={e => setPartyType(e.target.value as "Open" | "Closed")}>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div>
          <FieldLabel>Theme</FieldLabel>
          <input className={inputCls} value={theme} onChange={e => setTheme(e.target.value)} placeholder="All White…" />
        </div>
        <div>
          <FieldLabel>Collab org</FieldLabel>
          <input className={inputCls} value={collabOrg} onChange={e => setCollabOrg(e.target.value)} placeholder="KDF, DSP…" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-slate-300 hover:bg-white/[0.07] transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
          Save Changes
        </button>
      </div>
    </form>
  );
}

// ─── Wrap-up form ─────────────────────────────────────────────────────────────

function WrapUpForm({ party, onSubmit, onClose }: {
  party: PartyEvent;
  onSubmit: (data: typeof WRAP_FORM_EMPTY) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(WRAP_FORM_EMPTY);
  const set = (k: keyof typeof WRAP_FORM_EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const profitPreview = (Number(form.doorRevenue) || 0) - (Number(form.expenses) || 0);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-3">
      <div className="rounded-lg bg-white/[0.04] px-4 py-3 mb-1">
        <p className="text-[13px] font-semibold text-white">{party.name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(party.date)} · {party.partyType}{party.theme ? ` · ${party.theme}` : ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Door Revenue ($) *</FieldLabel>
          <input type="number" min="0" step="0.01" className={inputCls} required value={form.doorRevenue} onChange={set("doorRevenue")} placeholder="0.00" />
        </div>
        <div>
          <FieldLabel>Expenses ($) *</FieldLabel>
          <input type="number" min="0" step="0.01" className={inputCls} required value={form.expenses} onChange={set("expenses")} placeholder="0.00" />
        </div>
        <div>
          <FieldLabel>Attendance *</FieldLabel>
          <input type="number" min="0" className={inputCls} required value={form.attendance} onChange={set("attendance")} placeholder="0" />
        </div>
        <div className="flex items-end">
          <div className="rounded-lg bg-white/[0.04] px-3 py-2 w-full text-center">
            <p className="text-[10px] text-slate-500 mb-0.5">Profit preview</p>
            <p className={`text-[16px] font-bold tabular-nums ${profitPreview >= 0 ? "text-indigo-300" : "text-amber-300"}`}>
              {fmt$(profitPreview)}
            </p>
          </div>
        </div>
      </div>
      <div>
        <FieldLabel>Post-event notes</FieldLabel>
        <textarea className={`${inputCls} resize-none`} rows={2} value={form.notes} onChange={set("notes")} placeholder="How did it go?" />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-slate-300 hover:bg-white/[0.07] transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500 transition-colors">
          Mark Completed
        </button>
      </div>
    </form>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ party, onEdit, onWrapUp, onDelete }: {
  party: PartyEvent;
  onEdit:   () => void;
  onWrapUp: () => void;
  onDelete: () => void;
}) {
  const p = profit(party);
  const margin = party.doorRevenue > 0 ? Math.round((p / party.doorRevenue) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <div className="h-[2px]" style={{
        background: party.completed
          ? (p >= 0
            ? "linear-gradient(90deg,transparent,rgba(99,102,241,0.9) 30%,rgba(129,140,248,0.95) 70%,transparent)"
            : "linear-gradient(90deg,transparent,rgba(251,191,36,0.75) 30%,rgba(252,211,77,0.9) 70%,transparent)")
          : "linear-gradient(90deg,transparent,rgba(99,102,241,0.55) 30%,rgba(129,140,248,0.65) 70%,transparent)",
      }} />

      <div className="px-5 py-4 border-b border-white/[0.07] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-white leading-snug">{party.name}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(party.date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <PartyTypeBadge type={party.partyType} />
          {needsWrapUp(party) && <WrapUpBadge />}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* financials — only if completed */}
        {party.completed ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Revenue",  value: fmt$(party.doorRevenue), color: "#818cf8" },
                { label: "Expenses", value: fmt$(party.expenses),    color: "#fbbf24" },
                { label: "Profit",   value: fmt$(p),                 color: p >= 0 ? "#c7d2fe" : "#fcd34d" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className="text-[14px] font-bold tabular-nums" style={{ color }}>{value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-500">Profit margin</span>
                <span className={`text-[10px] tabular-nums ${p >= 0 ? "text-indigo-300" : "text-amber-300"}`}>{margin}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full transition-all duration-500"
                     style={{
                       width: `${Math.min(100, Math.max(0, margin))}%`,
                       background: p >= 0
                         ? "linear-gradient(90deg,#4f46e5,#818cf8)"
                         : "linear-gradient(90deg,#b45309,#fbbf24)",
                     }} />
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-indigo-500/[0.07] border border-indigo-500/20 px-4 py-3 text-center">
            <p className="text-[12px] text-indigo-300">Financial data will appear after wrap-up</p>
          </div>
        )}

        {/* meta */}
        <div className="space-y-2">
          {party.completed && party.attendance > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Attendance</span>
              <span className="text-[12px] font-medium text-white tabular-nums">{party.attendance}</span>
            </div>
          )}
          {party.completed && party.attendance > 0 && party.doorRevenue > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Revenue / head</span>
              <span className="text-[12px] font-medium text-slate-300 tabular-nums">{fmt$(Math.round(party.doorRevenue / party.attendance))}</span>
            </div>
          )}
          {party.completed && party.attendance > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Profit / head</span>
              <span className={`text-[12px] font-medium tabular-nums ${p >= 0 ? "text-indigo-300" : "text-amber-300"}`}>{fmt$(Math.round(p / party.attendance))}</span>
            </div>
          )}
          {party.theme && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Theme</span>
              <span className="text-[12px] text-slate-300">{party.theme}</span>
            </div>
          )}
          {party.collabOrg && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Collab</span>
              <span className="text-[12px] font-medium text-indigo-400">{party.collabOrg}</span>
            </div>
          )}
          {party.completedAt && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Completed</span>
              <span className="text-[11px] text-slate-400">{fmtDate(party.completedAt.slice(0, 10))}</span>
            </div>
          )}
        </div>

        {party.notes && (
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Notes</p>
            <p className="text-[12px] leading-relaxed text-slate-300">{party.notes}</p>
          </div>
        )}

        {/* actions */}
        <div className="flex gap-2 pt-1">
          {!party.completed && (
            <button onClick={onWrapUp}
              className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors">
              Mark completed
            </button>
          )}
          <button onClick={onEdit}
            className="flex-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[12px] font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-colors">
            Edit
          </button>
          <button onClick={onDelete}
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PartiesPage() {
  const { partyList, setPartyList } = useChapter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedId,  setSelectedId]  = useState<number | null>(null);
  const [modal,       setModal]       = useState<ModalKind | null>(null);
  const [editingId,   setEditingId]   = useState<number | null>(null);
  const [wrapUpId,    setWrapUpId]    = useState<number | null>(null);
  const [timeTab,        setTimeTab]        = useState<TimeTab>("All");
  const [typeFilter,     setTypeFilter]     = useState<TypeFilter>("All");
  const [sortKey,        setSortKey]        = useState<SortKey>("date");
  const [sortDir,        setSortDir]        = useState<SortDir>("desc");
  const [pageError,      setPageError]      = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // ── persistence helper ────────────────────────────────────────────────────────
  const persist = useCallback((
    promise: Promise<unknown>,
    errMsg: string,
    rollback: () => void,
    onSuccess?: (r: unknown) => void,
  ) => {
    promise
      .then(r => { setPageError(null); onSuccess?.(r); })
      .catch(() => { setPageError(errMsg); rollback(); });
  }, []);

  // ── derived lists ─────────────────────────────────────────────────────────────
  const tabFiltered = useMemo(() => {
    let list = partyList;
    if (timeTab === "Upcoming") list = list.filter(p => !p.completed);
    if (timeTab === "Past")     list = list.filter(p =>  p.completed);
    if (typeFilter !== "All")   list = list.filter(p => p.partyType === typeFilter);
    return list;
  }, [partyList, timeTab, typeFilter]);

  const sorted = useMemo(() => {
    const list = [...tabFiltered];
    list.sort((a, b) => {
      if (sortKey === "date") {
        return sortDir === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      }
      const av = sortKey === "profit" ? profit(a) : (a[sortKey] as number);
      const bv = sortKey === "profit" ? profit(b) : (b[sortKey] as number);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [tabFiltered, sortKey, sortDir]);

  const selected    = useMemo(() => partyList.find(p => p.id === selectedId) ?? null, [partyList, selectedId]);
  const wrapUpParty = useMemo(() => partyList.find(p => p.id === wrapUpId)   ?? null, [partyList, wrapUpId]);
  const editParty   = useMemo(() => partyList.find(p => p.id === editingId)  ?? null, [partyList, editingId]);

  // ── summary stats (based on tab-filtered list) ────────────────────────────────
  const completedFiltered = useMemo(() => tabFiltered.filter(p => p.completed), [tabFiltered]);
  const totalRevenue  = useMemo(() => completedFiltered.reduce((s, p) => s + p.doorRevenue, 0), [completedFiltered]);
  const totalExpenses = useMemo(() => completedFiltered.reduce((s, p) => s + p.expenses,    0), [completedFiltered]);
  const totalProfit   = totalRevenue - totalExpenses;
  const avgProfit     = completedFiltered.length > 0 ? totalProfit / completedFiltered.length : 0;
  const bestParty     = useMemo(() => {
    if (!completedFiltered.length) return null;
    return completedFiltered.reduce((a, b) => profit(b) > profit(a) ? b : a);
  }, [completedFiltered]);

  const counts = useMemo(() => ({
    all:      partyList.length,
    upcoming: partyList.filter(p => !p.completed).length,
    past:     partyList.filter(p =>  p.completed).length,
  }), [partyList]);

  // ── sort helper ───────────────────────────────────────────────────────────────
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <th onClick={() => toggleSort(col)}
          className="cursor-pointer select-none px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500 hover:text-slate-300 transition-colors">
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  // ── mutations ─────────────────────────────────────────────────────────────────

  function handleAdd(form: typeof ADD_FORM_EMPTY) {
    const tempId = Date.now();
    const entry: PartyEvent = {
      id: tempId, name: form.name, date: form.date, partyType: form.partyType,
      theme: form.theme, collabOrg: form.collabOrg,
      doorRevenue: 0, attendance: 0, expenses: 0, notes: "",
      completed: false, completedAt: null,
    };
    setPartyList(prev => [...prev, entry]);
    setModal(null);
    setSelectedId(tempId);
    persist(
      requestJson<PartyEvent>("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, date: form.date, partyType: form.partyType, theme: form.theme, collabOrg: form.collabOrg }),
      }),
      "Could not save party. Changes reverted.",
      () => { setPartyList(prev => prev.filter(p => p.id !== tempId)); setSelectedId(null); },
      saved => {
        const s = saved as PartyEvent;
        setPartyList(prev => prev.map(p => p.id === tempId ? s : p));
        setSelectedId(s.id);
      },
    );
  }

  function handleEdit(updates: Partial<PartyEvent>) {
    if (!editingId) return;
    const prev = partyList.find(p => p.id === editingId);
    setPartyList(list => list.map(p => p.id === editingId ? { ...p, ...updates } : p));
    setModal(null);
    setEditingId(null);
    persist(
      requestJson<PartyEvent>(`/api/parties/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
      "Could not save changes. Changes reverted.",
      () => { if (prev) setPartyList(list => list.map(p => p.id === editingId ? prev : p)); },
    );
  }

  function handleWrapUp(form: typeof WRAP_FORM_EMPTY) {
    if (!wrapUpId) return;
    if (wrapUpId > 1_000_000_000) {
      setPageError("Party is still saving. Wait a moment, then try again.");
      return;
    }
    const prev = partyList.find(p => p.id === wrapUpId);
    const updates = {
      doorRevenue: Number(form.doorRevenue) || 0,
      expenses:    Number(form.expenses)    || 0,
      attendance:  Number(form.attendance)  || 0,
      notes:       form.notes,
      completed:   true,
    };
    setPartyList(list => list.map(p => p.id === wrapUpId
      ? { ...p, ...updates, completedAt: new Date().toISOString() }
      : p
    ));
    setModal(null);
    setWrapUpId(null);
    persist(
      requestJson<PartyEvent>(`/api/parties/${wrapUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
      "Could not mark party completed. Changes reverted.",
      () => { if (prev) setPartyList(list => list.map(p => p.id === wrapUpId ? prev : p)); },
      saved => setPartyList(list => list.map(p => p.id === wrapUpId ? saved as PartyEvent : p)),
    );
  }

  function handleDelete(id: number) {
    const prev = partyList.find(p => p.id === id);
    setPartyList(list => list.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
    persist(
      requestJson<void>(`/api/parties/${id}`, { method: "DELETE" }),
      "Could not delete party. Changes reverted.",
      () => { if (prev) setPartyList(list => [...list, prev].sort((a, b) => a.id - b.id)); },
    );
  }

  function openWrapUp(p: PartyEvent) { setWrapUpId(p.id); setModal("wrap-up"); }
  function openEdit(p: PartyEvent)   { setEditingId(p.id); setModal("edit"); }
  function closeModal() { setModal(null); setEditingId(null); setWrapUpId(null); }

  const showFinancials = timeTab !== "Upcoming";

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Events" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* toolbar */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Party Dashboard</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Lambda Phi Epsilon · Revenue &amp; Profit Tracker</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px"
               style={{ background: "linear-gradient(90deg,transparent,rgba(99,102,241,0.4) 30%,rgba(99,102,241,0.4) 70%,transparent)" }} />
          <button onClick={() => setModal("add")}
            className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-[12px] font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-colors">
            + Add Party
          </button>
          <UserAvatar />
        </header>

        {/* body */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">

            {pageError && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[12px] text-red-200">
                <span>{pageError}</span>
                <button onClick={() => setPageError(null)} className="rounded-lg border border-red-300/20 px-2.5 py-1 font-semibold text-red-100 hover:bg-red-500/15">Dismiss</button>
              </div>
            )}

            {/* ── time tabs + type filter ────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1">
                {(["All", "Upcoming", "Past"] as TimeTab[]).map(tab => (
                  <button key={tab} onClick={() => setTimeTab(tab)}
                    className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ${
                      timeTab === tab
                        ? "bg-white/[0.10] text-white"
                        : "border border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200"
                    }`}>
                    {tab}
                    <span className={`ml-1.5 text-[10px] tabular-nums ${timeTab === tab ? "text-slate-300" : "text-slate-600"}`}>
                      {tab === "All" ? counts.all : tab === "Upcoming" ? counts.upcoming : counts.past}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {(["All", "Open", "Closed"] as TypeFilter[]).map(f => (
                  <button key={f} onClick={() => setTypeFilter(f)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${
                      typeFilter === f
                        ? "bg-white/[0.10] text-white"
                        : "border border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200"
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* ── summary cards ─────────────────────────────────────────── */}
            {showFinancials && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
                <SummaryCard label="Total Revenue"  value={fmt$(totalRevenue)}  accent="text-indigo-400"
                  sub={`${completedFiltered.length} completed`} />
                <SummaryCard label="Total Expenses" value={fmt$(totalExpenses)} accent="text-red-400" />
                <SummaryCard label="Total Profit"   value={fmt$(totalProfit)}
                  accent={totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}
                  sub={totalProfit >= 0 ? "net positive" : "net loss"} />
                <SummaryCard label="Avg Profit"     value={fmt$(Math.round(avgProfit))}
                  accent={avgProfit >= 0 ? "text-white" : "text-amber-400"} />
                <SummaryCard label="Best Party"     value={bestParty ? fmt$(profit(bestParty)) : "—"}
                  accent="text-pink-400" sub={bestParty?.name ?? "none yet"} />
              </div>
            )}

            {/* ── main grid: table + detail ──────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

              {/* table */}
              <Card className="overflow-hidden xl:col-span-2" style={{ background: "linear-gradient(to bottom,#ffffff08 0%,#10121a 45%)" }}>
                <div className="border-b border-white/[0.07] px-5 py-3.5">
                  <h2 className="text-[14px] font-semibold text-white">
                    {timeTab === "Upcoming" ? "Upcoming Parties" : timeTab === "Past" ? "Past Parties" : "All Parties"}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">Click a row to view details</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                        <th className="py-2.5 pl-5 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Party</th>
                        <SortTh label="Date" col="date" />
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Type</th>
                        {showFinancials && <>
                          <SortTh label="Revenue"  col="doorRevenue" />
                          <SortTh label="Expenses" col="expenses" />
                          <SortTh label="Profit"   col="profit" />
                          <SortTh label="Att."     col="attendance" />
                        </>}
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {sorted.length === 0 ? (
                        <tr><td colSpan={showFinancials ? 8 : 4} className="py-12 text-center text-[13px] text-slate-500">No parties here yet.</td></tr>
                      ) : sorted.map(p => {
                        const pr = profit(p);
                        const isSelected = selectedId === p.id;
                        return (
                          <tr key={p.id}
                              onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                              className={`cursor-pointer transition-colors ${isSelected ? "bg-indigo-500/[0.07]" : "hover:bg-white/[0.03]"}`}>
                            <td className="border-l-2 border-l-indigo-500/40 py-3 pl-4 pr-3">
                              <p className="text-[13px] font-semibold text-white">{p.name}</p>
                              {(p.theme || p.collabOrg) && (
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  {[p.theme, p.collabOrg ? `w/ ${p.collabOrg}` : ""].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3 text-[12px] text-slate-400 whitespace-nowrap">{fmtDate(p.date)}</td>
                            <td className="px-3 py-3"><PartyTypeBadge type={p.partyType} /></td>
                            {showFinancials && <>
                              <td className="px-3 py-3 tabular-nums text-[13px] font-medium text-indigo-300">{p.completed ? fmt$(p.doorRevenue) : "—"}</td>
                              <td className="px-3 py-3 tabular-nums text-[13px] font-medium text-red-400">{p.completed ? fmt$(p.expenses) : "—"}</td>
                              <td className="px-3 py-3 tabular-nums text-[13px] font-bold" style={{ color: p.completed ? (pr >= 0 ? "#34d399" : "#f87171") : "#475569" }}>
                                {p.completed ? fmt$(pr) : "—"}
                              </td>
                              <td className="px-3 py-3 tabular-nums text-[12px] text-slate-400">{p.completed ? p.attendance : "—"}</td>
                            </>}
                            <td className="px-3 py-3">
                              <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                                {!p.completed && (
                                  <button onClick={() => openWrapUp(p)}
                                    className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors whitespace-nowrap">
                                    Wrap up
                                  </button>
                                )}
                                <button onClick={() => openEdit(p)}
                                  className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] font-medium text-slate-400 ring-1 ring-inset ring-white/[0.1] hover:bg-indigo-500/15 hover:text-indigo-400 hover:ring-indigo-500/25 transition-colors">
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-2.5">
                  <p className="text-[11px] text-slate-500">
                    {sorted.length} shown ·{" "}
                    <span className="font-medium text-amber-400">{sorted.filter(needsWrapUp).length} need wrap-up</span>
                  </p>
                </div>
              </Card>

              {/* detail panel */}
              <div>
                {selected ? (
                  <DetailPanel
                    party={selected}
                    onEdit={() => openEdit(selected)}
                    onWrapUp={() => openWrapUp(selected)}
                    onDelete={() => setConfirmDeleteId(selected.id)}
                  />
                ) : (
                  <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <svg className="h-8 w-8 text-slate-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <p className="text-[13px] text-slate-500">Select a party to view details</p>
                  </Card>
                )}
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* modals */}
      {modal === "add" && (
        <Modal title="Add Party" onClose={closeModal}>
          <AddPartyForm onSubmit={handleAdd} onClose={closeModal} />
        </Modal>
      )}
      {modal === "edit" && editParty && (
        <Modal title="Edit Party" onClose={closeModal}>
          <EditPartyForm party={editParty} onSubmit={handleEdit} onClose={closeModal} />
        </Modal>
      )}
      {modal === "wrap-up" && wrapUpParty && (
        <Modal title="Mark Completed" onClose={closeModal}>
          <WrapUpForm party={wrapUpParty} onSubmit={handleWrapUp} onClose={closeModal} />
        </Modal>
      )}
      {confirmDeleteId !== null && (() => {
        const party = partyList.find(p => p.id === confirmDeleteId);
        return party ? (
          <ConfirmDialog
            title="Delete Party"
            message={<>Delete <span className="font-semibold text-white">{party.name}</span>? This cannot be undone.</>}
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
          />
        ) : null;
      })()}
    </div>
  );
}
