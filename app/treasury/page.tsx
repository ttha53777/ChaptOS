"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { catColor } from "../components/treasury/TreasuryCharts";
import { Sidebar } from "../components/Sidebar";
import { UserAvatar } from "../components/UserAvatar";

const TreasuryAreaChart = dynamic(
  () => import("../components/treasury/TreasuryCharts").then(m => m.TreasuryAreaChart),
  { ssr: false, loading: () => <div className="h-[232px] animate-pulse rounded-lg bg-white/[0.03]" /> }
);
const TreasuryDonutChart = dynamic(
  () => import("../components/treasury/TreasuryCharts").then(m => m.TreasuryDonutChart),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-full bg-white/[0.03] mx-auto max-w-[260px]" /> }
);
import { Modal, FieldLabel } from "../components/dashboard/primitives";
import { inputCls } from "../components/dashboard/styles";
import { useChapter } from "../context/ChapterContext";
import {
  Transaction, PartyEvent, Brother,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS,
  fmt$, fmtDate,
} from "../data";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_SEMESTER = "SPR26";


type NavTab = "Overview" | "Breakdown" | "Transactions" | "Reports";

type TxModal =
  | { kind: "addTx" }
  | { kind: "editTx"; tx: Transaction }
  | null;

type PartyModal =
  | { kind: "addParty" }
  | { kind: "editParty"; event: PartyEvent }
  | null;

type TxTab = "all" | "income" | "expense";

import { requestJson } from "../lib/api";
import { todayStr } from "../lib/dates";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRunningBalanceData(
  txns: Transaction[],
  parties: PartyEvent[],
): { date: string; label: string; balance: number; expenses: number }[] {
  type Pt = { date: string; delta: number; expense: number };
  const pts: Pt[] = [];

  parties.forEach(p => pts.push({ date: p.date, delta: p.doorRevenue, expense: 0 }));
  txns.forEach(t =>
    pts.push({
      date: t.date,
      delta: t.type === "income" ? t.amount : -t.amount,
      expense: t.type === "expense" ? t.amount : 0,
    })
  );

  pts.sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  let expenses = 0;
  return pts.map(p => {
    running += p.delta;
    expenses += p.expense;
    const [, mm, dd] = p.date.split("-");
    return {
      date: p.date,
      label: `${mm}/${dd}`,
      balance: Math.round(running * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
    };
  });
}

function buildBiweeklyData(
  txns: Transaction[],
  parties: PartyEvent[],
): { period: string; income: number; expense: number; net: number }[] {
  function biweekKey(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
    const period = Math.floor(dayOfYear / 14);
    return `${d.getFullYear()}-${String(period).padStart(2, "0")}`;
  }

  const map = new Map<string, { income: number; expense: number }>();

  parties.forEach(p => {
    const k = biweekKey(p.date);
    const cur = map.get(k) ?? { income: 0, expense: 0 };
    map.set(k, { ...cur, income: cur.income + p.doorRevenue });
  });
  txns.forEach(t => {
    const k = biweekKey(t.date);
    const cur = map.get(k) ?? { income: 0, expense: 0 };
    if (t.type === "income")  map.set(k, { ...cur, income:  cur.income  + t.amount });
    if (t.type === "expense") map.set(k, { ...cur, expense: cur.expense + t.amount });
  });

  const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  const labels = sorted.map(([k], i) => {
    const [, p] = k.split("-");
    return `Wk ${Number(p) * 2 + 1}–${i === sorted.length - 1 ? "now" : String(Number(p) * 2 + 2)}`;
  });

  return sorted.map(([, { income, expense }], i) => ({
    period:  labels[i],
    income:  Math.round(income  * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    net:     Math.round((income - expense) * 100) / 100,
  }));
}

function topCategoriesWithOther(
  txns: Transaction[],
  maxSlices = 5,
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  txns.forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
  const sorted = Array.from(map.entries())
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length <= maxSlices) {
    return sorted.map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }
  const top = sorted.slice(0, maxSlices);
  const otherVal = sorted.slice(maxSlices).reduce((s, [, v]) => s + v, 0);
  return [
    ...top.map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })),
    { name: "Other", value: Math.round(otherVal * 100) / 100 },
  ];
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
    onSubmit({ name, date, doorRevenue: Number(doorRevenue), attendance: Number(attendance), notes, theme: "", collabOrg: "", expenses: 0, partyType: initial?.partyType ?? "Open", completed: initial?.completed ?? false, completedAt: initial?.completedAt ?? null });
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

// ─── Small primitives ─────────────────────────────────────────────────────────

function IconBtn({ path, label, className, onClick }: { path: string; label: string; className?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${className ?? ""}`}>
      <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </button>
  );
}

// Round pill icon button used in the header
function TreasuryIconButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-slate-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white"
    >
      {children}
    </button>
  );
}

// Finance card — dark rounded card with very subtle top gradient
function FinanceCard({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-[20px] border border-white/[0.07] ${className ?? ""}`}
      style={{
        background: "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, #10121a 50%)",
        boxShadow: "0 1px 1px rgba(0,0,0,0.5), 0 8px 20px -10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Compact label
function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{children}</p>;
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const ICON_EDIT   = "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z";
const ICON_TRASH  = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";
const ICON_EXPORT = "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4";
const ICON_PLUS   = "M12 4v16m8-8H4";
const ICON_MENU   = "M4 6h16M4 12h16M4 18h16";
const ICON_PARTY  = "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  const { treasuryData, transactionList, setTransactionList, partyList, setPartyList, brotherList, setBrotherList } = useChapter();

  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [semester,      setSemester]      = useState(CURRENT_SEMESTER);
  const [navTab,        setNavTab]        = useState<NavTab>("Overview");
  const [chartRange,    setChartRange]    = useState<"2W"|"1M"|"3M"|"YTD"|"ALL">("ALL");
  const [txTab,         setTxTab]         = useState<TxTab>("all");
  const [donutMode,     setDonutMode]     = useState<"expense" | "income">("expense");
  const [txModal,       setTxModal]       = useState<TxModal>(null);
  const [partyModal,    setPartyModal]    = useState<PartyModal>(null);
  const [deleteModal,   setDeleteModal]   = useState<{ kind: "tx"; tx: Transaction } | { kind: "party"; event: PartyEvent } | null>(null);
  const [mutErr,        setMutErr]        = useState<string | null>(null);
  const [duesTarget,    setDuesTarget]    = useState<Brother | null>(null);
  const [duesAction,    setDuesAction]    = useState<"assign" | "deduct">("deduct");
  const [duesAmountStr, setDuesAmountStr] = useState("");

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

  const txnsWithRunning = useMemo(() => {
    // Build running balance from ALL active txns so filtered views show the real balance at each date
    const sorted = [...activeTxns].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    const balanceMap = new Map<number, number>();
    sorted.forEach(t => {
      running += t.type === "income" ? t.amount : -t.amount;
      balanceMap.set(t.id, running);
    });
    return visibleTxns
      .map(t => ({ ...t, running: balanceMap.get(t.id) ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeTxns, visibleTxns]);

  const semesters = useMemo(() => {
    const seen = new Set<string>();
    transactionList.forEach(t => { if (t.semester) seen.add(t.semester); });
    seen.add(CURRENT_SEMESTER);
    return Array.from(seen).sort();
  }, [transactionList]);

  // Filter parties to the selected semester's year (PartyEvent has no semester field, so match by year)
  const filteredParties = useMemo(() => {
    if (!semester) return partyList;
    const year = "20" + semester.slice(-2);
    return partyList.filter(p => p.date.startsWith(year));
  }, [partyList, semester]);

  // Running cumulative balance chart
  const runningData = useMemo(
    () => buildRunningBalanceData(activeTxns, filteredParties),
    [activeTxns, filteredParties]
  );

  // Biweekly summary
  const biweeklyData = useMemo(
    () => buildBiweeklyData(activeTxns, filteredParties),
    [activeTxns, filteredParties]
  );

  // Latest biweekly vs previous — used in hero chip
  const bwLatest   = biweeklyData[biweeklyData.length - 1];
  const bwPrevious = biweeklyData[biweeklyData.length - 2];
  const bwDelta    = bwLatest && bwPrevious ? bwLatest.net - bwPrevious.net : null;

  // Slice running balance data by selected chart range
  const filteredRunningData = useMemo(() => {
    if (chartRange === "ALL" || runningData.length === 0) return runningData;
    const cutoff = new Date();
    if (chartRange === "2W") cutoff.setDate(cutoff.getDate() - 14);
    else if (chartRange === "1M") cutoff.setMonth(cutoff.getMonth() - 1);
    else if (chartRange === "3M") cutoff.setMonth(cutoff.getMonth() - 3);
    else if (chartRange === "YTD") cutoff.setMonth(0, 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;
    const sliced = runningData.filter(d => d.date >= cutoffStr);
    return sliced.length > 0 ? sliced : runningData;
  }, [runningData, chartRange]);

  // Donut data
  const donutData = useMemo(
    () => topCategoriesWithOther(donutMode === "expense" ? expenseTxns : incomeTxns),
    [donutMode, expenseTxns, incomeTxns]
  );
  const donutTotal = donutMode === "expense" ? totalExpenses : totalIncome;

  const totalDoorRev  = filteredParties.reduce((s, p) => s + p.doorRevenue, 0);

  // Latest 5 non-deleted transactions
  const latest5 = useMemo(
    () => transactionList.filter(t => !t.deletedAt).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [transactionList]
  );

  const brothersOwing = useMemo(
    () => [...brotherList].sort((a, b) => b.duesOwed - a.duesOwed),
    [brotherList]
  );

  // Upcoming: future-dated transactions + upcoming party events
  const today = todayStr();
  const upcomingParties = [...partyList]
    .filter(p => p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const upcomingTxns = transactionList
    .filter(t => !t.deletedAt && t.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const tabTotals: Record<TxTab, number> = {
    all:     activeTxns.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
    income:  totalIncome,
    expense: totalExpenses,
  };

  // ── Mutations: Transactions ───────────────────────────────────────────────

  const handleAddTx = useCallback(async (data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">) => {
    const optimisticId = -Date.now();
    const optimistic: Transaction = { ...data, id: optimisticId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setTransactionList(prev => [optimistic, ...prev]);
    setTxModal(null);
    setMutErr(null);
    try {
      const saved = await requestJson<Transaction>("/api/transactions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
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
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
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
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
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
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
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

  function handleExport() {
    const url = semester ? `/api/transactions/export?semester=${semester}` : "/api/transactions/export";
    window.location.href = url;
  }

  function submitDuesAction() {
    if (!duesTarget) return;
    const amount = Math.max(0, parseFloat(duesAmountStr) || 0);
    if (amount === 0) return;
    const newOwed = duesAction === "assign"
      ? duesTarget.duesOwed + amount
      : Math.max(0, duesTarget.duesOwed - amount);
    const b = duesTarget;
    setDuesTarget(null);
    setDuesAmountStr("");
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, duesOwed: newOwed } : x));
    requestJson<Brother>(`/api/brothers/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duesOwed: newOwed }),
    }).catch(() => {
      setBrotherList(prev => prev.map(x => x.id === b.id ? b : x));
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // Compute balance live from local state so it updates immediately after add/edit/delete
  const balance   = totalIncome - totalExpenses + totalDoorRev;
  const projected = Math.round(balance * 1.3);

  const NAV_TABS: NavTab[] = ["Overview", "Breakdown", "Transactions", "Reports"];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#07090f" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Treasury" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="relative z-10 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.05] px-5 sm:px-7"
          style={{ background: "rgba(7,9,15,0.85)", backdropFilter: "saturate(140%) blur(12px)", WebkitBackdropFilter: "saturate(140%) blur(12px)" }}>
          <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] lg:hidden">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_MENU} />
            </svg>
          </button>

          {/* Title */}
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold leading-tight text-white">Treasury</h1>
            <p className="text-[11px] leading-tight text-slate-500">Lambda Phi Epsilon · Financial Overview</p>
          </div>

          {/* Semester pill */}
          <div className="hidden items-center gap-1.5 sm:flex">
            {semesters.map(s => (
              <button
                key={s}
                onClick={() => setSemester(s)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                  semester === s
                    ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
                    : "border border-white/[0.07] text-slate-500 hover:border-white/[0.14] hover:text-slate-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <TreasuryIconButton onClick={handleExport} title="Export CSV">
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_EXPORT} />
              </svg>
            </TreasuryIconButton>
            <TreasuryIconButton onClick={() => setPartyModal({ kind: "addParty" })} title="Add Party Event">
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PARTY} />
              </svg>
            </TreasuryIconButton>
            <button
              onClick={() => setTxModal({ kind: "addTx" })}
              className="flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-white/[0.04] px-3.5 text-[12px] font-semibold text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_-18px_rgba(99,102,241,0.45)] transition-all hover:border-indigo-400/35 hover:bg-indigo-500/[0.08] hover:text-white"
            >
              <svg className="h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PLUS} />
              </svg>
              <span className="hidden sm:inline">Add Transaction</span>
            </button>
          </div>
          <UserAvatar />
        </header>

        {/* ── Nav tabs ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.05] px-5 sm:px-7"
          style={{ background: "rgba(7,9,15,0.6)" }}>
          {NAV_TABS.map(tab => (
            tab === "Transactions" ? (
              <Link
                key={tab}
                href="/treasury/transactions"
                className="relative py-3.5 px-3 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-300"
              >
                {tab}
              </Link>
            ) : (
              <button
                key={tab}
                onClick={() => setNavTab(tab)}
                className={`relative py-3.5 px-3 text-[12px] font-medium transition-colors ${
                  navTab === tab ? "text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab === "Breakdown" ? "Breakdown & Budget" : tab}
                {navTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-indigo-400" />
                )}
              </button>
              )
          ))}
        </div>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto" style={{ background: "#07090f" }}>
          <div className="mx-auto max-w-[1440px] px-5 py-6 sm:px-7">

            {/* Error toast */}
            {mutErr && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                <p className="text-[13px] text-red-300">{mutErr}</p>
                <button onClick={() => setMutErr(null)} className="ml-4 text-[11px] text-red-400 hover:text-red-200">Dismiss</button>
              </div>
            )}

            {/* ── Hero row: Balance chart (8) + Donut (4) ─────────────────── */}
            <div className={`grid grid-cols-1 gap-4 ${navTab === "Overview" || navTab === "Breakdown" ? "lg:grid-cols-12" : "lg:grid-cols-1"}`}>

              {/* ── Hero Balance Card ──────────────────────────────────────── */}
              <FinanceCard className={`flex flex-col overflow-hidden ${navTab === "Overview" || navTab === "Breakdown" ? "lg:col-span-8" : "lg:col-span-12"}`}>
                {/* Card header */}
                <div className="flex items-start justify-between px-6 pt-5 pb-1">
                  <div>
                    <CardLabel>Treasury Balance</CardLabel>
                    <div className="mt-2 flex items-end gap-3">
                      <p className={`text-[44px] font-light leading-none tracking-tight tabular-nums ${balance >= 0 ? "text-white" : "text-red-400"}`}>
                        {fmt$(Math.round(balance))}
                      </p>
                      {bwDelta !== null && (
                        <span className={`mb-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${bwDelta >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                          {bwDelta >= 0 ? "+" : ""}{fmt$(Math.round(bwDelta))} biweekly
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500">
                      {semester} · Projected <span className="text-slate-400">{fmt$(Math.round(projected))}</span>
                    </p>
                  </div>
                  {/* Range selector */}
                  <div className="hidden items-center gap-0.5 sm:flex">
                    {(["2W","1M","3M","YTD","ALL"] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          chartRange === r
                            ? "bg-indigo-500/15 text-indigo-300"
                            : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-300"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* KPI mini-row */}
                <div className="mx-6 mt-4 mb-2 grid grid-cols-2 divide-x divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="px-4 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Income</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-emerald-400">{fmt$(Math.round(totalIncome))}</p>
                    <p className="text-[10px] text-slate-600">{incomeTxns.length} txns</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Expenses</p>
                    <p className="mt-1 text-[18px] font-semibold tabular-nums text-red-400">{fmt$(Math.round(totalExpenses))}</p>
                    <p className="text-[10px] text-slate-600">{expenseTxns.length} txns</p>
                  </div>
                </div>

                {/* Area + Biweekly charts */}
                <TreasuryAreaChart
                  data={filteredRunningData}
                  biweeklyData={biweeklyData}
                  semester={semester}
                />
              </FinanceCard>

              {/* ── Category Donut Card ────────────────────────────────────── */}
              {(navTab === "Overview" || navTab === "Breakdown") && <FinanceCard className="flex flex-col overflow-hidden lg:col-span-4">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <CardLabel>Category Breakdown</CardLabel>
                  <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
                    {(["expense", "income"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setDonutMode(m)}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-all ${
                          donutMode === m
                            ? "bg-white/[0.10] text-white"
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {m.charAt(0).toUpperCase() + m.slice(1)}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Donut chart */}
                {donutData.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center py-10">
                    <p className="text-[12px] text-slate-600">No {donutMode} data</p>
                  </div>
                ) : (
                  <>
                    {/* Chart area */}
                    <div className="relative mx-auto w-full max-w-[260px]">
                      <TreasuryDonutChart data={donutData} />

                      {/* Center label — sits inside the hole */}
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                          {donutMode === "expense" ? "Expenses" : "Income"}
                        </p>
                        <p className="text-[24px] font-semibold tabular-nums leading-none text-white">
                          {fmt$(Math.round(donutTotal))}
                        </p>
                        <p className="text-[10px] text-slate-600">
                          {donutData.length} {donutData.length === 1 ? "category" : "categories"}
                        </p>
                      </div>
                    </div>

                    {/* Category list */}
                    <div className="flex-1 overflow-y-auto px-5 pb-5">
                      <div className="space-y-3">
                        {donutData.map((entry, index) => {
                          const pct = donutTotal > 0 ? (entry.value / donutTotal) * 100 : 0;
                          const color = catColor(entry.name, index);
                          return (
                            <div key={entry.name} className="flex items-center gap-3">
                              {/* Rank */}
                              <span className="w-4 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-600">
                                {index + 1}
                              </span>
                              {/* Color swatch */}
                              <div
                                className="h-[28px] w-[4px] shrink-0 rounded-full"
                                style={{ background: color }}
                              />
                              {/* Name + bar + amount */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between mb-1">
                                  <p className="truncate text-[12px] font-medium text-slate-300 leading-none">{entry.name}</p>
                                  <div className="ml-2 flex shrink-0 items-baseline gap-1.5">
                                    <span className="text-[10px] text-slate-600 tabular-nums">{pct.toFixed(1)}%</span>
                                    <span className="text-[13px] font-semibold tabular-nums text-white">{fmt$(Math.round(entry.value))}</span>
                                  </div>
                                </div>
                                {/* Progress track */}
                                <div className="h-[4px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${pct}%`,
                                      background: color,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </FinanceCard>}

            </div>{/* end hero grid */}

            {/* ── Bottom row: Latest, Upcoming, Reports ── Overview only ────── */}
            {navTab === "Overview" && <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">

              {/* ── Brothers with Dues ───────────────────────────────────── */}
              <FinanceCard className="lg:col-span-5">
                <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
                  <div>
                    <h2 className="text-[14px] font-semibold text-white">Brothers with Dues</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {brotherList.filter(b => b.duesOwed > 0).length} owing · {fmt$(brotherList.reduce((s, b) => s + b.duesOwed, 0))} total
                    </p>
                  </div>
                </div>
                {brothersOwing.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-[12px] text-slate-600">No brothers yet</p>
                  </div>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto divide-y divide-white/[0.04]">
                    {brothersOwing.map(b => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-bold text-slate-400">
                          {b.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-slate-200">{b.name}</p>
                          <p className="text-[10px] text-slate-500">{b.role}</p>
                        </div>
                        {b.duesOwed > 0
                          ? <span className="shrink-0 tabular-nums text-[14px] font-semibold text-amber-400">{fmt$(b.duesOwed)}</span>
                          : <span className="shrink-0 tabular-nums text-[13px] text-slate-600">—</span>
                        }
                        <div className="flex items-center gap-1">
                          {b.duesOwed > 0 && (
                            <button
                              onClick={() => { setDuesTarget(b); setDuesAction("deduct"); setDuesAmountStr(String(b.duesOwed)); }}
                              className="rounded-md bg-indigo-500/15 px-2 py-1 text-[11px] font-semibold text-indigo-400 ring-1 ring-inset ring-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
                            >
                              Pay
                            </button>
                          )}
                          <button
                            onClick={() => { setDuesTarget(b); setDuesAction("assign"); setDuesAmountStr(""); }}
                            className="rounded-md bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-slate-400 ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.10] transition-colors"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </FinanceCard>

              {/* ── Upcoming ──────────────────────────────────────────────── */}
              <FinanceCard className="lg:col-span-4">
                <div className="border-b border-white/[0.05] px-5 py-4">
                  <h2 className="text-[14px] font-semibold text-white">Upcoming</h2>
                  <p className="text-[11px] text-slate-500">Future events & transactions</p>
                </div>
                {upcomingParties.length === 0 && upcomingTxns.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-[12px] text-slate-600">No upcoming treasury items</p>
                    <button onClick={() => setPartyModal({ kind: "addParty" })} className="mt-3 text-[11px] text-indigo-400 hover:text-indigo-300">
                      + Schedule an event
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {upcomingParties.map(p => (
                      <div key={`party-${p.id}`} className="group flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02]">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500/15">
                          <svg className="h-4 w-4 text-pink-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PARTY} />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-slate-200">{p.name}</p>
                          <p className="text-[10px] text-slate-500">{fmtDate(p.date)} · Party event</p>
                        </div>
                        <p className="shrink-0 text-[13px] font-semibold tabular-nums text-pink-400">
                          {fmt$(p.doorRevenue)}
                        </p>
                      </div>
                    ))}
                    {upcomingTxns.map(t => (
                      <div key={`tx-${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02]">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          t.type === "income" ? "bg-emerald-500/15" : "bg-red-500/15"
                        }`}>
                          <span className={`text-[11px] font-bold ${t.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                            {t.category.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-slate-200">{t.description || t.category}</p>
                          <p className="text-[10px] text-slate-500">{fmtDate(t.date)}</p>
                        </div>
                        <p className={`shrink-0 text-[13px] font-semibold tabular-nums ${t.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                          {t.type === "income" ? "+" : "-"}{fmt$(t.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </FinanceCard>

              {/* ── Reports ───────────────────────────────────────────────── */}
              <FinanceCard className="flex flex-col lg:col-span-3">
                <div className="border-b border-white/[0.05] px-5 py-4">
                  <h2 className="text-[14px] font-semibold text-white">Reports</h2>
                  <p className="text-[11px] text-slate-500">{semester} summary</p>
                </div>
                <div className="flex flex-1 flex-col gap-3 px-5 py-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">Total Income</p>
                      <p className="text-[13px] font-semibold tabular-nums text-emerald-400">{fmt$(Math.round(totalIncome))}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">Total Expenses</p>
                      <p className="text-[13px] font-semibold tabular-nums text-red-400">{fmt$(Math.round(totalExpenses))}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">Door Revenue</p>
                      <p className="text-[13px] font-semibold tabular-nums text-pink-400">{fmt$(Math.round(totalDoorRev))}</p>
                    </div>
                    <div className="my-1 border-t border-white/[0.06]" />
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-slate-400">Net Balance</p>
                      <p className={`text-[14px] font-bold tabular-nums ${balance >= 0 ? "text-indigo-400" : "text-red-400"}`}>{fmt$(Math.round(balance))}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">Projected</p>
                      <p className="text-[13px] tabular-nums text-slate-400">{fmt$(Math.round(projected))}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-500">Party Events</p>
                      <p className="text-[13px] tabular-nums text-slate-400">{partyList.length}</p>
                    </div>
                  </div>
                  <div className="mt-auto pt-2">
                    <button
                      onClick={handleExport}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 text-[12px] font-medium text-slate-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
                    >
                      <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_EXPORT} />
                      </svg>
                      Export CSV
                    </button>
                  </div>
                </div>
              </FinanceCard>
            </div>}{/* end Overview bottom row */}

            {/* ── Full Transaction Log ── Overview + Transactions tabs ────── */}
            {(navTab === "Overview" || navTab === "Transactions") && <FinanceCard className="mt-4 overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-white/[0.05] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-[14px] font-semibold text-white">Transaction Log</h2>
                  <div className="flex gap-1">
                    {(["all", "income", "expense"] as TxTab[]).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setTxTab(tab)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                          txTab === tab
                            ? "bg-white/[0.10] text-white"
                            : "border border-white/[0.07] text-slate-500 hover:border-white/[0.14] hover:text-slate-200"
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
                  <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-all hover:border-white/[0.14] hover:text-slate-200">
                    <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_EXPORT} /></svg>
                    CSV
                  </button>
                  <button onClick={() => setTxModal({ kind: "addTx" })} className="rounded-lg bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                </div>
              </div>

              {txnsWithRunning.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-[12px] text-slate-600">No transactions for this semester · click + Add to log one</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-white/[0.05] bg-white/[0.015]">
                        {["Date", "Category", "Description", "Method", "Amount", "Running Balance", ""].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {txnsWithRunning.map(t => (
                        <tr key={t.id} className="group transition-colors hover:bg-white/[0.02]">
                          <td className="whitespace-nowrap px-4 py-3 text-[12px] text-slate-500">{fmtDate(t.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              t.type === "income"
                                ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
                                : "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20"
                            }`}>
                              {t.category}
                            </span>
                          </td>
                          <td className="max-w-[200px] px-4 py-3">
                            <p className="truncate text-[12px] text-slate-300">{t.description || "—"}</p>
                            {t.paidTo && <p className="text-[10px] text-slate-600">→ {t.paidTo}</p>}
                          </td>
                          <td className="px-4 py-3 text-[12px] capitalize text-slate-600">{t.paymentMethod ?? "—"}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-[13px] font-semibold tabular-nums ${t.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                            {t.type === "income" ? "+" : "-"}{fmt$(t.amount)}
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-[12px] font-medium tabular-nums ${t.running >= 0 ? "text-slate-400" : "text-red-400"}`}>
                            {fmt$(Math.round(t.running))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <IconBtn path={ICON_EDIT}  label="Edit"   onClick={() => setTxModal({ kind: "editTx", tx: t })}      className="text-slate-600 hover:bg-indigo-500/20 hover:text-indigo-400" />
                              <IconBtn path={ICON_TRASH} label="Delete" onClick={() => setDeleteModal({ kind: "tx", tx: t })}      className="text-slate-600 hover:bg-red-500/20 hover:text-red-400" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </FinanceCard>}

            {/* ── Party Events ── Overview + Breakdown tabs ────────────────── */}
            {(navTab === "Overview" || navTab === "Breakdown") && (() => {
              const sortedParties = [...partyList].sort((a, b) => b.date.localeCompare(a.date));
              const totalDoorRev  = partyList.reduce((s, p) => s + p.doorRevenue, 0);
              return (
                <FinanceCard className="mt-4 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
                    <div>
                      <h2 className="text-[14px] font-semibold text-white">Party Events</h2>
                      <p className="text-[11px] text-slate-500">Door revenue · {sortedParties.length} events · {fmt$(Math.round(totalDoorRev))} total</p>
                    </div>
                    <button onClick={() => setPartyModal({ kind: "addParty" })} className="rounded-lg bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add Event</button>
                  </div>
                  {sortedParties.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <p className="text-[12px] text-slate-600">No events logged · click + Add Event to create one</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-white/[0.05] bg-white/[0.015]">
                            {["Name", "Date", "Door Revenue", "Attendance", "Notes", ""].map(h => (
                              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {sortedParties.map(p => (
                            <tr key={p.id} className="group transition-colors hover:bg-white/[0.02]">
                              <td className="px-4 py-3 text-[13px] font-semibold text-white">{p.name}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-[12px] text-slate-500">{fmtDate(p.date)}</td>
                              <td className="px-4 py-3 text-[13px] font-semibold tabular-nums text-pink-400">{fmt$(p.doorRevenue)}</td>
                              <td className="px-4 py-3 text-[12px] tabular-nums text-slate-500">{p.attendance}</td>
                              <td className="max-w-[240px] px-4 py-3">
                                <p className="truncate text-[12px] text-slate-600">{p.notes || "—"}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  <IconBtn path={ICON_EDIT}  label="Edit"   onClick={() => setPartyModal({ kind: "editParty", event: p })} className="text-slate-600 hover:bg-indigo-500/20 hover:text-indigo-400" />
                                  <IconBtn path={ICON_TRASH} label="Delete" onClick={() => setDeleteModal({ kind: "party", event: p })}   className="text-slate-600 hover:bg-red-500/20 hover:text-red-400" />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FinanceCard>
              );
            })()}

            {/* ── Reports tab: full-width summary ──────────────────────────── */}
            {navTab === "Reports" && (
              <FinanceCard className="mt-4 flex flex-col gap-3 p-6">
                <h2 className="text-[14px] font-semibold text-white">Semester Report — {semester}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Total Income",   value: fmt$(Math.round(totalIncome)),   color: "text-emerald-400" },
                    { label: "Total Expenses", value: fmt$(Math.round(totalExpenses)), color: "text-red-400" },
                    { label: "Door Revenue",   value: fmt$(Math.round(totalDoorRev)),  color: "text-pink-400" },
                    { label: "Net Balance",    value: fmt$(Math.round(balance)),       color: balance >= 0 ? "text-indigo-400" : "text-red-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                      <p className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div>
                    <p className="text-[11px] text-slate-500">Projected end-of-semester</p>
                    <p className="text-[20px] font-semibold tabular-nums text-slate-300">{fmt$(Math.round(projected))}</p>
                  </div>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[12px] font-medium text-slate-400 transition-all hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
                  >
                    <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_EXPORT} />
                    </svg>
                    Export CSV
                  </button>
                </div>
              </FinanceCard>
            )}

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

      {duesTarget && (
        <Modal
          title={duesAction === "deduct" ? "Record Payment" : "Assign Dues"}
          onClose={() => setDuesTarget(null)}
        >
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-slate-400 mb-3">
                {duesTarget.name} currently owes{" "}
                <span className="font-semibold text-amber-400">{fmt$(duesTarget.duesOwed)}</span>
              </p>
              <FieldLabel>{duesAction === "deduct" ? "Amount Paid ($)" : "Amount to Assign ($)"}</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={duesAmountStr}
                onChange={e => setDuesAmountStr(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") submitDuesAction(); }}
              />
              {(() => {
                const amt = parseFloat(duesAmountStr) || 0;
                if (amt <= 0) return null;
                const newOwed = duesAction === "assign"
                  ? duesTarget.duesOwed + amt
                  : Math.max(0, duesTarget.duesOwed - amt);
                return (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    New balance:{" "}
                    <span className={newOwed === 0 ? "text-indigo-400 font-semibold" : "text-slate-300"}>
                      {fmt$(newOwed)}
                    </span>
                  </p>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDuesTarget(null)}
                className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitDuesAction}
                disabled={!(parseFloat(duesAmountStr) > 0)}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {duesAction === "deduct" ? "Record Payment" : "Assign Dues"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
