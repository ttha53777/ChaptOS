"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  ComposedChart, BarChart, PieChart,
  Bar, Line, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Sidebar } from "../components/Sidebar";
import { Card, Modal, FieldLabel } from "../components/dashboard/primitives";
import { inputCls, tooltipStyle } from "../components/dashboard/styles";
import { useChapter } from "../context/ChapterContext";
import {
  Transaction, PartyEvent,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS,
  fmt$, fmtDate,
} from "../data";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_SEMESTER = "SPR26";

const EXPENSE_COLORS: Record<string, string> = {
  "Reimbursement":  "#f472b6",
  "Party Supplies": "#fb923c",
  "Operations":     "#818cf8",
  "Brotherhood":    "#34d399",
  "Events":         "#facc15",
  "House":          "#38bdf8",
  "Travel":         "#a78bfa",
  "Misc":           "#94a3b8",
};

type TxModal =
  | { kind: "addTx" }
  | { kind: "editTx"; tx: Transaction }
  | null;

type PartyModal =
  | { kind: "addParty" }
  | { kind: "editParty"; event: PartyEvent }
  | null;

type TxTab = "all" | "income" | "expense";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Transaction Form ─────────────────────────────────────────────────────────

function TxForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Transaction>;
  onSubmit: (data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">) => void;
  onCancel: () => void;
}) {
  const [type,          setType]          = useState<"income" | "expense">(initial?.type ?? "expense");
  const [category,      setCategory]      = useState(initial?.category ?? "");
  const [amount,        setAmount]        = useState(String(initial?.amount ?? ""));
  const [date,          setDate]          = useState(initial?.date ?? todayStr());
  const [description,   setDescription]   = useState(initial?.description ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "");
  const [paidTo,        setPaidTo]        = useState(initial?.paidTo ?? "");
  const [semester,      setSemester]      = useState(initial?.semester ?? CURRENT_SEMESTER);

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ type, category, amount: Number(amount), date, description, paymentMethod: paymentMethod || undefined, paidTo: paidTo || undefined, semester: semester || undefined });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Type</FieldLabel>
          <select value={type} onChange={e => { setType(e.target.value as "income" | "expense"); setCategory(""); }} className={inputCls}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div>
          <FieldLabel>Category</FieldLabel>
          <select value={category} onChange={e => setCategory(e.target.value)} required className={inputCls}>
            <option value="">Select…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Amount ($)</FieldLabel>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <FieldLabel>Date</FieldLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputCls} />
        </div>
      </div>
      <div>
        <FieldLabel>Description</FieldLabel>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Asia Night door cut" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Payment Method</FieldLabel>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>Semester</FieldLabel>
          <input type="text" value={semester} onChange={e => setSemester(e.target.value)} placeholder="SPR26" className={inputCls} />
        </div>
      </div>
      {category === "Reimbursement" && (
        <div>
          <FieldLabel>Paid To</FieldLabel>
          <input type="text" value={paidTo} onChange={e => setPaidTo(e.target.value)} placeholder="Brother name" className={inputCls} />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors">Cancel</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
          {initial?.id ? "Save Changes" : "Add Transaction"}
        </button>
      </div>
    </form>
  );
}

// ─── Party Event Form ─────────────────────────────────────────────────────────

function PartyForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<PartyEvent>;
  onSubmit: (data: Omit<PartyEvent, "id">) => void;
  onCancel: () => void;
}) {
  const [name,        setName]        = useState(initial?.name ?? "");
  const [date,        setDate]        = useState(initial?.date ?? todayStr());
  const [doorRevenue, setDoorRevenue] = useState(String(initial?.doorRevenue ?? ""));
  const [attendance,  setAttendance]  = useState(String(initial?.attendance ?? ""));
  const [notes,       setNotes]       = useState(initial?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ name, date, doorRevenue: Number(doorRevenue), attendance: Number(attendance), notes });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <FieldLabel>Event Name</FieldLabel>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Spring Rush Social" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date</FieldLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <FieldLabel>Door Revenue ($)</FieldLabel>
          <input type="number" min="0" step="0.01" value={doorRevenue} onChange={e => setDoorRevenue(e.target.value)} required placeholder="0" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Attendance</FieldLabel>
          <input type="number" min="0" value={attendance} onChange={e => setAttendance(e.target.value)} required placeholder="0" className={inputCls} />
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors">Cancel</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
          {initial?.id ? "Save Changes" : "Add Event"}
        </button>
      </div>
    </form>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-300">Are you sure you want to delete <span className="font-semibold text-white">{label}</span>? This action cannot be undone.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors">Cancel</button>
        <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-500 transition-colors">Delete</button>
      </div>
    </div>
  );
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function IconBtn({ path, label, className, onClick }: { path: string; label: string; className?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${className}`}>
      <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </button>
  );
}

const ICON_EDIT   = "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z";
const ICON_TRASH  = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";
const ICON_EXPORT = "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4";
const ICON_PLUS   = "M12 4v16m8-8H4";
const ICON_MENU   = "M4 6h16M4 12h16M4 18h16";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  const { treasuryData, transactionList, setTransactionList, partyList, setPartyList } = useChapter();

  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [semester,     setSemester]     = useState(CURRENT_SEMESTER);
  const [txTab,        setTxTab]        = useState<TxTab>("all");
  const [txModal,      setTxModal]      = useState<TxModal>(null);
  const [partyModal,   setPartyModal]   = useState<PartyModal>(null);
  const [deleteModal,  setDeleteModal]  = useState<{ kind: "tx"; tx: Transaction } | { kind: "party"; event: PartyEvent } | null>(null);
  const [mutErr,       setMutErr]       = useState<string | null>(null);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const activeTxns = useMemo(() =>
    transactionList.filter(t => !t.deletedAt && (!semester || t.semester === semester))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactionList, semester]
  );

  const incomeTxns  = useMemo(() => activeTxns.filter(t => t.type === "income"),  [activeTxns]);
  const expenseTxns = useMemo(() => activeTxns.filter(t => t.type === "expense"), [activeTxns]);

  const totalIncome   = useMemo(() => incomeTxns.reduce((s, t)  => s + t.amount, 0), [incomeTxns]);
  const totalExpenses = useMemo(() => expenseTxns.reduce((s, t) => s + t.amount, 0), [expenseTxns]);

  const visibleTxns = txTab === "income" ? incomeTxns : txTab === "expense" ? expenseTxns : activeTxns;

  // Running balance per row (date-asc order)
  const txnsWithRunning = useMemo(() => {
    const sorted = [...visibleTxns].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    const withRun = sorted.map(t => {
      running += t.type === "income" ? t.amount : -t.amount;
      return { ...t, running };
    });
    return withRun.reverse();
  }, [visibleTxns]);

  // Distinct semesters for selector
  const semesters = useMemo(() => {
    const seen = new Set<string>();
    transactionList.forEach(t => { if (t.semester) seen.add(t.semester); });
    seen.add(CURRENT_SEMESTER);
    return Array.from(seen).sort();
  }, [transactionList]);

  // ── Chart A: Monthly stacked bars + net line ──────────────────────────────

  const chartAData = useMemo(() => {
    const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthMap = new Map<string, { income: number; expense: number }>();

    // Door revenue from parties counts as income
    partyList.forEach(p => {
      const ym = p.date.slice(0, 7);
      const cur = monthMap.get(ym) ?? { income: 0, expense: 0 };
      monthMap.set(ym, { ...cur, income: cur.income + p.doorRevenue });
    });
    activeTxns.forEach(t => {
      const ym = t.date.slice(0, 7);
      const cur = monthMap.get(ym) ?? { income: 0, expense: 0 };
      if (t.type === "income")  monthMap.set(ym, { ...cur, income:  cur.income  + t.amount });
      if (t.type === "expense") monthMap.set(ym, { ...cur, expense: cur.expense + t.amount });
    });

    let running = 0;
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, { income, expense }]) => {
        running += income - expense;
        const [, m] = ym.split("-");
        return {
          month:   MONTH_LABELS[Number(m) - 1],
          income:  Math.round(income  * 100) / 100,
          expense: Math.round(expense * 100) / 100,
          net:     Math.round(running * 100) / 100,
        };
      });
  }, [partyList, activeTxns]);

  // ── Chart B: Expense category pie ─────────────────────────────────────────

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    expenseTxns.forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [expenseTxns]);

  // ── Chart C: Income vs Expense by category ────────────────────────────────

  const chartCData = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    incomeTxns.forEach(t => {
      const cur = map.get(t.category) ?? { income: 0, expense: 0 };
      map.set(t.category, { ...cur, income: cur.income + t.amount });
    });
    expenseTxns.forEach(t => {
      const cur = map.get(t.category) ?? { income: 0, expense: 0 };
      map.set(t.category, { ...cur, expense: cur.expense + t.amount });
    });
    return Array.from(map.entries())
      .filter(([, v]) => v.income > 0 || v.expense > 0)
      .map(([cat, { income, expense }]) => ({ cat, income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100 }));
  }, [incomeTxns, expenseTxns]);

  // ── Mutations: Transactions ───────────────────────────────────────────────

  const handleAddTx = useCallback(async (data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">) => {
    const optimisticId = -Date.now();
    const optimistic: Transaction = { ...data, id: optimisticId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setTransactionList(prev => [optimistic, ...prev]);
    setTxModal(null);
    setMutErr(null);
    try {
      const saved = await requestJson<Transaction>("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setTransactionList(prev => prev.map(t => t.id === optimisticId ? saved : t));
    } catch {
      setTransactionList(prev => prev.filter(t => t.id !== optimisticId));
      setMutErr("Failed to add transaction. Please try again.");
    }
  }, [setTransactionList]);

  const handleEditTx = useCallback(async (tx: Transaction, data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">) => {
    const previous = tx;
    const updated: Transaction = { ...tx, ...data, updatedAt: new Date().toISOString() };
    setTransactionList(prev => prev.map(t => t.id === tx.id ? updated : t));
    setTxModal(null);
    setMutErr(null);
    try {
      const saved = await requestJson<Transaction>(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setTransactionList(prev => prev.map(t => t.id === tx.id ? saved : t));
    } catch {
      setTransactionList(prev => prev.map(t => t.id === tx.id ? previous : t));
      setMutErr("Failed to update transaction. Changes were reverted.");
    }
  }, [setTransactionList]);

  const handleDeleteTx = useCallback(async (tx: Transaction) => {
    setTransactionList(prev => prev.filter(t => t.id !== tx.id));
    setDeleteModal(null);
    setMutErr(null);
    try {
      await requestJson<void>(`/api/transactions/${tx.id}`, { method: "DELETE" });
    } catch {
      setTransactionList(prev => [tx, ...prev]);
      setMutErr("Failed to delete transaction. It was restored.");
    }
  }, [setTransactionList]);

  // ── Mutations: Party Events ───────────────────────────────────────────────

  const handleAddParty = useCallback(async (data: Omit<PartyEvent, "id">) => {
    const optimisticId = -Date.now();
    const optimistic: PartyEvent = { ...data, id: optimisticId };
    setPartyList(prev => [optimistic, ...prev]);
    setPartyModal(null);
    setMutErr(null);
    try {
      const saved = await requestJson<PartyEvent>("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setPartyList(prev => prev.map(p => p.id === optimisticId ? saved : p));
    } catch {
      setPartyList(prev => prev.filter(p => p.id !== optimisticId));
      setMutErr("Failed to add party event. Please try again.");
    }
  }, [setPartyList]);

  const handleEditParty = useCallback(async (event: PartyEvent, data: Omit<PartyEvent, "id">) => {
    const previous = event;
    const updated: PartyEvent = { ...event, ...data };
    setPartyList(prev => prev.map(p => p.id === event.id ? updated : p));
    setPartyModal(null);
    setMutErr(null);
    try {
      const saved = await requestJson<PartyEvent>(`/api/parties/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setPartyList(prev => prev.map(p => p.id === event.id ? saved : p));
    } catch {
      setPartyList(prev => prev.map(p => p.id === event.id ? previous : p));
      setMutErr("Failed to update party event. Changes were reverted.");
    }
  }, [setPartyList]);

  const handleDeleteParty = useCallback(async (event: PartyEvent) => {
    setPartyList(prev => prev.filter(p => p.id !== event.id));
    setDeleteModal(null);
    setMutErr(null);
    try {
      await requestJson<void>(`/api/parties/${event.id}`, { method: "DELETE" });
    } catch {
      setPartyList(prev => [event, ...prev]);
      setMutErr("Failed to delete party event. It was restored.");
    }
  }, [setPartyList]);

  // ── Export CSV ────────────────────────────────────────────────────────────

  function handleExport() {
    const url = semester ? `/api/transactions/export?semester=${semester}` : "/api/transactions/export";
    window.location.href = url;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const balance   = treasuryData?.balance   ?? 0;
  const projected = treasuryData?.projected ?? 0;

  const sortedParties = [...partyList].sort((a, b) => b.date.localeCompare(a.date));
  const totalDoorRev  = partyList.reduce((s, p) => s + p.doorRevenue, 0);

  const tabTotals: Record<TxTab, number> = {
    all:     activeTxns.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
    income:  totalIncome,
    expense: totalExpenses,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0d14]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Treasury" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4">
          <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_MENU} />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Chapter Treasury</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Lambda Phi Epsilon · Financial Overview</p>
          </div>
          <button onClick={handleExport} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-white/[0.16] hover:bg-white/[0.06]">
            <svg className="h-3.5 w-3.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_EXPORT} />
            </svg>
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button onClick={() => setTxModal({ kind: "addTx" })} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)] transition-all hover:bg-indigo-500">
            <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PLUS} />
            </svg>
            <span className="hidden sm:inline">Add Transaction</span>
          </button>
        </header>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">

            {/* Error toast */}
            {mutErr && (
              <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                <p className="text-[13px] text-red-300">{mutErr}</p>
                <button onClick={() => setMutErr(null)} className="ml-4 text-[11px] text-red-400 hover:text-red-200">Dismiss</button>
              </div>
            )}

            {/* ── Semester Selector ──────────────────────────────────────── */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Semester</span>
              <div className="flex gap-1.5">
                {semesters.map(s => (
                  <button
                    key={s}
                    onClick={() => setSemester(s)}
                    className={`rounded-lg px-3 py-1 text-[12px] font-medium transition-all duration-150 ${
                      semester === s
                        ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-inset ring-indigo-500/30"
                        : "border border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Section 1: Balance KPI Grid ────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">

              {/* Current Balance — dominant tile */}
              <Card style={{ background: "radial-gradient(ellipse at 15% 20%, #818cf826 0%, transparent 65%), #141925" }} className="col-span-2 flex flex-col gap-2 border-t-2 border-t-indigo-500/60 p-5 sm:p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Current Balance</p>
                <p className={`text-[38px] font-bold leading-none tracking-tight sm:text-[44px] ${balance >= 0 ? "text-indigo-300" : "text-red-400"}`}>
                  {fmt$(Math.round(balance))}
                </p>
                <p className="text-[12px] text-slate-500">Projected {fmt$(Math.round(projected))}</p>
              </Card>

              {/* Total Income */}
              <Card style={{ background: "radial-gradient(ellipse at 15% 20%, #34d39914 0%, transparent 65%), #141925" }} className="flex flex-col gap-1 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Total Income</p>
                <p className="text-[22px] font-bold leading-none tracking-tight text-emerald-400">{fmt$(Math.round(totalIncome))}</p>
                <p className="text-[11px] text-slate-500">{incomeTxns.length} transactions</p>
              </Card>

              {/* Total Expenses */}
              <Card style={{ background: "radial-gradient(ellipse at 15% 20%, #ef444414 0%, transparent 65%), #141925" }} className="flex flex-col gap-1 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Total Expenses</p>
                <p className="text-[22px] font-bold leading-none tracking-tight text-red-400">{fmt$(Math.round(totalExpenses))}</p>
                <p className="text-[11px] text-slate-500">{expenseTxns.length} transactions</p>
              </Card>

              {/* Door Revenue */}
              <Card style={{ background: "radial-gradient(ellipse at 15% 20%, #f472b614 0%, transparent 65%), #141925" }} className="flex flex-col gap-1 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Door Revenue</p>
                <p className="text-[22px] font-bold leading-none tracking-tight text-pink-400">{fmt$(Math.round(totalDoorRev))}</p>
                <p className="text-[11px] text-slate-500">{partyList.length} events</p>
              </Card>
            </div>

            {/* ── Section 2: Charts ──────────────────────────────────────── */}

            {/* Chart A — full width */}
            <Card style={{ background: "linear-gradient(to bottom, #818cf80d 0%, #141925 55%)" }} className="overflow-hidden">
              <div className="flex items-start justify-between px-5 pt-4 pb-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Monthly Overview</p>
                  <p className="mt-0.5 text-[17px] font-bold tracking-tight text-white">Income vs Expenses · {semester}</p>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">Stacked bars + running net</p>
              </div>
              <div className="px-2 pb-4">
                {chartAData.length === 0 ? (
                  <div className="flex h-[160px] items-center justify-center">
                    <p className="text-[12px] text-slate-500">No data for this semester yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <ComposedChart data={chartAData} margin={{ top: 4, right: 16, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any, name: any) => [fmt$(Math.round(Number(v ?? 0))), String(name ?? "").charAt(0).toUpperCase() + String(name ?? "").slice(1)]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }} />
                      <Bar yAxisId="left" dataKey="income"  stackId="a" fill="#34d399" name="Income"  radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="expense" stackId="a" fill="#f87171" name="Expense" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="net" stroke="#818cf8" strokeWidth={2} dot={{ fill: "#818cf8", strokeWidth: 0, r: 3 }} name="Net Balance" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Charts B + C — side by side */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

              {/* Chart B — Expense Pie */}
              <Card style={{ background: "linear-gradient(to bottom, #ef44440d 0%, #141925 55%)" }} className="overflow-hidden">
                <div className="px-5 pt-4 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Expense Breakdown</p>
                  <p className="mt-0.5 text-[17px] font-bold tracking-tight text-white">By Category</p>
                </div>
                <div className="pb-3">
                  {pieData.length === 0 ? (
                    <div className="flex h-[220px] items-center justify-center">
                      <p className="text-[12px] text-slate-500">No expenses logged yet</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="45%"
                          outerRadius={80}
                          innerRadius={44}
                          dataKey="value"
                          nameKey="name"
                          paddingAngle={2}
                          label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {pieData.map(entry => (
                            <Cell key={entry.name} fill={EXPENSE_COLORS[entry.name] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => [fmt$(Math.round(Number(v ?? 0))), "Amount"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>

              {/* Chart C — Income vs Expense by Category */}
              <Card style={{ background: "linear-gradient(to bottom, #34d3990d 0%, #141925 55%)" }} className="overflow-hidden">
                <div className="px-5 pt-4 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Category Comparison</p>
                  <p className="mt-0.5 text-[17px] font-bold tracking-tight text-white">Income vs Expense</p>
                </div>
                <div className="px-1 pb-3">
                  {chartCData.length === 0 ? (
                    <div className="flex h-[220px] items-center justify-center">
                      <p className="text-[12px] text-slate-500">No transactions logged yet</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartCData} margin={{ top: 4, right: 8, bottom: 40, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="cat" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any, name: any) => [fmt$(Math.round(Number(v ?? 0))), String(name ?? "").charAt(0).toUpperCase() + String(name ?? "").slice(1)]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }} />
                        <Bar dataKey="income"  fill="#34d399" name="Income"  radius={[3, 3, 0, 0]} />
                        <Bar dataKey="expense" fill="#f87171" name="Expense" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>

            {/* ── Section 3: Transaction Log ─────────────────────────────── */}
            <Card style={{ background: "linear-gradient(to bottom, #ffffff08 0%, #141925 40%)" }} className="overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-white/[0.06] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-[14px] font-semibold text-white">Transaction Log</h2>
                  <div className="flex gap-1">
                    {(["all", "income", "expense"] as TxTab[]).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setTxTab(tab)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${
                          txTab === tab
                            ? "bg-white/[0.12] text-white"
                            : "border border-white/[0.08] text-slate-400 hover:border-white/[0.18] hover:text-slate-200"
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                  <span className={`text-[12px] font-semibold tabular-nums ${txTab === "expense" ? "text-red-400" : txTab === "income" ? "text-emerald-400" : tabTotals.all >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {txTab === "all" && tabTotals.all >= 0 && "+"}{fmt$(Math.round(tabTotals[txTab]))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition-all hover:border-white/[0.16] hover:text-slate-200">
                    <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_EXPORT} /></svg>
                    CSV
                  </button>
                  <button onClick={() => setTxModal({ kind: "addTx" })} className="rounded-md bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                </div>
              </div>

              {txnsWithRunning.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-[12px] text-slate-500">No transactions for this semester · click + Add to log one</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                        {["Date", "Category", "Description", "Method", "Amount", "Running Balance", ""].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {txnsWithRunning.map(t => (
                        <tr key={t.id} className="group transition-colors hover:bg-white/[0.02]">
                          <td className="whitespace-nowrap px-4 py-3 text-[12px] text-slate-400">{fmtDate(t.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              t.type === "income"
                                ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25"
                                : "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/25"
                            }`}>
                              {t.category}
                            </span>
                          </td>
                          <td className="max-w-[200px] px-4 py-3">
                            <p className="truncate text-[12px] text-slate-300">{t.description || "—"}</p>
                            {t.paidTo && <p className="text-[10px] text-slate-500">→ {t.paidTo}</p>}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-slate-500 capitalize">{t.paymentMethod ?? "—"}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-[13px] font-semibold tabular-nums ${t.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                            {t.type === "income" ? "+" : "-"}{fmt$(t.amount)}
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-[12px] font-medium tabular-nums ${t.running >= 0 ? "text-slate-300" : "text-red-400"}`}>
                            {fmt$(Math.round(t.running))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <IconBtn path={ICON_EDIT}  label="Edit"   onClick={() => setTxModal({ kind: "editTx", tx: t })}          className="text-slate-500 hover:bg-indigo-500/20 hover:text-indigo-400" />
                              <IconBtn path={ICON_TRASH} label="Delete" onClick={() => setDeleteModal({ kind: "tx", tx: t })}           className="text-slate-500 hover:bg-red-500/20 hover:text-red-400" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* ── Section 4: Party Events ────────────────────────────────── */}
            <Card style={{ background: "linear-gradient(to bottom, #f472b60d 0%, #141925 45%)" }} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
                <div>
                  <h2 className="text-[14px] font-semibold text-white">Party Events</h2>
                  <p className="text-[11px] text-slate-500">Door revenue · {sortedParties.length} events · {fmt$(Math.round(totalDoorRev))} total</p>
                </div>
                <button onClick={() => setPartyModal({ kind: "addParty" })} className="rounded-md bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add Event</button>
              </div>

              {sortedParties.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-[12px] text-slate-500">No events logged · click + Add Event to create one</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                        {["Name", "Date", "Door Revenue", "Attendance", "Notes", ""].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {sortedParties.map(p => (
                        <tr key={p.id} className="group transition-colors hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-[13px] font-semibold text-white">{p.name}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-[12px] text-slate-400">{fmtDate(p.date)}</td>
                          <td className="px-4 py-3 text-[13px] font-semibold tabular-nums text-pink-400">{fmt$(p.doorRevenue)}</td>
                          <td className="px-4 py-3 text-[12px] tabular-nums text-slate-400">{p.attendance}</td>
                          <td className="max-w-[240px] px-4 py-3">
                            <p className="truncate text-[12px] text-slate-500">{p.notes || "—"}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <IconBtn path={ICON_EDIT}  label="Edit"   onClick={() => setPartyModal({ kind: "editParty", event: p })}     className="text-slate-500 hover:bg-indigo-500/20 hover:text-indigo-400" />
                              <IconBtn path={ICON_TRASH} label="Delete" onClick={() => setDeleteModal({ kind: "party", event: p })}         className="text-slate-500 hover:bg-red-500/20 hover:text-red-400" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

          </div>
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {txModal && (
        <Modal
          title={txModal.kind === "addTx" ? "Add Transaction" : "Edit Transaction"}
          onClose={() => setTxModal(null)}
        >
          <TxForm
            initial={txModal.kind === "editTx" ? txModal.tx : undefined}
            onSubmit={data => txModal.kind === "addTx" ? handleAddTx(data) : handleEditTx(txModal.tx, data)}
            onCancel={() => setTxModal(null)}
          />
        </Modal>
      )}

      {partyModal && (
        <Modal
          title={partyModal.kind === "addParty" ? "Add Party Event" : "Edit Party Event"}
          onClose={() => setPartyModal(null)}
        >
          <PartyForm
            initial={partyModal.kind === "editParty" ? partyModal.event : undefined}
            onSubmit={data => partyModal.kind === "addParty" ? handleAddParty(data) : handleEditParty(partyModal.event, data)}
            onCancel={() => setPartyModal(null)}
          />
        </Modal>
      )}

      {deleteModal && (
        <Modal
          title={deleteModal.kind === "tx" ? "Delete Transaction" : "Delete Party Event"}
          onClose={() => setDeleteModal(null)}
        >
          <DeleteConfirm
            label={deleteModal.kind === "tx" ? deleteModal.tx.description || deleteModal.tx.category : deleteModal.event.name}
            onConfirm={() => deleteModal.kind === "tx" ? handleDeleteTx(deleteModal.tx) : handleDeleteParty(deleteModal.event)}
            onCancel={() => setDeleteModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
