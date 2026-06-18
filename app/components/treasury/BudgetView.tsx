"use client";

import React, { useEffect, useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, Transaction, fmt$ } from "../../data";
import { Modal, FieldLabel } from "../dashboard/primitives";
import { inputDuskCls, btnDuskGhostCls, btnDuskActionCls } from "../dashboard/styles";
import { requestJson } from "../../lib/api";
import { catColor, TreasuryDonutChart } from "./TreasuryCharts";

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
        <p className="text-[14px] font-semibold text-[#ece7dd]">No budget set for {semester}</p>
        <p className="mt-1 text-[12px] text-[#958d7c]">Divide your funds across categories. Pools grow live as income lands.</p>
        {isAdmin && (
          <button
            onClick={() => setEditOpen(true)}
            className={`mt-4 ${btnDuskActionCls}`}
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

  const allocationPieData = EXPENSE_CATEGORIES.map(cat => {
    const percent = budget.allocations.find(a => a.category === cat)?.percent ?? 0;
    return { name: cat, value: pool * (percent / 100) };
  });
  const hasAllocations = allocationPieData.some(d => d.value > 0);

  return (
    <div className="space-y-4">
      {/* ── Header row: stats (8) + allocation pie (4) ──────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-2xl border border-white/[0.07] p-5 lg:col-span-8"
          style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, #10121a 50%)" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <Stat label="Carryover"        value={fmt$(Math.round(budget.carryoverBalance))} tone="slate" />
              <Stat label="Income to Date"   value={fmt$(Math.round(actualIncome))}            tone="emerald" />
              <Stat label="Reserve Target"   value={fmt$(Math.round(reserveTarget))}           tone="amber" />
              <Stat label="Projected End"    value={fmt$(Math.round(projectedEnd))}            tone={projectedEnd >= 0 ? "violet" : "red"} />
            </div>
            {isAdmin && (
              <button
                onClick={() => setEditOpen(true)}
                className={btnDuskGhostCls}
              >
                Edit Budget
              </button>
            )}
          </div>
          <p className="mt-3 text-[11px] text-[#958d7c]">
            Funding pool <span className="font-semibold text-[#c9c2b4] tabular-nums">{fmt$(Math.round(pool))}</span> = carryover + income − reserve · each category gets its % of this pool live as money lands.
          </p>

          {/* ── Burn-rate strip ───────────────────────────────────────── */}
          <div className="mt-4 border-t border-white/[0.05] pt-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#958d7c]">Spent vs. Funded</p>
              <p className="text-[11px] tabular-nums text-[#958d7c]">
                <span className={`font-semibold ${actualExpenses > pool && pool > 0 ? "text-red-400" : "text-[#ece7dd]"}`}>
                  {fmt$(Math.round(actualExpenses))}
                </span>
                <span className="text-[#6b6354]"> / </span>
                <span className="text-[#c9c2b4]">{fmt$(Math.round(pool))}</span>
              </p>
            </div>
            <div className="mt-2 h-[8px] w-full overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pool > 0 ? Math.min(100, (actualExpenses / pool) * 100) : (actualExpenses > 0 ? 100 : 0)}%`,
                  background: actualExpenses > pool && pool > 0 ? "#ef4444" : "#a78bfa",
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] tabular-nums">
              <span className="text-[#958d7c]">
                {pool > 0 ? `${((actualExpenses / pool) * 100).toFixed(0)}% of pool used` : "—"}
              </span>
              <span className={
                actualExpenses > pool && pool > 0
                  ? "font-semibold text-red-400"
                  : actualExpenses > pool * 0.85 && pool > 0
                    ? "font-semibold text-amber-400"
                    : "text-[#958d7c]"
              }>
                {pool > 0 && actualExpenses > pool
                  ? `Over by ${fmt$(Math.round(actualExpenses - pool))}`
                  : pool > 0
                    ? `${fmt$(Math.round(pool - actualExpenses))} left to spend`
                    : "No pool funded yet"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] p-4 lg:col-span-4"
          style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, #10121a 50%)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#958d7c]">Allocation Split</p>
          {!hasAllocations ? (
            <div className="flex h-[180px] items-center justify-center">
              <p className="text-[11px] text-[#6b6354]">No allocations yet</p>
            </div>
          ) : (
            <TreasuryDonutChart data={allocationPieData} />
          )}
        </div>
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
                  <p className="truncate text-[13px] font-semibold text-[#ece7dd]">{cat}</p>
                  <p className="text-[10px] text-[#958d7c]">{percent.toFixed(0)}% share</p>
                </div>
                {isOver && (
                  <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-inset ring-red-500/25">
                    OVER
                  </span>
                )}
                {!isOver && isUnfunded && spent === 0 && (
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-[#958d7c] ring-1 ring-inset ring-white/[0.08]">
                    UNFUNDED
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-[11px] text-[#958d7c]">Funded</span>
                <span className="text-[14px] font-semibold tabular-nums text-[#ece7dd]">
                  {fmt$(Math.round(fundedPool))}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-[11px] text-[#958d7c]">Spent</span>
                <span className={`text-[14px] font-semibold tabular-nums ${isOver ? "text-red-400" : "text-[#c9c2b4]"}`}>
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
              <p className="mt-2 text-[10px] tabular-nums text-[#958d7c]">
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
            <p className="mt-1 text-[18px] font-semibold tabular-nums text-[#ece7dd]">
              {fmt$(Math.round(reserveTarget))} <span className="text-[12px] font-medium text-[#958d7c]">target</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[#958d7c]">Set aside off the top</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#958d7c]">Projected end</p>
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

function Stat({ label, value, tone }: { label: string; value: string; tone: "slate" | "emerald" | "amber" | "violet" | "red" }) {
  const toneCls = {
    slate:   "text-[#ece7dd]",
    emerald: "text-emerald-400",
    amber:   "text-amber-400",
    violet:  "text-[#a78bfa]",
    red:     "text-red-400",
  }[tone];
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#958d7c]">{label}</p>
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
    <Modal title={`Edit Budget — ${semester}`} tone="dusk" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <FieldLabel tone="dusk">Starting Carryover ($)</FieldLabel>
            <button
              type="button"
              onClick={() => setCarryoverStr(String(Math.max(0, Math.round(currentBalance))))}
              className="text-[10px] font-semibold text-[#a78bfa] hover:text-[#bda6fc]"
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
            className={inputDuskCls}
            autoFocus
          />
          <p className="mt-1 text-[10px] text-[#958d7c]">
            Starting funds. Pool grows live as new income lands — no need to predict the semester total.
          </p>
        </div>

        <div>
          <FieldLabel tone="dusk">Reserve Target ($)</FieldLabel>
          <input
            type="number"
            min="0"
            step="0.01"
            value={reserveStr}
            onChange={e => setReserveStr(e.target.value)}
            placeholder="0.00"
            className={inputDuskCls}
          />
          <p className="mt-1 text-[10px] text-[#958d7c]">
            Locked-aside dollar amount for next semester's carryover. Sliders below divide what's left ({fmt$(Math.round(pool))} from current carryover).
          </p>
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-lg border border-[rgba(236,231,221,0.12)] bg-[#0f0d0a]">
          {EXPENSE_CATEGORIES.map((cat, idx) => {
            const value = percents[cat] ?? 0;
            const dollar = pool * value / 100;
            return (
              <div
                key={cat}
                className={`flex items-center gap-3 px-3 py-2.5 ${idx > 0 ? "border-t border-white/[0.04]" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#c9c2b4]">{cat}</p>
                  <p className="text-[10px] tabular-nums text-[#958d7c]">
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
                  className="h-1 w-[120px] accent-[#a78bfa]"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  onChange={e => setPct(cat, Number(e.target.value))}
                  className="w-14 rounded border border-[rgba(236,231,221,0.12)] bg-[#0f0d0a] px-2 py-1 text-[12px] tabular-nums text-[#ece7dd] focus:border-[#a78bfa]/60 focus:outline-none"
                />
                <span className="w-3 text-[11px] text-[#958d7c]">%</span>
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
            className={btnDuskGhostCls}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={btnDuskActionCls}
          >
            {saving ? "Saving…" : "Save Budget"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
