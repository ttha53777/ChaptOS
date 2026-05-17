"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Sidebar } from "../../components/Sidebar";
import { Modal, FieldLabel, ConfirmDialog } from "../../components/dashboard/primitives";
import { inputCls } from "../../components/dashboard/styles";
import { useChapter } from "../../context/ChapterContext";
import {
  Transaction,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  fmt$,
  fmtDate,
} from "../../data";

const CURRENT_SEMESTER = "SPR26";
const ICON_EDIT   = "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z";
const ICON_TRASH  = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";
const ICON_EXPORT = "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4";
const ICON_PLUS   = "M12 4v16m8-8H4";
const ICON_MENU   = "M4 6h16M4 12h16M4 18h16";

type TxTab = "all" | "income" | "expense";
type TxModal = { kind: "addTx" } | { kind: "editTx"; tx: Transaction } | null;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function FinanceCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[24px] border border-white/[0.06] bg-[#101216] shadow-[0_8px_30px_rgba(0,0,0,0.22)] ${className}`}
      style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, #101216 42%)" }}
    >
      {children}
    </div>
  );
}

function IconBtn({ path, label, className, onClick }: { path: string; label: string; className?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${className ?? ""}`}>
      <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </button>
  );
}

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
    onSubmit({
      type,
      category,
      amount: Number(amount),
      date,
      description,
      paymentMethod: paymentMethod || undefined,
      paidTo: paidTo || undefined,
      semester: semester || undefined,
    });
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
            <option value="">Select...</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Amount</FieldLabel>
          <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <FieldLabel>Date</FieldLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputCls} />
        </div>
      </div>
      <div>
        <FieldLabel>Description</FieldLabel>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} required placeholder="What was this for?" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Payment Method</FieldLabel>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
            <option value="">None</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
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
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors">Cancel</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
          {initial?.id ? "Save Changes" : "Add Transaction"}
        </button>
      </div>
    </form>
  );
}


export default function TreasuryTransactionsPage() {
  const { transactionList, setTransactionList } = useChapter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [txTab, setTxTab] = useState<TxTab>("all");
  const [txModal, setTxModal] = useState<TxModal>(null);
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [mutErr, setMutErr] = useState<string | null>(null);

  const activeTxns = useMemo(
    () => transactionList.filter(t => !t.deletedAt).sort((a, b) => b.date.localeCompare(a.date)),
    [transactionList]
  );
  const incomeTxns  = useMemo(() => activeTxns.filter(t => t.type === "income"), [activeTxns]);
  const expenseTxns = useMemo(() => activeTxns.filter(t => t.type === "expense"), [activeTxns]);
  const visibleTxns = txTab === "income" ? incomeTxns : txTab === "expense" ? expenseTxns : activeTxns;

  const txnsWithRunning = useMemo(() => {
    const sorted = [...visibleTxns].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return sorted.map(t => {
      running += t.type === "income" ? t.amount : -t.amount;
      return { ...t, running };
    }).reverse();
  }, [visibleTxns]);

  const tabTotals: Record<TxTab, number> = {
    all: activeTxns.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
    income: incomeTxns.reduce((s, t) => s + t.amount, 0),
    expense: expenseTxns.reduce((s, t) => s + t.amount, 0),
  };

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
    setDeleteTx(null);
    setMutErr(null);
    try {
      await requestJson<void>(`/api/transactions/${tx.id}`, { method: "DELETE" });
    } catch {
      setTransactionList(prev => [tx, ...prev]);
      setMutErr("Failed to delete transaction. It was restored.");
    }
  }, [setTransactionList]);

  function handleExport() {
    window.location.href = "/api/transactions/export";
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#07090f" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Treasury" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="relative z-10 flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.05] px-5 sm:px-7"
          style={{ background: "rgba(7,9,15,0.85)", backdropFilter: "saturate(140%) blur(12px)", WebkitBackdropFilter: "saturate(140%) blur(12px)" }}
        >
          <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] lg:hidden">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_MENU} />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold leading-tight text-white">Transactions</h1>
            <p className="text-[11px] leading-tight text-slate-500">All treasury income and expenses</p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="flex h-8 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] font-medium text-slate-400 transition-all hover:border-white/[0.16] hover:text-slate-200">
              <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_EXPORT} />
              </svg>
              CSV
            </button>
            <button onClick={() => setTxModal({ kind: "addTx" })} className="flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-white/[0.04] px-3.5 text-[12px] font-semibold text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_-18px_rgba(99,102,241,0.45)] transition-all hover:border-indigo-400/35 hover:bg-indigo-500/[0.08] hover:text-white">
              <svg className="h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PLUS} />
              </svg>
              <span className="hidden sm:inline">Add Transaction</span>
            </button>
          </div>
        </header>

        <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.05] px-5 sm:px-7" style={{ background: "rgba(7,9,15,0.6)" }}>
          <Link href="/treasury" className="relative py-3.5 px-3 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-300">Overview</Link>
          <Link href="/treasury" className="relative py-3.5 px-3 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-300">Breakdown & Budget</Link>
          <span className="relative py-3.5 px-3 text-[12px] font-medium text-white">
            Transactions
            <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-indigo-400" />
          </span>
          <Link href="/treasury" className="relative py-3.5 px-3 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-300">Reports</Link>
        </div>

        <main className="flex-1 overflow-y-auto" style={{ background: "#07090f" }}>
          <div className="mx-auto max-w-[1440px] px-5 py-6 sm:px-7">
            {mutErr && (
              <div className="mb-4 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                <p className="text-[13px] text-red-300">{mutErr}</p>
                <button onClick={() => setMutErr(null)} className="ml-4 text-[11px] text-red-400 hover:text-red-200">Dismiss</button>
              </div>
            )}

            <FinanceCard className="overflow-hidden">
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
                <p className="text-[11px] text-slate-600">{visibleTxns.length} transactions</p>
              </div>

              {txnsWithRunning.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-[12px] text-slate-600">No transactions yet. Click Add Transaction to log one.</p>
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
                          <td className="max-w-[240px] px-4 py-3">
                            <p className="truncate text-[12px] text-slate-300">{t.description || "-"}</p>
                            {t.paidTo && <p className="text-[10px] text-slate-600">-&gt; {t.paidTo}</p>}
                          </td>
                          <td className="px-4 py-3 text-[12px] capitalize text-slate-600">{t.paymentMethod ?? "-"}</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-[13px] font-semibold tabular-nums ${t.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                            {t.type === "income" ? "+" : "-"}{fmt$(t.amount)}
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-[12px] font-medium tabular-nums ${t.running >= 0 ? "text-slate-400" : "text-red-400"}`}>
                            {fmt$(Math.round(t.running))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <IconBtn path={ICON_EDIT}  label="Edit"   onClick={() => setTxModal({ kind: "editTx", tx: t })} className="text-slate-600 hover:bg-indigo-500/20 hover:text-indigo-400" />
                              <IconBtn path={ICON_TRASH} label="Delete" onClick={() => setDeleteTx(t)} className="text-slate-600 hover:bg-red-500/20 hover:text-red-400" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </FinanceCard>
          </div>
        </main>
      </div>

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

      {deleteTx && (
        <ConfirmDialog
          title="Delete Transaction"
          message={<>Delete <span className="font-semibold text-white">{deleteTx.description || deleteTx.category}</span>? This cannot be undone.</>}
          onConfirm={() => { handleDeleteTx(deleteTx); }}
          onCancel={() => setDeleteTx(null)}
        />
      )}
    </div>
  );
}
