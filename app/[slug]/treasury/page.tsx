"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { catColor } from "../../components/treasury/TreasuryCharts";
import { Sidebar } from "../../components/Sidebar";
import { BrotherAvatar } from "../../components/BrotherAvatar";

const TreasuryAreaChart = dynamic(
  () => import("../../components/treasury/TreasuryCharts").then(m => m.TreasuryAreaChart),
  { ssr: false, loading: () => <div className="tr-skel h-[232px] rounded-lg" /> }
);
const TreasuryDonutChart = dynamic(
  () => import("../../components/treasury/TreasuryCharts").then(m => m.TreasuryDonutChart),
  { ssr: false, loading: () => <div className="tr-skel h-[220px] rounded-full mx-auto max-w-[220px]" /> }
);
import { Modal, FieldLabel } from "../../components/dashboard/primitives";
import { inputDuskCls, btnDuskGhostCls, btnDuskActionCls } from "../../components/dashboard/styles";
import { LedgerStrip, Measure } from "../../components/dashboard/ledger/LedgerStrip";
import { BudgetView } from "../../components/treasury/BudgetView";
import "../../components/dashboard/dashboard-ledger.css";
import "./treasury-ledger.css";
import { useChapter } from "../../context/ChapterContext";
import { useVocab } from "../../hooks/useVocab";
import {
  Transaction, PartyEvent, Brother, Reimbursement,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES,
  fmt$, fmtDate, round2,
} from "../../data";
import { TxForm, type TxFormEvent } from "../../components/treasury/TxForm";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_SEMESTER = "SPR26";


type NavTab = "Overview" | "Budget" | "Transactions" | "Reports" | "Reimbursements";

// "Budget" is intentionally omitted from the nav for now — the tab is hidden but
// the type/render path below are kept so it can be re-enabled by re-adding it here.
const NAV_TABS: NavTab[] = ["Overview", "Transactions", "Reports", "Reimbursements"];

type TxModal =
  | { kind: "addTx" }
  | { kind: "editTx"; tx: Transaction }
  | null;

type PartyModal =
  | { kind: "addParty" }
  | { kind: "editParty"; event: PartyEvent }
  | null;

type TxTab = "all" | "income" | "expense";

import { requestJson } from "../../lib/api";
import { todayStr } from "../../lib/dates";

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
      balance: round2(running),
      expenses: round2(expenses),
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
    income:  round2(income),
    expense: round2(expense),
    net:     round2(income - expense),
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
    return sorted.map(([name, value]) => ({ name, value: round2(value) }));
  }
  const top = sorted.slice(0, maxSlices);
  const otherVal = sorted.slice(maxSlices).reduce((s, [, v]) => s + v, 0);
  return [
    ...top.map(([name, value]) => ({ name, value: round2(value) })),
    { name: "Other", value: round2(otherVal) },
  ];
}

// ─── Reimbursements View ──────────────────────────────────────────────────────

const ICON_CHECK = "M5 13l4 4L19 7";
const ICON_X_SM  = "M6 18L18 6M6 6l12 12";

// Reimbursements always read as money — cents are filled in even when the request
// was a round number ($210 → $210.00). Unlike the rounded whole-dollar figures in
// the overview, a reimbursement is an exact amount someone is owed.
function fmtReimb(n: number): string {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// "submitted 3 days ago" cue — gives the treasurer a sense of how stale a request is.
function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)   return `${days} days ago`;
  if (days < 14)  return "last week";
  if (days < 30)  return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function ReimbursementsView({
  reimbursements,
  canTreasury,
  selfId,
  balance,
  showArchived,
  onToggleArchived,
  onAction,
}: {
  reimbursements: Reimbursement[];
  canTreasury: boolean;
  selfId: number | null;
  balance: number;
  showArchived: boolean;
  onToggleArchived: () => void;
  onAction: (id: number, status: "approved" | "rejected", note?: string, category?: string) => void;
}) {
  const [rejectingId,   setRejectingId]   = useState<number | null>(null);
  const [rejectNote,    setRejectNote]    = useState("");
  // Approving posts real money to the ledger, so it confirms first — same inline
  // two-step shape as declining, and the last chance to fix the budget bucket.
  const [approvingId,   setApprovingId]   = useState<number | null>(null);
  const [approveCat,    setApproveCat]    = useState("");

  const pending  = reimbursements.filter(r => r.status === "pending");
  const archived = reimbursements.filter(r => r.status !== "pending");
  const pendingTotal = pending.reduce((sum, r) => sum + r.amount, 0);

  function confirmReject(id: number) {
    onAction(id, "rejected", rejectNote.trim() || undefined);
    setRejectingId(null);
    setRejectNote("");
  }

  function startApprove(r: Reimbursement) {
    setRejectingId(null);
    setApprovingId(r.id);
    setApproveCat(r.category || EXPENSE_CATEGORIES[0]);
  }

  function confirmApprove(id: number) {
    onAction(id, "approved", undefined, approveCat);
    setApprovingId(null);
  }

  function renderCard(r: Reimbursement, isArchived = false) {
    const isRejecting = rejectingId === r.id;
    const isApproving = approvingId === r.id;
    const isMine = selfId != null && r.brotherId === selfId;
    // A reimbursement reads like a receipt stub: the request + amount up top, a torn
    // perforated edge, then a foot that changes with status — pending shows the
    // approve/decline decision, resolved tickets show the outcome.
    const showActions = !isArchived && canTreasury && !isRejecting && !isApproving;
    return (
      <div key={r.id} className={`tr-reimb-card tr-reimb-${r.status}${isArchived ? " tr-reimb-archived" : ""}`}>
        <div className="tr-reimb-body">
          {/* Stub header: who + when on the left, status pill on the right. */}
          <div className="tr-reimb-top">
            <div className="tr-reimb-avatar">
              {r.brother.avatarUrl
                ? <img src={r.brother.avatarUrl} alt={r.brother.name} />
                : <span>{r.brother.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="tr-reimb-who">
              <span className="tr-reimb-name">
                {r.brother.name}
                {isMine && <span className="tr-reimb-you">you</span>}
              </span>
              <span className="tr-reimb-date">{fmtDate(r.date)}</span>
            </div>
            <span className={`tr-reimb-pill tr-reimb-pill-${r.status}`}>
              <span className="tr-reimb-pill-dot" aria-hidden />
              {r.status === "pending" ? "Pending" : r.status === "approved" ? "Approved" : "Declined"}
            </span>
          </div>

          {/* The amount is the hero — large serif, the thing you scan. The $ is its
              own styled span, so render just the number (always 2-decimal). */}
          <div className="tr-reimb-amount"><span className="tr-reimb-cur">$</span>{fmtReimb(r.amount).slice(1)}</div>
          <p className="tr-reimb-desc">{r.description}</p>
          <span className="tr-reimb-age">submitted {relativeAge(r.createdAt)}</span>
        </div>

        {/* Perforated tear between the request and the decision. */}
        <div className="tr-reimb-tearwrap"><span className="tr-reimb-tear" aria-hidden /></div>

        <div className="tr-reimb-foot">
          {showActions && (
            <>
              <button
                className="tr-reimb-act tr-reimb-act-approve"
                onClick={() => startApprove(r)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_CHECK} /></svg>
                Approve
              </button>
              <button
                className="tr-reimb-act tr-reimb-act-reject"
                onClick={() => { setRejectingId(r.id); setRejectNote(""); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_X_SM} /></svg>
                Decline
              </button>
            </>
          )}

          {isRejecting && (
            <div className="tr-reimb-reject-row">
              <input
                type="text"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Reason for declining (optional — shown to submitter)"
                className={inputDuskCls}
                autoFocus
              />
              <div className="tr-reimb-reject-actions">
                <button className={btnDuskGhostCls} onClick={() => setRejectingId(null)}>Cancel</button>
                <button className="tr-reimb-btn-confirm-reject" onClick={() => confirmReject(r.id)}>Confirm decline</button>
              </div>
            </div>
          )}

          {/* Approving is the moment the money leaves the books — spell out exactly
              what is about to be posted before it is. */}
          {isApproving && (
            <div className="tr-reimb-approve-row">
              <p className="tr-reimb-approve-lede">
                Posts a <strong>{fmtReimb(r.amount)}</strong> expense to the ledger
                {isMine && <span className="tr-reimb-approve-self"> — this is your own request</span>}
              </p>
              <div className="tr-reimb-approve-fields">
                <label className="tr-reimb-approve-cat">
                  <span>Budget category</span>
                  <select value={approveCat} onChange={e => setApproveCat(e.target.value)} className={inputDuskCls}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <div className="tr-reimb-approve-balance">
                  <span>Balance after</span>
                  <strong>{fmt$(Math.round(balance))} → {fmt$(Math.round(balance - r.amount))}</strong>
                </div>
              </div>
              <div className="tr-reimb-reject-actions">
                <button className={btnDuskGhostCls} onClick={() => setApprovingId(null)}>Cancel</button>
                <button className="tr-reimb-btn-confirm-approve" onClick={() => confirmApprove(r.id)}>Approve &amp; post</button>
              </div>
            </div>
          )}

          {!showActions && !isRejecting && !isApproving && r.status === "approved" && (
            <span className="tr-reimb-outcome">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_CHECK} /></svg>
              Reimbursed{r.category ? ` — posted to ${r.category}` : ""}
            </span>
          )}

          {!showActions && !isRejecting && !isApproving && r.status === "rejected" && (
            <div className="tr-reimb-rejnote">
              <span className="tr-reimb-rejnote-k">Note</span>
              <p>{r.rejectionNote || "Declined."}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tr-reimb-section" style={{ marginTop: 18 }}>
      <div className="tr-reimb-header">
        <h2 className="tr-reimb-title">Reimbursement Requests</h2>
        {pending.length > 0 && (
          <div className="tr-reimb-summary">
            <span className="tr-reimb-summary-count">{pending.length} pending</span>
            <span className="tr-reimb-dot">·</span>
            <span className="tr-reimb-summary-total">{fmtReimb(pendingTotal)} to review</span>
          </div>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="tr-reimb-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          <span>You&rsquo;re all caught up — no pending requests.</span>
        </div>
      ) : (
        <div className="tr-reimb-list">
          {pending.map(r => renderCard(r, false))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="tr-reimb-archive-section">
          <button className="tr-reimb-archive-toggle" onClick={onToggleArchived}>
            {showArchived ? "Hide" : "Show"} resolved ({archived.length})
          </button>
          {showArchived && (
            <div className="tr-reimb-list tr-reimb-list-archived">
              {archived.map(r => renderCard(r, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reimbursement Form ───────────────────────────────────────────────────────

function ReimbursementForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { date: string; amount: number; description: string; category: string; file: File | null }) => void;
  onCancel: () => void;
}) {
  const [date,        setDate]        = useState(todayStr());
  const [amount,      setAmount]      = useState("");
  const [description, setDescription] = useState("");
  // Approving this mints an expense in the ledger, and the budget page groups spend
  // by category — so the bucket is chosen here, at the point someone knows what the
  // money was for. Same list the transaction form uses, so the two books line up.
  const [category,    setCategory]    = useState<string>(EXPENSE_CATEGORIES[0]);
  const [file,        setFile]        = useState<File | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ date, amount: Number(amount), description, category, file });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel tone="dusk">Date</FieldLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputDuskCls} />
        </div>
        <div>
          <FieldLabel tone="dusk">Amount ($)</FieldLabel>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" className={inputDuskCls} />
        </div>
      </div>
      <div>
        <FieldLabel tone="dusk">What for</FieldLabel>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} required placeholder="e.g. Decorations for spring formal" className={inputDuskCls} />
      </div>
      <div>
        <FieldLabel tone="dusk">Budget category</FieldLabel>
        <select value={category} onChange={e => setCategory(e.target.value)} required className={inputDuskCls}>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <FieldLabel tone="dusk">Attach Receipt <span style={{ color: "#6b6354", fontWeight: 400 }}>(optional)</span></FieldLabel>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-[rgba(236,231,221,0.18)] bg-[rgba(167,139,250,0.04)] px-3 py-3 text-left text-[12px] text-[#6b6354] hover:border-[#a78bfa]/50 hover:text-[#a78bfa] transition-colors"
        >
          {file ? (
            <span className="flex items-center gap-2 text-[#c4b5fd]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              {file.name}
              <button
                type="button"
                onClick={ev => { ev.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="ml-auto text-[#6b6354] hover:text-[#d98ba3] transition-colors"
                aria-label="Remove file"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
              Click to attach a file…
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={btnDuskGhostCls}>Cancel</button>
        <button type="submit" className={btnDuskActionCls}>Submit Reimbursement</button>
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
        <FieldLabel tone="dusk">Event Name</FieldLabel>
        <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Spring Rush Social" className={inputDuskCls} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel tone="dusk">Date</FieldLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputDuskCls} />
        </div>
        <div>
          <FieldLabel tone="dusk">Door Revenue ($)</FieldLabel>
          <input type="number" min="0" step="0.01" value={doorRevenue} onChange={e => setDoorRevenue(e.target.value)} required placeholder="0" className={inputDuskCls} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel tone="dusk">Attendance</FieldLabel>
          <input type="number" min="0" value={attendance} onChange={e => setAttendance(e.target.value)} required placeholder="0" className={inputDuskCls} />
        </div>
        <div>
          <FieldLabel tone="dusk">Notes</FieldLabel>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className={inputDuskCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={btnDuskGhostCls}>Cancel</button>
        <button type="submit" className={btnDuskActionCls}>
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
      <p className="text-[13px] text-[#c9c2b4]">Are you sure you want to delete <span className="font-semibold text-[#ece7dd]">{label}</span>? This action cannot be undone.</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className={btnDuskGhostCls}>Cancel</button>
        <button onClick={onConfirm} className="rounded-lg bg-[#d98ba3] px-4 py-1.5 text-[13px] font-semibold text-[#0f0d0a] hover:bg-[#e6a0b5] transition-colors">Delete</button>
      </div>
    </div>
  );
}

// ─── Small primitives ─────────────────────────────────────────────────────────

// Row action icon button (edit / delete) on the dusk tables. `tone` picks the hover accent.
function IconBtn({ path, label, tone, onClick }: { path: string; label: string; tone: "edit" | "del"; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className={`tr-iconbtn ${tone}`}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </button>
  );
}

// Round pill icon button used in the briefing head actions.
function TreasuryIconButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="tr-icon-btn">
      {children}
    </button>
  );
}

// Dusk card surface (replaces the old FinanceCard gradient panel).
function FinanceCard({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`card ${className ?? ""}`} style={style}>
      {children}
    </div>
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const ICON_EDIT   = "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z";
const ICON_TRASH  = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";
const ICON_EXPORT = "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4";
const ICON_MENU   = "M4 6h16M4 12h16M4 18h16";
const ICON_PARTY  = "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TreasuryPage() {
  const { currentUser, treasuryData, transactionList, setTransactionList, partyList, setPartyList, brotherList, setBrotherList, reimbursementList: reimbursements, setReimbursementList: setReimbursements, isLoading, avatarRevision, can } = useChapter();
  const v = useVocab();
  const selfId = currentUser?.id ?? null;
  const canTreasury = can("MANAGE_TREASURY");

  const [calendarEvents, setCalendarEvents] = useState<TxFormEvent[]>([]);
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [semester,      setSemester]      = useState(CURRENT_SEMESTER);
  const [navTab,        setNavTab]        = useState<NavTab>("Overview");
  const [chartRange,    setChartRange]    = useState<"2W"|"1M"|"3M"|"YTD"|"ALL">("ALL");
  const [txTab,         setTxTab]         = useState<TxTab>("all");
  const [txCategory,    setTxCategory]    = useState<string>("all");
  const [txSearch,      setTxSearch]      = useState("");
  const [donutMode,     setDonutMode]     = useState<"expense" | "income">("expense");
  const [txModal,       setTxModal]       = useState<TxModal>(null);
  const [partyModal,    setPartyModal]    = useState<PartyModal>(null);
  const [deleteModal,   setDeleteModal]   = useState<{ kind: "tx"; tx: Transaction } | { kind: "party"; event: PartyEvent } | null>(null);
  const [mutErr,        setMutErr]        = useState<string | null>(null);
  const [duesTarget,    setDuesTarget]    = useState<Brother | null>(null);
  const [duesAction,    setDuesAction]    = useState<"assign" | "deduct">("deduct");
  const [duesAmountStr, setDuesAmountStr] = useState("");
  const [reimbModal,       setReimbModal]       = useState(false);
  const [reimbArchived,    setReimbArchived]    = useState(false);
  // Reimbursements come from ChapterContext so the dashboard "needs attention"
  // queue and the sidebar count badge stay in lockstep with approve/reject here.

  // Deep-link: the dashboard "needs attention" Review button lands here with
  // ?tab=Reimbursements to drop the viewer straight on the reimbursement queue.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("tab");
    if (target && (NAV_TABS as string[]).includes(target)) setNavTab(target as NavTab);
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const pendingReimbCount = useMemo(
    () => reimbursements.filter(r => r.status === "pending").length,
    [reimbursements],
  );

  const activeTxns = useMemo(() =>
    transactionList.filter(t => !t.deletedAt && (!semester || t.semester === semester))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactionList, semester]
  );

  const incomeTxns  = useMemo(() => activeTxns.filter(t => t.type === "income"),  [activeTxns]);
  const expenseTxns = useMemo(() => activeTxns.filter(t => t.type === "expense"), [activeTxns]);

  const totalIncome   = useMemo(() => incomeTxns.reduce((s, t)  => s + t.amount, 0), [incomeTxns]);
  const totalExpenses = useMemo(() => expenseTxns.reduce((s, t) => s + t.amount, 0), [expenseTxns]);

  const baseVisibleTxns = txTab === "income" ? incomeTxns : txTab === "expense" ? expenseTxns : activeTxns;
  const visibleTxns = txCategory === "all" ? baseVisibleTxns : baseVisibleTxns.filter(t => t.category === txCategory);

  const categoryOptions = useMemo(() => {
    if (txTab === "income")  return INCOME_CATEGORIES as readonly string[];
    if (txTab === "expense") return EXPENSE_CATEGORIES as readonly string[];
    return [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as readonly string[];
  }, [txTab]);

  const txnsWithRunning = useMemo(() => {
    // Build running balance from ALL active txns so filtered views show the real balance at each date
    const sorted = [...activeTxns].sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    const balanceMap = new Map<number, number>();
    sorted.forEach(t => {
      running += t.type === "income" ? t.amount : -t.amount;
      balanceMap.set(t.id, running);
    });
    const needle = txSearch.trim().toLowerCase();
    const filtered = needle
      ? visibleTxns.filter(t =>
          t.description?.toLowerCase().includes(needle) ||
          t.category.toLowerCase().includes(needle)
        )
      : visibleTxns;
    return filtered
      .map(t => ({ ...t, running: balanceMap.get(t.id) ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeTxns, visibleTxns, txSearch]);

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

  // Editorial kicker date (e.g. "Sat · Jun 13") — matches sibling ledger pages.
  const dateLabel = useMemo(() => {
    const d = new Date();
    const wk = d.toLocaleDateString("en-US", { weekday: "short" });
    const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${wk} · ${md}`;
  }, []);

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

  // Fetch calendar events once for the TxForm event picker.
  React.useEffect(() => {
    requestJson<TxFormEvent[]>("/api/calendar")
      .then(evs => setCalendarEvents(evs.map(e => ({ id: e.id, title: e.title, date: e.date, category: e.category }))))
      .catch(() => {});
  }, []);

  // ── Mutations: Transactions ───────────────────────────────────────────────

  const handleAddTx = useCallback(async (data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt" | "calendarEvents"> & { calendarEventIds: number[] }) => {
    const { calendarEventIds, ...rest } = data;
    const optimisticCalEvents = calendarEventIds
      .map(id => calendarEvents.find(e => e.id === id))
      .filter(Boolean) as TxFormEvent[];
    const optimisticId = -Date.now();
    const optimistic: Transaction = { ...rest, calendarEvents: optimisticCalEvents, id: optimisticId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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

  const handleEditTx = useCallback(async (tx: Transaction, data: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt" | "calendarEvents"> & { calendarEventIds: number[] }) => {
    const { calendarEventIds, ...rest } = data;
    const optimisticCalEvents = calendarEventIds
      .map(id => calendarEvents.find(e => e.id === id))
      .filter(Boolean) as TxFormEvent[];
    const previous = tx;
    const updated: Transaction = { ...tx, ...rest, calendarEvents: optimisticCalEvents, updatedAt: new Date().toISOString() };
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

  const handleMarkPaid = useCallback(async (tx: Transaction) => {
    setTransactionList(prev => prev.map(t => t.id === tx.id ? { ...t, status: "posted" } : t));
    setMutErr(null);
    try {
      const saved = await requestJson<Transaction>(`/api/transactions/${tx.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "posted" }),
      });
      setTransactionList(prev => prev.map(t => t.id === tx.id ? saved : t));
    } catch {
      setTransactionList(prev => prev.map(t => t.id === tx.id ? tx : t));
      setMutErr("Failed to mark transaction as paid.");
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


  const handleSubmitReimbursement = useCallback(async (data: { date: string; amount: number; description: string; category: string; file: File | null }) => {
    if (!selfId) return;
    setReimbModal(false);
    const res = await fetch("/api/reimbursements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brotherId: selfId, amount: data.amount, date: data.date, description: data.description, category: data.category }),
    });
    if (res.ok) {
      const created: Reimbursement = await res.json();
      setReimbursements(prev => [created, ...prev]);
    }
  }, [selfId, setReimbursements]);

  const handleReimbursementAction = useCallback(async (id: number, status: "approved" | "rejected", rejectionNote?: string, category?: string) => {
    const prev = reimbursements.find(r => r.id === id);
    setReimbursements(list => list.map(r => r.id === id
      ? { ...r, status, rejectionNote: rejectionNote ?? null, ...(category ? { category } : {}) }
      : r));
    const res = await fetch(`/api/reimbursements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectionNote: rejectionNote ?? null, ...(category ? { category } : {}) }),
    });
    if (!res.ok) {
      if (prev) setReimbursements(list => list.map(r => r.id === id ? prev : r));
      setMutErr("Failed to update reimbursement");
      return;
    }
    const saved: Reimbursement = await res.json();
    setReimbursements(list => list.map(r => r.id === id ? saved : r));

    // Approving mints an expense in the ledger server-side. Every balance on this
    // page is summed from transactionList, so without pulling it back in the money
    // would look like it never moved — indistinguishable from the bug this fixes.
    if (saved.transactionId != null || prev?.transactionId != null) {
      try {
        const fresh = await requestJson<Transaction[]>("/api/transactions");
        setTransactionList(fresh);
      } catch {
        setMutErr("Reimbursement saved, but the ledger didn't refresh — reload to see the new balance.");
      }
    }
  }, [reimbursements, setReimbursements, setTransactionList]);

  // ─── Render ───────────────────────────────────────────────────────────────

  // Compute balance live from local state so it updates immediately after add/edit/delete
  const postedExpenses  = useMemo(() => expenseTxns.filter(t => t.status !== "scheduled").reduce((s, t) => s + t.amount, 0), [expenseTxns]);
  const scheduledDrain  = useMemo(() => expenseTxns.filter(t => t.status === "scheduled").reduce((s, t) => s + t.amount, 0), [expenseTxns]);
  const balance   = totalIncome - postedExpenses + totalDoorRev;
  const projected = Math.round((balance - scheduledDrain) * 1.3);

  // Dues outstanding — surfaced in the glance strip and the AI digest.
  const duesTotal   = useMemo(() => brotherList.reduce((s, b) => s + b.duesOwed, 0), [brotherList]);
  const owingCount  = useMemo(() => brotherList.filter(b => b.duesOwed > 0).length, [brotherList]);

  // One-line editorial digest built from live figures (mirrors sibling pages' AI line).
  const digest = `${fmt$(Math.round(balance))} in the books${bwDelta != null ? (bwDelta >= 0 ? " and trending up" : " and trending down") : ""}` +
    (scheduledDrain > 0 ? `, with ${fmt$(Math.round(scheduledDrain))} still scheduled` : "") +
    (owingCount > 0 ? ` — ${owingCount} ${owingCount === 1 ? "brother owes" : "brothers owe"} ${fmt$(Math.round(duesTotal))} in dues.` : ".");

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Treasury" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Slim toolbar (mobile hamburger + breadcrumb) ── */}
        <header className="toolbar-frosted dash-toolbar tr-toolbar-bar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg lg:hidden" aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_MENU} />
            </svg>
          </button>
          <span className="tr-crumb truncate">{v("Treasury")}</span>
        </header>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-treasury" data-dashboard-theme="dusk">

            {/* Error toast */}
            {mutErr && (
              <div className="tr-toast" role="status">
                <span>{mutErr}</span>
                <button onClick={() => setMutErr(null)} aria-label="Dismiss">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Briefing ── */}
            <section className="briefing" aria-label="Treasury">
              <div>
                <p className="kicker">
                  <span className="today">{dateLabel}</span>
                  &ensp;·&ensp;{v("Treasury")}&ensp;·&ensp;{semester}
                </p>
                <h1 className="greeting">The <em>ledger</em>.</h1>
                <div className="digest">
                  <span className="ai-chip">AI</span>
                  <p>{digest}</p>
                </div>
              </div>
              <div className="tr-head-actions">
                {semesters.map(s => (
                  <button key={s} onClick={() => setSemester(s)} className={`tr-sem-pill${semester === s ? " on" : ""}`}>
                    {s}
                  </button>
                ))}
                {canTreasury && (
                  <TreasuryIconButton onClick={handleExport} title="Export CSV">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_EXPORT} /></svg>
                  </TreasuryIconButton>
                )}
                <TreasuryIconButton onClick={() => setPartyModal({ kind: "addParty" })} title="Add Party Event">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PARTY} /></svg>
                </TreasuryIconButton>
                <button className="tr-add tr-add-reimb" onClick={() => setReimbModal(true)}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Add Reimbursement
                </button>
                {canTreasury && (
                  <button className="tr-add" onClick={() => setTxModal({ kind: "addTx" })}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    New txn
                  </button>
                )}
              </div>
            </section>

            {/* ── Tab nav (kept) ── */}
            <nav className="tr-tabs">
              {NAV_TABS.map(tab => (
                <button key={tab} className={navTab === tab ? "on" : ""} onClick={() => setNavTab(tab)}>
                  {tab}
                  {tab === "Reimbursements" && pendingReimbCount > 0 && (
                    <span className="tr-tab-badge" aria-label={`${pendingReimbCount} requests awaiting review`}>{pendingReimbCount > 9 ? "9+" : pendingReimbCount}</span>
                  )}
                </button>
              ))}
            </nav>

            {isLoading ? (
              <>
                <div className="tr-skel tr-glance" style={{ height: 86, marginTop: 22 }} />
                <div className="tr-hero">
                  <div className="tr-skel" style={{ height: 360 }} />
                  <div className="tr-skel" style={{ height: 360 }} />
                </div>
                <div className="tr-skel" style={{ height: 420, marginTop: 18 }} />
              </>
            ) : (<>

            {/* ── At-a-glance strip (the addition) ── */}
            <div className="tr-glance">
              <LedgerStrip>
                <Measure
                  label="Balance"
                  value={fmt$(Math.round(balance))}
                  note={`projected ${fmt$(Math.round(projected))} · ${semester}`}
                  spark={<svg className="spark" width="48" height="20" viewBox="0 0 48 20"><polyline points="0,16 8,15 16,12 24,13 32,8 40,6 48,3" /></svg>}
                />
                <Measure
                  label="Income"
                  value={fmt$(Math.round(totalIncome))}
                  note={`${incomeTxns.length} ${incomeTxns.length === 1 ? "transaction" : "transactions"}`}
                />
                <Measure
                  label="Expenses"
                  value={fmt$(Math.round(totalExpenses))}
                  note={scheduledDrain > 0 ? `${fmt$(Math.round(scheduledDrain))} scheduled` : `${expenseTxns.length} ${expenseTxns.length === 1 ? "transaction" : "transactions"}`}
                  noteWarn={scheduledDrain > 0}
                />
                <Measure
                  label="Dues outstanding"
                  value={fmt$(Math.round(duesTotal))}
                  note={owingCount > 0 ? `${owingCount} ${owingCount === 1 ? "brother" : "brothers"} owing` : "all settled"}
                  noteWarn={owingCount > 0}
                />
              </LedgerStrip>
            </div>

            {/* ── Hero row: Balance chart + Donut ─── Overview only ── */}
            {navTab === "Overview" && <div className="tr-hero">

              {/* ── Hero Balance Card ──────────────────────────────────────── */}
              <FinanceCard className="flex flex-col overflow-hidden">
                {/* Card header */}
                <div className="tr-bal-top">
                  <div>
                    <p className="tr-bal-label">{v("Treasury")} Balance</p>
                    <div className="tr-bal-row">
                      <span className={`tr-bal-num${balance < 0 ? " neg" : ""}`}>{fmt$(Math.round(balance))}</span>
                      {bwDelta !== null && (
                        <span className={`tr-bal-chip ${bwDelta >= 0 ? "up" : "down"}`}>
                          {bwDelta >= 0 ? "+" : ""}{fmt$(Math.round(bwDelta))} biweekly
                        </span>
                      )}
                    </div>
                    {scheduledDrain > 0 && (
                      <span className="tr-bal-sched">
                        −{fmt$(Math.round(scheduledDrain))} scheduled → {fmt$(Math.round(balance - scheduledDrain))} projected
                      </span>
                    )}
                    <p className="tr-bal-meta">{semester} · Projected <b>{fmt$(Math.round(projected))}</b></p>
                  </div>
                  {/* Range selector */}
                  <div className="tr-ranges">
                    {(["2W","1M","3M","YTD","ALL"] as const).map(r => (
                      <button key={r} onClick={() => setChartRange(r)} className={chartRange === r ? "on" : ""}>{r}</button>
                    ))}
                  </div>
                </div>

                {/* KPI mini-row */}
                <div className="tr-kpi">
                  <div>
                    <p className="k">Income</p>
                    <p className="v sage">{fmt$(Math.round(totalIncome))}</p>
                    <p className="m">{incomeTxns.length} txns</p>
                  </div>
                  <div>
                    <p className="k">Expenses</p>
                    <p className="v rose">{fmt$(Math.round(totalExpenses))}</p>
                    <p className="m">{expenseTxns.length} txns</p>
                  </div>
                </div>

                {/* Area + Biweekly charts */}
                <div className="tr-chart">
                  <TreasuryAreaChart
                    data={filteredRunningData}
                    biweeklyData={biweeklyData}
                    semester={semester}
                  />
                </div>
              </FinanceCard>

              {/* ── Category Donut Card ────────────────────────────────────── */}
              <FinanceCard className="flex flex-col overflow-hidden">
                <div className="card-h">
                  <h2>Breakdown</h2>
                  <div className="tr-donut-toggle">
                    {(["expense", "income"] as const).map(m => (
                      <button key={m} onClick={() => setDonutMode(m)} className={donutMode === m ? "on" : ""}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Donut chart */}
                {donutData.length === 0 ? (
                  <div className="tr-empty">No {donutMode} data</div>
                ) : (
                  <>
                    {/* Chart area */}
                    <div className="tr-donut-wrap">
                      <TreasuryDonutChart data={donutData} />

                      {/* Center label — sits inside the hole */}
                      <div className="tr-donut-center">
                        <div>
                          <p className="lbl">{donutMode === "expense" ? "Expenses" : "Income"}</p>
                          <p className="amt">{fmt$(Math.round(donutTotal))}</p>
                          <p className="cnt">{donutData.length} {donutData.length === 1 ? "category" : "categories"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Category list */}
                    <div className="tr-cat-list">
                      {donutData.map((entry, index) => {
                        const pct = donutTotal > 0 ? (entry.value / donutTotal) * 100 : 0;
                        const color = catColor(entry.name, index);
                        return (
                          <div key={entry.name} className="tr-cat">
                            <span className="rank">{index + 1}</span>
                            <span className="swatch" style={{ background: color }} />
                            <div className="body">
                              <div className="top">
                                <span className="nm">{entry.name}</span>
                                <span><span className="pct">{pct.toFixed(1)}%</span><span className="amt">{fmt$(Math.round(entry.value))}</span></span>
                              </div>
                              <div className="bar"><i style={{ width: `${pct}%`, background: color }} /></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </FinanceCard>

            </div>}{/* end hero grid */}

            {/* ── Budget tab: BudgetView ─────────────────────────────────── */}
            {navTab === "Budget" && (
              <div className="mt-4">
                <BudgetView
                  semester={semester}
                  transactions={activeTxns}
                  currentBalance={balance}
                  isAdmin={canTreasury}
                  onError={msg => setMutErr(msg)}
                />
              </div>
            )}

            {/* ── Bottom row: Dues, Upcoming, Reports ── Overview only ──────── */}
            {navTab === "Overview" && <div className="tr-lower">

              {/* ── Brothers with Dues ───────────────────────────────────── */}
              <FinanceCard>
                <div className="card-h">
                  <h2>Brothers with Dues</h2>
                  <span className="sub">{owingCount} owing · {fmt$(duesTotal)}</span>
                </div>
                {brothersOwing.length === 0 ? (
                  <div className="tr-empty-stack"><p>No brothers yet</p></div>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto">
                    {brothersOwing.map(b => (
                      <div key={b.id} className="tr-row">
                        <BrotherAvatar
                          brother={b}
                          selfId={selfId}
                          selfAvatarUrl={currentUser?.avatarUrl}
                          avatarRevision={avatarRevision}
                          size="sm"
                        />
                        <div className="who">
                          <p className="nm">{b.name}</p>
                          <p className="rl">{b.role}</p>
                        </div>
                        {b.duesOwed > 0
                          ? <span className="owe">{fmt$(b.duesOwed)}</span>
                          : <span className="owe zero">—</span>
                        }
                        {canTreasury && (
                          <div className="acts">
                            {b.duesOwed > 0 && (
                              <button className="tr-mini-btn" onClick={() => { setDuesTarget(b); setDuesAction("deduct"); setDuesAmountStr(String(b.duesOwed)); }}>Pay</button>
                            )}
                            <button className="tr-mini-btn ghost" onClick={() => { setDuesTarget(b); setDuesAction("assign"); setDuesAmountStr(""); }}>+ Add</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </FinanceCard>

              {/* ── Upcoming ──────────────────────────────────────────────── */}
              <FinanceCard>
                <div className="card-h">
                  <h2>Upcoming</h2>
                  <span className="sub">Events & txns</span>
                </div>
                {upcomingParties.length === 0 && upcomingTxns.length === 0 ? (
                  <div className="tr-empty-stack">
                    <p>No upcoming treasury items</p>
                    <button onClick={() => setPartyModal({ kind: "addParty" })}>+ Schedule an event</button>
                  </div>
                ) : (
                  <div>
                    {upcomingParties.map(p => (
                      <div key={`party-${p.id}`} className="tr-ev-row">
                        <div className="glyph party">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PARTY} /></svg>
                        </div>
                        <div className="body">
                          <p className="t">{p.name}</p>
                          <p className="m">{fmtDate(p.date)} · Party event</p>
                        </div>
                        <span className="amt party">{fmt$(p.doorRevenue)}</span>
                      </div>
                    ))}
                    {upcomingTxns.map(t => (
                      <div key={`tx-${t.id}`} className="tr-ev-row">
                        <div className={`glyph ${t.type === "income" ? "inc" : "exp"}`}>
                          {t.category.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="body">
                          <p className="t">{t.description || t.category}</p>
                          <p className="m">{fmtDate(t.date)}</p>
                        </div>
                        {t.status === "scheduled" && <span className="tag">Scheduled</span>}
                        <span className={`amt ${t.type === "income" ? "inc" : "exp"}`}>
                          {t.type === "income" ? "+" : "−"}{fmt$(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </FinanceCard>

              {/* ── Reports ───────────────────────────────────────────────── */}
              <FinanceCard className="flex flex-col">
                <div className="card-h">
                  <h2>Reports</h2>
                  <span className="sub">{semester}</span>
                </div>
                <div className="tr-rep">
                  <div className="line"><span className="k">Total Income</span><span className="v sage">{fmt$(Math.round(totalIncome))}</span></div>
                  <div className="line"><span className="k">Total Expenses</span><span className="v rose">{fmt$(Math.round(totalExpenses))}</span></div>
                  <div className="line"><span className="k">Door Revenue</span><span className="v party">{fmt$(Math.round(totalDoorRev))}</span></div>
                  <hr />
                  <div className="line total"><span className="k">Net Balance</span><span className={`v${balance < 0 ? " rose" : ""}`}>{fmt$(Math.round(balance))}</span></div>
                  <div className="line"><span className="k">Projected</span><span className="v">{fmt$(Math.round(projected))}</span></div>
                  <div className="line"><span className="k">Party Events</span><span className="v">{partyList.length}</span></div>
                  {canTreasury && (
                    <button className="tr-exp-btn" onClick={handleExport}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_EXPORT} /></svg>
                      Export CSV
                    </button>
                  )}
                </div>
              </FinanceCard>
            </div>}{/* end Overview bottom row */}

            {/* ── Full Transaction Log ── Overview + Transactions tabs ────── */}
            {(navTab === "Overview" || navTab === "Transactions") && <>

            <div className="tr-secnote">— The record —</div>

            <FinanceCard className="overflow-hidden">
              <div className="tr-log-h">
                <h2>Transaction Log</h2>
                <div className="tr-txtabs">
                  {(["all", "income", "expense"] as TxTab[]).map(tab => (
                    <button
                      key={tab}
                      className={txTab === tab ? "on" : ""}
                      onClick={() => { setTxTab(tab); setTxCategory("all"); setTxSearch(""); }}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <select className="tr-select" value={txCategory} onChange={e => setTxCategory(e.target.value)}>
                  <option value="all">All categories</option>
                  {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="tr-grow" />
                <span className="tr-log-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  <input
                    type="search"
                    value={txSearch}
                    onChange={e => setTxSearch(e.target.value)}
                    placeholder="Search description, category…"
                  />
                  {txSearch && (
                    <button className="clear" onClick={() => setTxSearch("")} aria-label="Clear search">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </span>
                <span className={`tr-log-total ${txTab === "expense" ? "rose" : txTab === "income" ? "sage" : tabTotals.all >= 0 ? "sage" : "rose"}`}>
                  {txTab === "all" && tabTotals.all >= 0 && "+"}{fmt$(Math.round(tabTotals[txTab]))}
                </span>
              </div>

              {txnsWithRunning.length === 0 ? (
                <div className="tr-table-empty">No transactions for this semester · click New txn to log one</div>
              ) : (
                <div className="tr-table-wrap">
                  <table className="tr-table">
                    <thead>
                      <tr>
                        {["Date", "Category", "Description", "Method", "Amount", "Balance", ""].map((h, i) => (
                          <th key={h || `act-${i}`} className={h === "Amount" || h === "Balance" ? "r" : undefined}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txnsWithRunning.map(t => (
                        <tr key={t.id}>
                          <td className="date">{fmtDate(t.date)}</td>
                          <td>
                            <span className="tr-pill"><span className={`pdot ${t.type === "income" ? "inc" : "exp"}`} />{t.category}</span>
                            {t.status === "scheduled" && <span className="tr-sched-tag">Sched</span>}
                          </td>
                          <td>
                            <div className="desc">{t.description || "—"}</div>
                            {t.calendarEvents?.map(ev => (
                              <div key={ev.id} className="tr-ev-link">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                {ev.title}
                              </div>
                            ))}
                          </td>
                          <td><span className="method">{t.paymentMethod ?? "—"}</span></td>
                          <td className="r"><span className={`amt ${t.type === "income" ? "inc" : "exp"}`}>{t.type === "income" ? "+" : "−"}{fmt$(t.amount)}</span></td>
                          <td className="r"><span className={`run${t.running < 0 ? " neg" : ""}`}>{fmt$(Math.round(t.running))}</span></td>
                          <td className="r">
                            {canTreasury && (
                              <div className="tr-row-acts">
                                {t.status === "scheduled" && (
                                  <button className="tr-markpaid" onClick={() => handleMarkPaid(t)}>Mark Paid</button>
                                )}
                                <IconBtn path={ICON_EDIT}  label="Edit"   tone="edit" onClick={() => setTxModal({ kind: "editTx", tx: t })} />
                                <IconBtn path={ICON_TRASH} label="Delete" tone="del"  onClick={() => setDeleteModal({ kind: "tx", tx: t })} />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </FinanceCard>
            </>}

            {/* ── Party Events ── Overview tab only ────────────────────────── */}
            {navTab === "Overview" && (() => {
              const sortedParties = [...partyList].sort((a, b) => b.date.localeCompare(a.date));
              const totalDoorRev  = partyList.reduce((s, p) => s + p.doorRevenue, 0);
              return (
                <FinanceCard className="overflow-hidden" style={{ marginTop: 18 }}>
                  <div className="tr-log-h">
                    <h2>Party Events</h2>
                    <span className="sub">Door revenue · {sortedParties.length} events · {fmt$(Math.round(totalDoorRev))} total</span>
                    <span className="tr-grow" />
                    {canTreasury && <button className="tr-card-act" onClick={() => setPartyModal({ kind: "addParty" })}>+ Add Event</button>}
                  </div>
                  {sortedParties.length === 0 ? (
                    <div className="tr-table-empty">No events logged · click + Add Event to create one</div>
                  ) : (
                    <div className="tr-table-wrap">
                      <table className="tr-table">
                        <thead>
                          <tr>
                            {["Name", "Date", "Door Revenue", "Attendance", "Notes", ""].map((h, i) => (
                              <th key={h || `act-${i}`} className={h === "Door Revenue" ? "r" : undefined}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedParties.map(p => (
                            <tr key={p.id}>
                              <td><span className="desc" style={{ fontWeight: 600 }}>{p.name}</span></td>
                              <td className="date">{fmtDate(p.date)}</td>
                              <td className="r"><span className="party-rev">{fmt$(p.doorRevenue)}</span></td>
                              <td><span className="method" style={{ textTransform: "none" }}>{p.attendance}</span></td>
                              <td><span className="desc">{p.notes || "—"}</span></td>
                              <td className="r">
                                <div className="tr-row-acts">
                                  <IconBtn path={ICON_EDIT}  label="Edit"   tone="edit" onClick={() => setPartyModal({ kind: "editParty", event: p })} />
                                  {canTreasury && (
                                    <IconBtn path={ICON_TRASH} label="Delete" tone="del" onClick={() => setDeleteModal({ kind: "party", event: p })} />
                                  )}
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
              <FinanceCard className="flex flex-col gap-4 p-6" style={{ marginTop: 18 }}>
                <div className="card-h" style={{ padding: 0, border: 0 }}>
                  <h2>Semester Report — {semester}</h2>
                </div>
                <div className="tr-report-grid">
                  {[
                    { label: "Total Income",   value: fmt$(Math.round(totalIncome)),   tone: "sage" },
                    { label: "Total Expenses", value: fmt$(Math.round(totalExpenses)), tone: "rose" },
                    { label: "Door Revenue",   value: fmt$(Math.round(totalDoorRev)),  tone: "party" },
                    { label: "Net Balance",    value: fmt$(Math.round(balance)),       tone: balance >= 0 ? "vio" : "rose" },
                  ].map(({ label, value, tone }) => (
                    <div key={label} className="tr-report-cell">
                      <p className="k">{label}</p>
                      <p className={`v ${tone}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="tr-report-cell" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p className="k">Projected end-of-semester</p>
                    <p className="v">{fmt$(Math.round(projected))}</p>
                  </div>
                  {canTreasury && (
                    <button className="tr-exp-btn" onClick={handleExport}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_EXPORT} /></svg>
                      Export CSV
                    </button>
                  )}
                </div>
              </FinanceCard>
            )}

            {navTab === "Reimbursements" && (
              <ReimbursementsView
                reimbursements={reimbursements}
                canTreasury={canTreasury}
                selfId={selfId}
                balance={balance}
                showArchived={reimbArchived}
                onToggleArchived={() => setReimbArchived(v => !v)}
                onAction={handleReimbursementAction}
              />
            )}

            </>)}

          </div>
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {reimbModal && (
        <Modal
          tone="dusk"
          title="Add Reimbursement"
          onClose={() => setReimbModal(false)}
        >
          <ReimbursementForm
            onSubmit={handleSubmitReimbursement}
            onCancel={() => setReimbModal(false)}
          />
        </Modal>
      )}

      {txModal && (
        <Modal
          tone="dusk"
          title={txModal.kind === "addTx" ? "Add Transaction" : "Edit Transaction"}
          onClose={() => setTxModal(null)}
        >
          <TxForm
            tone="dusk"
            initial={txModal.kind === "editTx" ? txModal.tx : undefined}
            onSubmit={data => txModal.kind === "addTx" ? handleAddTx(data) : handleEditTx(txModal.tx, data)}
            onCancel={() => setTxModal(null)}
            events={calendarEvents}
          />
        </Modal>
      )}

      {partyModal && (
        <Modal
          tone="dusk"
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
          tone="dusk"
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
          tone="dusk"
          title={duesAction === "deduct" ? "Record Payment" : "Assign Dues"}
          onClose={() => setDuesTarget(null)}
        >
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-[#958d7c] mb-3">
                {duesTarget.name} currently owes{" "}
                <span className="font-semibold text-[#ddb36a]">{fmt$(duesTarget.duesOwed)}</span>
              </p>
              <FieldLabel tone="dusk">{duesAction === "deduct" ? "Amount Paid ($)" : "Amount to Assign ($)"}</FieldLabel>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputDuskCls}
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
                  <p className="mt-1.5 text-[11px] text-[#958d7c]">
                    New balance:{" "}
                    <span className={newOwed === 0 ? "text-[#a78bfa] font-semibold" : "text-[#c9c2b4]"}>
                      {fmt$(newOwed)}
                    </span>
                  </p>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDuesTarget(null)} className={btnDuskGhostCls}>
                Cancel
              </button>
              <button
                onClick={submitDuesAction}
                disabled={!(parseFloat(duesAmountStr) > 0)}
                className={btnDuskActionCls}
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
