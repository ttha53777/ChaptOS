"use client";

import React, { useState } from "react";
import { FieldLabel } from "../dashboard/primitives";
import { inputCls, inputDuskCls, btnDuskGhostCls, btnDuskActionCls } from "../dashboard/styles";
import { Transaction, INCOME_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../../data";
import { todayStr } from "../../lib/dates";
import { useVocab } from "../../hooks/useVocab";

const CURRENT_SEMESTER = "SPR26";

export type TxFormSubmit = (data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt" | "calendarEvents"> & { calendarEventIds: number[]; brotherId?: number }) => void;

export interface TxFormEvent {
  id: number;
  title: string;
  date: string;
  category: string;
}

const ICON_SCHEDULE = "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";
const ICON_X = "M6 18L18 6M6 6l12 12";
const ICON_CAL = "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z";

export function TxForm({
  initial,
  onSubmit,
  onCancel,
  lockType,
  tone = "slate",
  events,
  lockEventIds,
  duesFor,
}: {
  initial?: Partial<Transaction>;
  onSubmit: TxFormSubmit;
  onCancel: () => void;
  /** When set, the Type select is hidden and locked to this value. */
  lockType?: "income" | "expense";
  /** "dusk" matches the Chapter Ledger redesign; "slate" (default) keeps the Treasury theme. */
  tone?: "slate" | "dusk";
  /** Calendar events available to link. Filtered to the transaction's semester year by the parent. */
  events?: TxFormEvent[];
  /** When set, these event ids are pre-linked and cannot be removed (logged from the event panel). */
  lockEventIds?: number[];
  /**
   * Recording a dues payment for this member. Locks type=income and category="Dues",
   * shows the member read-only, hides Period (the server sets it from the active term),
   * and carries brotherId in the submit payload so the transaction decrements the balance.
   */
  duesFor?: { id: number; name: string };
}) {
  const dusk = tone === "dusk";
  const inCls = dusk ? inputDuskCls : inputCls;
  // A dues payment is always an income row in the stored "Dues" category; both are locked.
  const lockTypeResolved = duesFor ? "income" as const : lockType;

  const [type,          setType]          = useState<"income" | "expense">(lockTypeResolved ?? initial?.type ?? "expense");
  const [category,      setCategory]      = useState(duesFor ? "Dues" : (initial?.category ?? ""));
  const [amount,        setAmount]        = useState(String(initial?.amount ?? ""));
  const [date,          setDate]          = useState(initial?.date ?? todayStr());
  const [description,   setDescription]   = useState(initial?.description ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? "");
  const [semester,      setSemester]      = useState(initial?.semester ?? CURRENT_SEMESTER);
  const [status,        setStatus]        = useState<"posted" | "scheduled">(
    (initial?.status as "posted" | "scheduled") ?? "posted"
  );

  const initialIds = lockEventIds?.length
    ? lockEventIds
    : (initial?.calendarEvents?.map(e => e.id) ?? []);
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>(initialIds);

  const v = useVocab();
  const isFutureDate = date > todayStr();

  // Filter events to the transaction's semester year.
  const semYear = semester ? "20" + semester.slice(-2) : null;
  const semesterEvents = events?.filter(e => semYear ? e.date.startsWith(semYear) : true) ?? [];
  // Events available to add (not yet selected).
  const addableEvents = semesterEvents.filter(e => !selectedEventIds.includes(e.id));

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function handleDateChange(newDate: string) {
    setDate(newDate);
    setStatus(newDate > todayStr() ? "scheduled" : "posted");
  }

  function addEvent(id: number) {
    if (!selectedEventIds.includes(id)) setSelectedEventIds(prev => [...prev, id]);
  }

  function removeEvent(id: number) {
    if (lockEventIds?.includes(id)) return;
    setSelectedEventIds(prev => prev.filter(x => x !== id));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      type, category, amount: Number(amount), date, description,
      paymentMethod: paymentMethod || undefined,
      semester:      semester || undefined,
      status,
      calendarEventIds: selectedEventIds,
      ...(duesFor ? { brotherId: duesFor.id } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {duesFor ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel tone={tone}>Member</FieldLabel>
            <div className={`${inCls} flex items-center truncate`} aria-readonly="true">{duesFor.name}</div>
          </div>
          <div>
            <FieldLabel tone={tone}>Category</FieldLabel>
            <div className={`${inCls} flex items-center`} aria-readonly="true">Dues</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!lockTypeResolved && (
            <div>
              <FieldLabel tone={tone}>Type</FieldLabel>
              <select value={type} onChange={e => { setType(e.target.value as "income" | "expense"); setCategory(""); }} className={inCls}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
          )}
          <div className={lockTypeResolved ? "sm:col-span-2" : undefined}>
            <FieldLabel tone={tone}>Category</FieldLabel>
            <select value={category} onChange={e => setCategory(e.target.value)} required className={inCls}>
              <option value="">Select…</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel tone={tone}>Amount ($)</FieldLabel>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" className={inCls} />
        </div>
        <div>
          <FieldLabel tone={tone}>Date</FieldLabel>
          <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} required className={inCls} />
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
          <span className={`text-[12px] ${dusk ? "text-[#958d7c]" : "text-slate-400"}`}>
            {status === "scheduled"
              ? <><span className={`font-semibold ${dusk ? "text-[#d9b08b]" : "text-amber-400"}`}>Scheduled</span> — not paid yet</>
              : <>Scheduled <span className={dusk ? "text-[#6b6354]" : "text-slate-500"}>(toggle if not paid)</span></>}
          </span>
          <svg className={`ml-auto h-3.5 w-3.5 shrink-0 ${status === "scheduled" ? (dusk ? "text-[#d9b08b]" : "text-amber-400") : (dusk ? "text-[#6b6354]" : "text-slate-600")}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_SCHEDULE} />
          </svg>
        </button>
      )}
      <div>
        <FieldLabel tone={tone}>Description</FieldLabel>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Asia Night door cut" className={inCls} />
      </div>
      <div className={`grid grid-cols-1 gap-3 ${duesFor ? "" : "sm:grid-cols-2"}`}>
        <div>
          <FieldLabel tone={tone}>Payment Method</FieldLabel>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inCls}>
            <option value="">—</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        {!duesFor && (
          <div>
            <FieldLabel tone={tone}>{v("Period")}</FieldLabel>
            <input type="text" value={semester} onChange={e => setSemester(e.target.value)} placeholder="SPR26" className={inCls} />
          </div>
        )}
      </div>

      {/* ── Event linking ───────────────────────────────────────────────────── */}
      {semesterEvents.length > 0 && (
        <div className="space-y-1.5">
          <FieldLabel tone={tone}>Linked Events</FieldLabel>
          {selectedEventIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedEventIds.map(id => {
                const ev = semesterEvents.find(e => e.id === id);
                if (!ev) return null;
                const locked = lockEventIds?.includes(id);
                return (
                  <span
                    key={id}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      dusk
                        ? "bg-[#a78bfa]/[0.15] text-[#c4b5fd]"
                        : "bg-indigo-500/20 text-indigo-300"
                    }`}
                  >
                    <svg className="h-3 w-3 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d={ICON_CAL} />
                    </svg>
                    {ev.title}
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => removeEvent(id)}
                        className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                        aria-label={`Remove ${ev.title}`}
                      >
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d={ICON_X} />
                        </svg>
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          {addableEvents.length > 0 && (
            <select
              value=""
              onChange={e => { if (e.target.value) addEvent(Number(e.target.value)); }}
              className={inCls}
            >
              <option value="">+ Add event link…</option>
              {addableEvents.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} · {ev.date}
                </option>
              ))}
            </select>
          )}
          {addableEvents.length === 0 && selectedEventIds.length > 0 && (
            <p className={`text-[11px] ${dusk ? "text-[#6b6354]" : "text-slate-500"}`}>All semester events linked.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={dusk ? btnDuskGhostCls : "rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"}>Cancel</button>
        <button type="submit" className={dusk ? btnDuskActionCls : "rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"}>
          {duesFor ? "Record Payment" : initial?.id ? "Save Changes" : (lockType === "expense" ? "Log Expense" : lockType === "income" ? "Log Revenue" : "Add Transaction")}
        </button>
      </div>
    </form>
  );
}
