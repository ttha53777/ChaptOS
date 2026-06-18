"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal, FieldLabel, ConfirmDialog } from "../../components/dashboard/primitives";
import { inputDuskCls } from "../../components/dashboard/styles";
import { useChapter } from "../../context/ChapterContext";
import { PartyEvent, Brother, fmt$, fmtDate } from "../../data";
import { requestJson } from "../../lib/api";
import { todayStr, daysFromToday } from "../../lib/dates";
import "../../components/dashboard/dashboard-ledger.css";
import "./parties-ledger.css";

// ─── helpers ──────────────────────────────────────────────────────────────────

function profit(p: PartyEvent) { return p.doorRevenue - p.expenses; }
function needsWrapUp(p: PartyEvent) { return !p.completed && p.date < todayStr(); }
function isUpcoming(p: PartyEvent) { return !p.completed && p.date >= todayStr(); }

// "Open · All White · with KDF" — only the parts that exist.
function subLine(p: PartyEvent) {
  return [p.partyType, p.theme, p.collabOrg ? `with ${p.collabOrg}` : ""].filter(Boolean).join(" · ");
}

// ─── types ────────────────────────────────────────────────────────────────────

type ModalKind = "add" | "edit" | "wrap-up";

const ADD_FORM_EMPTY = {
  name: "", date: todayStr(), partyType: "Open" as "Open" | "Closed",
  theme: "", collabOrg: "",
};

// Door revenue + expenses + notes only — outside guest count is no longer tracked.
const WRAP_FORM_EMPTY = {
  doorRevenue: "", expenses: "", notes: "",
};

// What the wrap-up submit hands back: money fields plus (optionally) member roll.
type WrapUpSubmit = {
  doorRevenue: string;
  expenses: string;
  notes: string;
  attendedIds?: number[];
  mandatory?: boolean;
};

// ─── Add party form ───────────────────────────────────────────────────────────

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
        <FieldLabel tone="dusk">Party name *</FieldLabel>
        <input className={inputDuskCls} required value={form.name} onChange={set("name")} placeholder="Spring Rush Social" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel tone="dusk">Date *</FieldLabel>
          <input type="date" className={inputDuskCls} required value={form.date} onChange={set("date")} />
        </div>
        <div>
          <FieldLabel tone="dusk">Party type</FieldLabel>
          <select className={inputDuskCls} value={form.partyType} onChange={e => setForm(f => ({ ...f, partyType: e.target.value as "Open" | "Closed" }))}>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div>
          <FieldLabel tone="dusk">Theme</FieldLabel>
          <input className={inputDuskCls} value={form.theme} onChange={set("theme")} placeholder="All White, Black & Gold…" />
        </div>
        <div>
          <FieldLabel tone="dusk">Collab org</FieldLabel>
          <input className={inputDuskCls} value={form.collabOrg} onChange={set("collabOrg")} placeholder="KDF, DSP…" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-[rgba(236,231,221,0.12)] bg-transparent px-4 py-2 text-[13px] font-medium text-[#c9c2b4] hover:bg-white/[0.04] transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-[#7c3aed] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors">
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
        <FieldLabel tone="dusk">Party name *</FieldLabel>
        <input className={inputDuskCls} required value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel tone="dusk">Date *</FieldLabel>
          <input type="date" className={inputDuskCls} required value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <FieldLabel tone="dusk">Party type</FieldLabel>
          <select className={inputDuskCls} value={partyType} onChange={e => setPartyType(e.target.value as "Open" | "Closed")}>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div>
          <FieldLabel tone="dusk">Theme</FieldLabel>
          <input className={inputDuskCls} value={theme} onChange={e => setTheme(e.target.value)} placeholder="All White…" />
        </div>
        <div>
          <FieldLabel tone="dusk">Collab org</FieldLabel>
          <input className={inputDuskCls} value={collabOrg} onChange={e => setCollabOrg(e.target.value)} placeholder="KDF, DSP…" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-[rgba(236,231,221,0.12)] bg-transparent px-4 py-2 text-[13px] font-medium text-[#c9c2b4] hover:bg-white/[0.04] transition-colors">
          Cancel
        </button>
        <button type="submit"
          className="rounded-lg bg-[#7c3aed] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors">
          Save Changes
        </button>
      </div>
    </form>
  );
}

// ─── Wrap-up form (two steps: money → roll) ───────────────────────────────────
// Step 2 (roster + mandatory toggle) is skipped entirely when the party already
// has attendance logged — then submitting step 1 just saves the money.

function WrapUpForm({ party, brothers, alreadyRolled, onSubmit, onClose }: {
  party: PartyEvent;
  brothers: Brother[];
  alreadyRolled: boolean;
  onSubmit: (data: WrapUpSubmit) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState(WRAP_FORM_EMPTY);
  // Roster defaults to ALL PRESENT — tap to un-check no-shows.
  const [present, setPresent] = useState<Set<number>>(() => new Set(brothers.map(b => b.id)));
  const [mandatory, setMandatory] = useState(false);

  const set = (k: keyof typeof WRAP_FORM_EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  const togglePresent = (id: number) =>
    setPresent(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const profitPreview = (Number(form.doorRevenue) || 0) - (Number(form.expenses) || 0);
  const canTakeRoll = brothers.length > 0 && !alreadyRolled;

  function submitMoneyOnly() { onSubmit(form); }
  function submitWithRoll()  { onSubmit({ ...form, attendedIds: [...present], mandatory }); }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-white/[0.04] px-4 py-3 mb-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#ece7dd]">{party.name}</p>
          <p className="text-[11px] text-[#958d7c] mt-0.5">{fmtDate(party.date)} · {subLine(party)}</p>
        </div>
        {canTakeRoll && (
          <div className="flex gap-1.5 shrink-0">
            <span className={`h-1.5 w-1.5 rounded-full ${step === 1 ? "bg-[#a78bfa]" : "bg-[#6b6354]"}`} />
            <span className={`h-1.5 w-1.5 rounded-full ${step === 2 ? "bg-[#a78bfa]" : "bg-[#6b6354]"}`} />
          </div>
        )}
      </div>

      {step === 1 && (
        <form onSubmit={e => { e.preventDefault(); canTakeRoll ? setStep(2) : submitMoneyOnly(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel tone="dusk">Door Revenue ($) *</FieldLabel>
              <input type="number" min="0" step="0.01" className={inputDuskCls} required value={form.doorRevenue} onChange={set("doorRevenue")} placeholder="0.00" />
            </div>
            <div>
              <FieldLabel tone="dusk">Expenses ($) *</FieldLabel>
              <input type="number" min="0" step="0.01" className={inputDuskCls} required value={form.expenses} onChange={set("expenses")} placeholder="0.00" />
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
            <p className="text-[10px] text-[#6b6354] mb-0.5">Net preview</p>
            <p className={`text-[18px] font-bold tabular-nums ${profitPreview >= 0 ? "text-[#7fb08a]" : "text-[#d98ba3]"}`}>{fmt$(profitPreview)}</p>
          </div>
          <div>
            <FieldLabel tone="dusk">Post-event notes</FieldLabel>
            <textarea className={`${inputDuskCls} resize-none`} rows={2} value={form.notes} onChange={set("notes")} placeholder="How did it go?" />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[rgba(236,231,221,0.12)] bg-transparent px-4 py-2 text-[13px] font-medium text-[#c9c2b4] hover:bg-white/[0.04] transition-colors">Cancel</button>
            <button type="submit"
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors">
              {canTakeRoll ? "Next: Who came? →" : "Mark Completed"}
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={e => { e.preventDefault(); submitWithRoll(); }} className="space-y-3">
          <div className="flex items-center justify-between">
            <FieldLabel tone="dusk">Who came? ({present.size}/{brothers.length})</FieldLabel>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPresent(new Set(brothers.map(b => b.id)))}
                className="text-[10px] uppercase tracking-wider text-[#958d7c] hover:text-[#ece7dd]">All</button>
              <button type="button" onClick={() => setPresent(new Set())}
                className="text-[10px] uppercase tracking-wider text-[#958d7c] hover:text-[#ece7dd]">None</button>
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto rounded-lg border border-[rgba(236,231,221,0.08)] divide-y divide-[rgba(236,231,221,0.05)]">
            {brothers.map(b => {
              const on = present.has(b.id);
              return (
                <button type="button" key={b.id} onClick={() => togglePresent(b.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors">
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-[#7fb08a] bg-[#7fb08a]/20" : "border-[rgba(236,231,221,0.18)]"}`}>
                    {on && <svg className="h-3 w-3 text-[#7fb08a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                  <span className={`text-[13px] ${on ? "text-[#ece7dd]" : "text-[#958d7c]"}`}>{b.name}</span>
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)}
              className="h-4 w-4 accent-[#a78bfa]" />
            <span className="text-[12px] text-[#c9c2b4]">Mandatory — count this toward each brother&rsquo;s attendance %</span>
          </label>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={() => setStep(1)}
              className="rounded-lg border border-[rgba(236,231,221,0.12)] bg-transparent px-4 py-2 text-[13px] font-medium text-[#c9c2b4] hover:bg-white/[0.04] transition-colors">← Back</button>
            <button type="submit"
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors">Mark Completed</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Ledger row ───────────────────────────────────────────────────────────────

function LedgerRow({ party, attendance, expanded, onToggle, onWrapUp, onEdit, onDelete, canParties }: {
  party: PartyEvent;
  attendance?: { present: number; eligible: number };
  expanded: boolean;
  onToggle: () => void;
  onWrapUp: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canParties: boolean;
}) {
  const p = profit(party);
  const due = needsWrapUp(party);
  const upcoming = isUpcoming(party);
  const day = Number(party.date.split("-")[2]);
  const attPct = attendance && attendance.eligible > 0
    ? Math.round((attendance.present / attendance.eligible) * 100)
    : null;

  return (
    <div className={`pty-row${expanded ? " open" : ""}${upcoming ? " future" : ""}`} data-id={party.id}>
      <button type="button" className="lead" onClick={onToggle} aria-expanded={expanded}>
        <div className="led-date">
          <div className="dnum">{day}</div>
          <div className="mon">{new Date(party.date + "T12:00:00").toLocaleString("en-US", { month: "short" })}</div>
        </div>
        <div className="led-main">
          <div className="t">
            <span className={`vdot${due ? " due" : upcoming ? " open" : ""}`} />
            {party.name}
          </div>
          <div className="sub">{subLine(party)}</div>
        </div>
      </button>

      <div className="led-state">
        {party.completed ? (
          <div className="net">
            <div className={`nv ${p >= 0 ? "pos" : "neg"}`}>{p >= 0 ? "+" : ""}{fmt$(p)}</div>
            <div className="nk">net</div>
          </div>
        ) : due && canParties ? (
          <button type="button" className="pty-badge wrap" onClick={onWrapUp}>Wrap up →</button>
        ) : due ? (
          <span className="pty-badge wrap" style={{ cursor: "default" }}>Needs wrap-up</span>
        ) : (
          <span className="pty-badge up">Upcoming</span>
        )}
        <span className="chev" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </div>

      <div className="drawer">
        <div className="drawer-inner">
          {party.completed && <>
            <div className="dstat"><div className="dk">Door</div><div className="dv">{fmt$(party.doorRevenue)}</div></div>
            <div className="dstat"><div className="dk">Spent</div><div className="dv">{fmt$(party.expenses)}</div></div>
            <div className="dstat"><div className="dk">Net</div><div className="dv">{p >= 0 ? "+" : ""}{fmt$(p)}</div></div>
          </>}
          {attendance && attendance.eligible > 0 && (
            <div className="dstat"><div className="dk">Attendance</div><div className="dv">{attendance.present}/{attendance.eligible} · {attPct}%</div></div>
          )}
          {party.theme &&     <div className="dstat"><div className="dk">Theme</div><div className="dv">{party.theme}</div></div>}
          {party.collabOrg && <div className="dstat"><div className="dk">Collab</div><div className="dv">{party.collabOrg}</div></div>}
          <div className="dnote">
            {party.notes
              ? `“${party.notes}”`
              : upcoming ? "Numbers open until it's wrapped up."
              : due ? "Happened already — no figures recorded yet."
              : "No notes."}
          </div>
          {canParties && (
            <div className="dactions">
              {due && <button type="button" className="mini" onClick={onWrapUp}>Wrap up</button>}
              <button type="button" className="mini" onClick={onEdit}>Edit</button>
              <button type="button" className="mini danger" onClick={onDelete}>Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type AttendanceRow = { partyId: number; present: number; eligible: number };

export default function PartiesPage() {
  const { currentUser, partyList, setPartyList, brotherList, isLoading, can } = useChapter();
  const canParties = can("MANAGE_PARTIES");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [modal,       setModal]       = useState<ModalKind | null>(null);
  const [editingId,   setEditingId]   = useState<number | null>(null);
  const [wrapUpId,    setWrapUpId]    = useState<number | null>(null);
  const [pageError,      setPageError]      = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Per-party member roll, fetched separately so the parties list shape stays put.
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const loadAttendance = useCallback(() => {
    requestJson<AttendanceRow[]>("/api/parties/attendance-summary")
      .then(setAttendanceRows)
      .catch(() => { /* summary is best-effort; metric falls back to "—" */ });
  }, []);
  useEffect(() => { loadAttendance(); }, [loadAttendance]);

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

  // ── derived lists (all from partyList, newest first) ───────────────────────────
  const sorted = useMemo(
    () => [...partyList].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [partyList],
  );

  const wrapUpParty = useMemo(() => partyList.find(p => p.id === wrapUpId)  ?? null, [partyList, wrapUpId]);
  const editParty   = useMemo(() => partyList.find(p => p.id === editingId) ?? null, [partyList, editingId]);

  // ── takings summary (completed parties only) ───────────────────────────────────
  const completed   = useMemo(() => partyList.filter(p => p.completed), [partyList]);
  const totalRevenue  = useMemo(() => completed.reduce((s, p) => s + p.doorRevenue, 0), [completed]);
  const totalExpenses = useMemo(() => completed.reduce((s, p) => s + p.expenses,    0), [completed]);
  const totalNet      = totalRevenue - totalExpenses;
  const keptPct       = totalRevenue > 0 ? Math.round((totalNet / totalRevenue) * 100) : 0;
  const bestParty     = useMemo(() => {
    if (!completed.length) return null;
    return completed.reduce((a, b) => profit(b) > profit(a) ? b : a);
  }, [completed]);

  // ── avg member attendance across parties that have roll logged ─────────────────
  // partyAttendance maps partyId → { present, eligible } from the summary endpoint.
  // Empty until a party is rolled → avgAttendance is null and the metric renders "—".
  const partyAttendance = useMemo<Record<number, { present: number; eligible: number }>>(() => {
    const m: Record<number, { present: number; eligible: number }> = {};
    for (const r of attendanceRows) m[r.partyId] = { present: r.present, eligible: r.eligible };
    return m;
  }, [attendanceRows]);
  const avgAttendance = useMemo(() => {
    const rolled = Object.values(partyAttendance).filter(a => a.eligible > 0);
    if (rolled.length === 0) return null;
    const sum = rolled.reduce((s, a) => s + a.present / a.eligible, 0);
    return Math.round((sum / rolled.length) * 100);
  }, [partyAttendance]);

  // ── needs-wrap-up (past, not completed) — the one task ─────────────────────────
  const needWrap = useMemo(
    () => partyList.filter(needsWrapUp).sort((a, b) => a.date.localeCompare(b.date)), // most overdue first
    [partyList],
  );
  const heroParty = needWrap[0] ?? null;

  const orgName = currentUser?.org?.name ?? "ChaptOS";

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
    setExpandedId(tempId);
    persist(
      requestJson<PartyEvent>("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, date: form.date, partyType: form.partyType, theme: form.theme, collabOrg: form.collabOrg }),
      }),
      "Could not save party. Changes reverted.",
      () => { setPartyList(prev => prev.filter(p => p.id !== tempId)); setExpandedId(null); },
      saved => {
        const s = saved as PartyEvent;
        setPartyList(prev => prev.map(p => p.id === tempId ? s : p));
        setExpandedId(s.id);
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

  function handleWrapUp(form: WrapUpSubmit) {
    if (!wrapUpId) return;
    const id = wrapUpId;
    if (id > 1_000_000_000) {
      setPageError("Party is still saving. Wait a moment, then try again.");
      return;
    }
    const prev = partyList.find(p => p.id === id);
    // Optimistic money/completed; roll persists server-side and is reflected after refetch.
    const optimistic = {
      doorRevenue: Number(form.doorRevenue) || 0,
      expenses:    Number(form.expenses)    || 0,
      notes:       form.notes,
      completed:   true,
    };
    setPartyList(list => list.map(p => p.id === id
      ? { ...p, ...optimistic, completedAt: new Date().toISOString() }
      : p
    ));
    setModal(null);
    setWrapUpId(null);
    persist(
      requestJson<PartyEvent>(`/api/parties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wrapUp:      true,
          doorRevenue: Number(form.doorRevenue) || 0,
          expenses:    Number(form.expenses)    || 0,
          notes:       form.notes,
          ...(form.attendedIds !== undefined ? { attendedIds: form.attendedIds, mandatory: !!form.mandatory } : {}),
        }),
      }),
      "Could not mark party completed. Changes reverted.",
      () => { if (prev) setPartyList(list => list.map(p => p.id === id ? prev : p)); },
      saved => { setPartyList(list => list.map(p => p.id === id ? saved as PartyEvent : p)); loadAttendance(); },
    );
  }

  function handleDelete(id: number) {
    const prev = partyList.find(p => p.id === id);
    setPartyList(list => list.filter(p => p.id !== id));
    if (expandedId === id) setExpandedId(null);
    persist(
      requestJson<void>(`/api/parties/${id}`, { method: "DELETE" }),
      "Could not delete party. Changes reverted.",
      () => { if (prev) setPartyList(list => [...list, prev].sort((a, b) => a.id - b.id)); },
    );
  }

  function openWrapUp(id: number) { setWrapUpId(id); setModal("wrap-up"); }
  function openEdit(id: number)   { setEditingId(id); setModal("edit"); }
  function closeModal() { setModal(null); setEditingId(null); setWrapUpId(null); }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Parties" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar (mobile hamburger + breadcrumb) ── */}
        <header className="toolbar-frosted dash-toolbar pty-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="pty-crumb truncate">Parties</span>
        </header>

        {/* ── Scrollable dusk ledger pane ── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-parties" data-dashboard-theme="dusk">

            {pageError && (
              <div className="pty-toast" role="status">
                <span>{pageError}</span>
                <button onClick={() => setPageError(null)} aria-label="Dismiss">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Briefing ── */}
            <section className="pty-briefing" aria-label="Parties">
              <div>
                <p className="kicker">
                  <span className="today">{new Date(todayStr() + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                  &ensp;·&ensp;Parties&ensp;·&ensp;{orgName}
                </p>
                <h1>The <em>house</em> ledger.</h1>
                <p className="sub">
                  {completed.length > 0
                    ? `${completed.length} ${completed.length === 1 ? "party" : "parties"} closed out and the books are ${totalNet >= 0 ? "net positive" : "in the red"}.`
                    : "No parties closed out yet."}
                  {needWrap.length > 0
                    ? ` ${needWrap.length} ${needWrap.length === 1 ? "party is" : "parties are"} still waiting on numbers — close ${needWrap.length === 1 ? "it" : "them"} out and you're square.`
                    : " Everything's accounted for."}
                </p>
              </div>
              {canParties && (
                <button className="pty-add" onClick={() => setModal("add")}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Add party
                </button>
              )}
            </section>

            {isLoading ? (
              <>
                <div className="pty-skel glance" />
                <div className="pty-sec" style={{ marginTop: 32 }}><h2>Every party</h2><span className="rule" /></div>
                <div className="pty-skel">
                  {[...Array(5)].map((_, i) => (
                    <div className="ln" key={i}><span className="bar w1" /><span className="bar w2" /></div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* ── 1 · The one task ── */}
                {heroParty && canParties && (
                  <div className="pty-needs">
                    <div className="nd-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                    </div>
                    <div className="nd-body">
                      <div className="nd-tag">Needs wrap-up · {Math.max(0, -daysFromToday(heroParty.date))} days ago</div>
                      <div className="nd-title">{heroParty.name}</div>
                      <div className="nd-meta">{subLine(heroParty)} · <b>{fmtDate(heroParty.date)}</b> — add the door &amp; expenses so the semester totals are right.</div>
                      {needWrap.length > 1 && <div className="nd-more">+{needWrap.length - 1} more waiting below</div>}
                    </div>
                    <button className="pty-do" onClick={() => openWrapUp(heroParty.id)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      Close it out
                    </button>
                  </div>
                )}

                {/* ── 2 · Did we net money ── */}
                {completed.length > 0 && (
                  <div className="pty-takings">
                    <div className="head-num">
                      <div className="k">Net this semester</div>
                      <div className={`v${totalNet >= 0 ? "" : " neg"}`}>{totalNet >= 0 ? "+" : ""}{fmt$(totalNet)}</div>
                      <div className="note">across {completed.length} closed {completed.length === 1 ? "party" : "parties"}</div>
                    </div>
                    <div className="vrule" />
                    <div className="breakdown">
                      <div className="bd"><div className="k">Door taken</div><div className="v">{fmt$(totalRevenue)}</div><div className="sub">gross revenue</div></div>
                      <div className="bd"><div className="k">Spent</div><div className="v">{fmt$(totalExpenses)}</div><div className="sub">kept {keptPct}%</div></div>
                      <div className="bd"><div className="k">Avg attendance</div><div className="v">{avgAttendance !== null ? `${avgAttendance}%` : "—"}</div><div className="sub">{avgAttendance !== null ? "of chapter" : "no roll yet"}</div></div>
                      <div className="bd"><div className="k">Best night</div><div className="v">{bestParty ? `+${fmt$(profit(bestParty))}` : "—"}</div><div className="sub">{bestParty?.name ?? "none yet"}</div></div>
                    </div>
                  </div>
                )}

                {/* ── 3 · The ledger ── */}
                <div className="pty-sec">
                  <h2>Every party</h2>
                  <span className="rule" />
                  <span className="cnt">{sorted.length} total · newest first</span>
                </div>

                {sorted.length === 0 ? (
                  <div className="pty-empty">
                    <div className="ic">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                    </div>
                    <div className="t">No parties yet</div>
                    <div className="h">{canParties ? "Add your first party to start tracking the books." : "Nothing here yet."}</div>
                  </div>
                ) : (
                  <div className="pty-ledger">
                    {sorted.map(p => (
                      <LedgerRow
                        key={p.id}
                        party={p}
                        attendance={partyAttendance[p.id]}
                        expanded={expandedId === p.id}
                        onToggle={() => setExpandedId(id => id === p.id ? null : p.id)}
                        onWrapUp={() => openWrapUp(p.id)}
                        onEdit={() => openEdit(p.id)}
                        onDelete={() => setConfirmDeleteId(p.id)}
                        canParties={canParties}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

          </div>
        </main>
      </div>

      {/* modals */}
      {modal === "add" && (
        <Modal title="Add Party" onClose={closeModal} tone="dusk">
          <AddPartyForm onSubmit={handleAdd} onClose={closeModal} />
        </Modal>
      )}
      {modal === "edit" && editParty && (
        <Modal title="Edit Party" onClose={closeModal} tone="dusk">
          <EditPartyForm party={editParty} onSubmit={handleEdit} onClose={closeModal} />
        </Modal>
      )}
      {modal === "wrap-up" && wrapUpParty && (
        <Modal title="Mark Completed" onClose={closeModal} tone="dusk">
          <WrapUpForm
            party={wrapUpParty}
            brothers={brotherList}
            alreadyRolled={partyAttendance[wrapUpParty.id] !== undefined}
            onSubmit={handleWrapUp}
            onClose={closeModal}
          />
        </Modal>
      )}
      {confirmDeleteId !== null && (() => {
        const party = partyList.find(p => p.id === confirmDeleteId);
        return party ? (
          <ConfirmDialog
            title="Delete Party"
            message={<>Delete <span className="font-semibold text-[#ece7dd]">{party.name}</span>? This cannot be undone.</>}
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null); }}
            tone="dusk"
          />
        ) : null;
      })()}
    </div>
  );
}
