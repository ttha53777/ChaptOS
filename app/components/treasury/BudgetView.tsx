"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, Transaction, fmt$ } from "../../data";
import { Modal, FieldLabel } from "../dashboard/primitives";
import { inputCls } from "../dashboard/styles";
import { requestJson } from "../../lib/api";
import { catColor } from "./TreasuryCharts";

type BudgetData = {
  semester: string;
  carryoverBalance: number;
  reserveAmount: number;
  allocations: { category: string; percent: number }[];
};

export function BudgetView({
  semester,
  transactions,
  currentBalance,
  isAdmin,
  onError,
}: {
  semester: string;
  transactions: Transaction[];
  currentBalance: number;
  isAdmin: boolean;
  onError: (msg: string) => void;
}) {
  const [budget,    setBudget]    = useState<BudgetData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [editOpen,  setEditOpen]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    requestJson<BudgetData | null>(`/api/budget?semester=${encodeURIComponent(semester)}`)
      .then(b => { if (!cancelled) setBudget(b); })
      .catch(() => { if (!cancelled) setBudget(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [semester]);

  const actualIncome = useMemo(
    () => transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const actualExpenses = useMemo(
    () => transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
    }
    return m;
  }, [transactions]);

  if (loading) {
    return <div className="h-[400px] animate-pulse rounded-xl border border-white/[0.06] bg-[#10121a]" />;
  }

  if (!budget) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-[#10121a] p-10 text-center"
        style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, #10121a 50%)" }}>
        <p className="text-[14px] font-semibold text-white">No budget set for {semester}</p>
        <p className="mt-1 text-[12px] text-slate-500">Divide your funds across categories. Pools grow live as income lands.</p>
        {isAdmin && (
          <button
            onClick={() => setEditOpen(true)}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Set Budget
          </button>
        )}
        {editOpen && (
          <EditBudgetModal
            semester={semester}
            initial={null}
            currentBalance={currentBalance}
            onClose={() => setEditOpen(false)}
            onSaved={b => { setBudget(b); setEditOpen(false); }}
            onError={onError}
          />
        )}
      </div>
    );
  }

  const totalFunds     = budget.carryoverBalance + actualIncome;
  const reserveTarget  = budget.reserveAmount;
  const pool           = Math.max(0, totalFunds - reserveTarget);
  const projectedEnd   = totalFunds - actualExpenses;
  const reserveOnTrack = projectedEnd >= reserveTarget;

  return (
    <div className="space-y-4">
      {/* ── Header strip ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.07] p-5"
        style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, #10121a 50%)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <Stat label="Carryover"        value={fmt$(Math.round(budget.carryoverBalance))} tone="slate" />
            <Stat label="Income to Date"   value={fmt$(Math.round(actualIncome))}            tone="emerald" />
            <Stat label="Reserve Target"   value={fmt$(Math.round(reserveTarget))}           tone="amber" />
            <Stat label="Projected End"    value={fmt$(Math.round(projectedEnd))}            tone={projectedEnd >= 0 ? "indigo" : "red"} />
          </div>
          {isAdmin && (
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              Edit Budget
            </button>
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Funding pool <span className="font-semibold text-slate-300 tabular-nums">{fmt$(Math.round(pool))}</span> = carryover + income − reserve · each category gets its % of this pool live as money lands.
        </p>
      </div>

      {/* ── Category cards grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXPENSE_CATEGORIES.map((cat, idx) => {
          const alloc       = budget.allocations.find(a => a.category === cat);
          const percent     = alloc?.percent ?? 0;
          const fundedPool  = pool * (percent / 100);
          const spent       = spentByCategory.get(cat) ?? 0;
          const pctUsed     = fundedPool > 0 ? (spent / fundedPool) * 100 : (spent > 0 ? 100 : 0);
          const isOver      = spent > fundedPool && fundedPool > 0;
          const isUnfunded  = percent === 0;
          const color       = catColor(cat, idx);

          return (
            <div
              key={cat}
              className="rounded-2xl border border-white/[0.07] p-4"
              style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, #10121a 60%)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-white">{cat}</p>
                  <p className="text-[10px] text-slate-500">{percent.toFixed(0)}% share</p>
                </div>
                {isOver && (
                  <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-inset ring-red-500/25">
                    OVER
                  </span>
                )}
                {!isOver && isUnfunded && spent === 0 && (
                  <span className="shrink-0 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-inset ring-slate-500/20">
                    UNFUNDED
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-[11px] text-slate-500">Funded</span>
                <span className="text-[14px] font-semibold tabular-nums text-white">
                  {fmt$(Math.round(fundedPool))}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-[11px] text-slate-500">Spent</span>
                <span className={`text-[14px] font-semibold tabular-nums ${isOver ? "text-red-400" : "text-slate-300"}`}>
                  {fmt$(Math.round(spent))}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-[6px] w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, pctUsed)}%`,
                    background: isOver ? "#ef4444" : color,
                  }}
                />
              </div>
              <p className="mt-2 text-[10px] tabular-nums text-slate-500">
                {fundedPool > 0
                  ? (isOver
                      ? `Over by ${fmt$(Math.round(spent - fundedPool))}`
                      : `${pctUsed.toFixed(0)}% used · ${fmt$(Math.round(fundedPool - spent))} left`)
                  : (spent > 0 ? `No allocation · ${fmt$(Math.round(spent))} spent` : "—")}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Reserve card ──────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-amber-500/20 p-5"
        style={{ background: "linear-gradient(to bottom, rgba(245,158,11,0.06) 0%, #10121a 70%)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">Reserve / Carryover</p>
            <p className="mt-1 text-[18px] font-semibold tabular-nums text-white">
              {fmt$(Math.round(reserveTarget))} <span className="text-[12px] font-medium text-slate-500">target</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Set aside off the top</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Projected end</p>
            <p className={`mt-1 text-[18px] font-semibold tabular-nums ${reserveOnTrack ? "text-emerald-400" : "text-red-400"}`}>
              {fmt$(Math.round(projectedEnd))}
            </p>
            <p className={`mt-0.5 text-[11px] font-semibold ${reserveOnTrack ? "text-emerald-400" : "text-red-400"}`}>
              {reserveOnTrack ? "On track" : `Short by ${fmt$(Math.round(reserveTarget - projectedEnd))}`}
            </p>
          </div>
        </div>
      </div>

      {editOpen && (
        <EditBudgetModal
          semester={semester}
          initial={budget}
          currentBalance={currentBalance}
          onClose={() => setEditOpen(false)}
          onSaved={b => { setBudget(b); setEditOpen(false); }}
          onError={onError}
        />
      )}
    </div>
  );
}

// ─── Stat ─────────────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: string; tone: "slate" | "emerald" | "amber" | "indigo" | "red" }) {
  const toneCls = {
    slate:   "text-slate-200",
    emerald: "text-emerald-400",
    amber:   "text-amber-400",
    indigo:  "text-indigo-400",
    red:     "text-red-400",
  }[tone];
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-[17px] font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}

// ─── Edit Budget Modal ────────────────────────────────────────────────

function EditBudgetModal({
  semester,
  initial,
  currentBalance,
  onClose,
  onSaved,
  onError,
}: {
  semester: string;
  initial: BudgetData | null;
  currentBalance: number;
  onClose: () => void;
  onSaved: (b: BudgetData) => void;
  onError: (msg: string) => void;
}) {
  const [carryoverStr, setCarryoverStr] = useState(
    String(initial?.carryoverBalance ?? Math.max(0, Math.round(currentBalance)))
  );
  const [reserveStr, setReserveStr] = useState(String(initial?.reserveAmount ?? 0));
  const [percents, setPercents] = useState<Record<string, number>>(() => {
    const initialAlloc = new Map<string, number>();
    initial?.allocations.forEach(a => initialAlloc.set(a.category, a.percent));
    const map: Record<string, number> = {};
    EXPENSE_CATEGORIES.forEach(c => { map[c] = initialAlloc.get(c) ?? 0; });
    return map;
  });
  const [saving, setSaving] = useState(false);

  const carryover = Number(carryoverStr) || 0;
  const reserve   = Number(reserveStr) || 0;
  const pool      = Math.max(0, carryover - reserve);
  const total     = Object.values(percents).reduce((s, v) => s + v, 0);
  const totalOk   = Math.abs(total - 100) < 0.01;
  const canSave   = totalOk && !isNaN(carryover) && reserve >= 0 && !saving;

  function setPct(key: string, v: number) {
    setPercents(p => ({ ...p, [key]: Math.max(0, Math.min(100, v)) }));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await requestJson<BudgetData>("/api/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semester,
          carryoverBalance: carryover,
          reserveAmount: reserve,
          allocations: EXPENSE_CATEGORIES
            .map(c => ({ category: c, percent: percents[c] ?? 0 }))
            .filter(a => a.percent > 0),
        }),
      });
      onSaved(saved);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save budget");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit Budget — ${semester}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <FieldLabel>Starting Carryover ($)</FieldLabel>
            <button
              type="button"
              onClick={() => setCarryoverStr(String(Math.max(0, Math.round(currentBalance))))}
              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300"
            >
              Use current balance ({fmt$(Math.max(0, Math.round(currentBalance)))})
            </button>
          </div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={carryoverStr}
            onChange={e => setCarryoverStr(e.target.value)}
            placeholder="0.00"
            className={inputCls}
            autoFocus
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Starting funds. Pool grows live as new income lands — no need to predict the semester total.
          </p>
        </div>

        <div>
          <FieldLabel>Reserve Target ($)</FieldLabel>
          <input
            type="number"
            min="0"
            step="0.01"
            value={reserveStr}
            onChange={e => setReserveStr(e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Locked-aside dollar amount for next semester's carryover. Sliders below divide what's left ({fmt$(Math.round(pool))} from current carryover).
          </p>
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-lg border border-white/[0.06] bg-[#0a0d14]">
          {EXPENSE_CATEGORIES.map((cat, idx) => {
            const value = percents[cat] ?? 0;
            const dollar = pool * value / 100;
            return (
              <div
                key={cat}
                className={`flex items-center gap-3 px-3 py-2.5 ${idx > 0 ? "border-t border-white/[0.04]" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-slate-200">{cat}</p>
                  <p className="text-[10px] tabular-nums text-slate-500">
                    {fmt$(Math.round(dollar))} from pool
                  </p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  onChange={e => setPct(cat, Number(e.target.value))}
                  className="h-1 w-[120px] accent-indigo-500"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  onChange={e => setPct(cat, Number(e.target.value))}
                  className="w-14 rounded border border-white/[0.08] bg-[#0a0d14] px-2 py-1 text-[12px] tabular-nums text-white focus:border-indigo-500/60 focus:outline-none"
                />
                <span className="w-3 text-[11px] text-slate-500">%</span>
              </div>
            );
          })}
        </div>

        <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[12px] ${
          totalOk
            ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
            : "border-red-500/20 bg-red-500/[0.06] text-red-300"
        }`}>
          <span className="font-semibold">Total</span>
          <span className="tabular-nums">{total.toFixed(0)}% / 100%</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Budget"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
