"use client";

import React, { useState } from "react";
import { FieldLabel } from "../dashboard/primitives";
import { inputCls } from "../dashboard/styles";
import { Transaction, INCOME_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../../data";
import { todayStr } from "../../lib/dates";
import { useVocab } from "../../hooks/useVocab";

const CURRENT_SEMESTER = "SPR26";

export type TxFormSubmit = (data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">) => void;

const ICON_SCHEDULE = "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";

export function TxForm({
  initial,
  onSubmit,
  onCancel,
  lockType,
}: {
  initial?: Partial<Transaction>;
  onSubmit: TxFormSubmit;
  onCancel: () => void;
  /** When set, the Type select is hidden and locked to this value. Used by the dashboard's "Log Expense" quick action. */
  lockType?: "income" | "expense";
}) {
  const [type,          setType]          = useState<"income" | "expense">(lockType ?? initial?.type ?? "expense");
  const [category,      setCategory]      = useState(initial?.category ?? "");
  const [amount,        setAmount]        = useState(String(initial?.amount ?? ""));
  const [date,          setDate]          = useState(initial?.date ?? todayStr());
  const [description,   setDescription]   = useState(initial?.description ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "");
  const [paidTo,        setPaidTo]        = useState(initial?.paidTo ?? "");
  const [semester,      setSemester]      = useState(initial?.semester ?? CURRENT_SEMESTER);
  const [status,        setStatus]        = useState<"posted" | "scheduled">(
    (initial?.status as "posted" | "scheduled") ?? "posted"
  );
  const v = useVocab();

  const isFutureDate = date > todayStr();

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function handleDateChange(newDate: string) {
    setDate(newDate);
    if (newDate > todayStr()) {
      setStatus("scheduled");
    } else {
      setStatus("posted");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ type, category, amount: Number(amount), date, description, paymentMethod: paymentMethod || undefined, paidTo: paidTo || undefined, semester: semester || undefined, status });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!lockType && (
          <div>
            <FieldLabel>Type</FieldLabel>
            <select value={type} onChange={e => { setType(e.target.value as "income" | "expense"); setCategory(""); }} className={inputCls}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
        )}
        <div className={lockType ? "sm:col-span-2" : undefined}>
          <FieldLabel>Category</FieldLabel>
          <select value={category} onChange={e => setCategory(e.target.value)} required className={inputCls}>
            <option value="">Select…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Amount ($)</FieldLabel>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <FieldLabel>Date</FieldLabel>
          <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} required className={inputCls} />
        </div>
      </div>
      {type === "expense" && isFutureDate && (
        <button
          type="button"
          onClick={() => setStatus(s => s === "scheduled" ? "posted" : "scheduled")}
          className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
            status === "scheduled"
              ? "border-amber-500/30 bg-amber-500/[0.07]"
              : "border-white/[0.07] bg-white/[0.03] hover:border-white/[0.14]"
          }`}
        >
          <span className={`relative flex h-4 w-7 shrink-0 rounded-full transition-colors ${status === "scheduled" ? "bg-amber-500/70" : "bg-white/[0.12]"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${status === "scheduled" ? "translate-x-3" : "translate-x-0.5"}`} />
          </span>
          <span className="text-[12px] text-slate-400">
            Mark as{" "}
            <span className={status === "scheduled" ? "font-semibold text-amber-400" : "text-slate-400"}>scheduled</span>
            {status === "scheduled" ? " — not yet paid" : " (mark when not yet paid)"}
          </span>
          <svg className={`ml-auto h-3.5 w-3.5 shrink-0 ${status === "scheduled" ? "text-amber-400" : "text-slate-600"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_SCHEDULE} />
          </svg>
        </button>
      )}
      <div>
        <FieldLabel>Description</FieldLabel>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Asia Night door cut" className={inputCls} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Payment Method</FieldLabel>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>{v("Period")}</FieldLabel>
          <input type="text" value={semester} onChange={e => setSemester(e.target.value)} placeholder="SPR26" className={inputCls} />
        </div>
      </div>
      {type === "expense" && (
        <div>
          <FieldLabel>Paid To</FieldLabel>
          <input type="text" value={paidTo} onChange={e => setPaidTo(e.target.value)} placeholder={`${v("Member")} name`} className={inputCls} />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors">Cancel</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
          {initial?.id ? "Save Changes" : (lockType === "expense" ? "Log Expense" : lockType === "income" ? "Log Revenue" : "Add Transaction")}
        </button>
      </div>
    </form>
  );
}
