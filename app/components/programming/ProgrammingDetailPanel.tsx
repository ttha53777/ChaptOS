"use client";

import { useEffect, useState } from "react";
import type { ProgrammingTask, Transaction } from "../../data";
import { fmt$, fmtDate } from "../../data";
import { Card, FieldLabel, Modal } from "../dashboard/primitives";
import { inputDuskCls, btnDuskActionCls, btnDuskGhostCls } from "../dashboard/styles";
import { PrepStatusPill, StarRating, TypeBadge } from "./PrepStatusPill";
import { ProgrammingChecklist } from "./ProgrammingChecklist";
import { AttachmentField } from "./AttachmentField";
import { TxForm, type TxFormEvent } from "../treasury/TxForm";
import type { Doc } from "@/app/[slug]/docs/DocCard";
import { requestJson } from "../../lib/api";
import { programmingPrepScore } from "@/lib/programming";
import { STAGE_LABELS, STAGES, type ProgrammingStage } from "@/lib/state/programming-stage";
import { todayStr } from "../../lib/dates";

export function ProgrammingDetailPanel({
  event,
  canManage,
  onPatch,
  onStage,
  onEdit,
  onDelete,
}: {
  event: ProgrammingTask;
  canManage: boolean;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
  onStage?: (id: number, stage: ProgrammingStage) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [resourceDocs, setResourceDocs] = useState<Doc[]>([]);
  const [notes, setNotes] = useState(event.wrapUpNotes ?? "");
  const [stageLoading, setStageLoading] = useState(false);
  const [linkedTxns, setLinkedTxns] = useState<Transaction[]>([]);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  // Animate prep bar from 0 → real value on mount/event change.
  const [prepPct, setPrepPct] = useState(0);

  const isPast = event.dueDate != null && event.dueDate < todayStr();
  const prep = programmingPrepScore(event);

  useEffect(() => {
    setNotes(event.wrapUpNotes ?? "");
  }, [event.id, event.wrapUpNotes]);

  // Kick off prep-bar animation after first paint so the CSS transition fires.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setPrepPct(prep.total ? (prep.done / prep.total) * 100 : 0);
    });
    return () => cancelAnimationFrame(id);
  }, [event.id, prep.done, prep.total]);

  // Fetch Resources docs once for the / picker.
  useEffect(() => {
    requestJson<Doc[]>("/api/docs")
      .then(setResourceDocs)
      .catch(() => setResourceDocs([]));
  }, []);

  // Fetch linked transactions whenever the calendarEventId changes.
  useEffect(() => {
    if (!event.calendarEventId) {
      setLinkedTxns([]);
      return;
    }
    setTxLoading(true);
    requestJson<Transaction[]>(`/api/transactions?calendarEventId=${event.calendarEventId}`)
      .then(rows => setLinkedTxns(rows))
      .catch(() => setLinkedTxns([]))
      .finally(() => setTxLoading(false));
  }, [event.calendarEventId]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-t-2xl border-[rgba(236,231,221,0.1)] !bg-[#0f0d0a] xl:h-auto" style={{ background: "linear-gradient(to bottom,#ece7dd0a 0%,#0f0d0a 45%)" }}>
      <div className="border-b border-[rgba(236,231,221,0.07)] px-5 py-4 pr-14 xl:pr-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-[#ece7dd]">{event.title}</h2>
            <p className="mt-1 text-[12px] text-[#958d7c]">
              {event.dueDate ? fmtDate(event.dueDate) : "No date set"}{event.time ? ` · ${event.time}` : ""}{event.location ? ` · ${event.location}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TypeBadge type={event.type} />
              {event.collab && (
                <span className="text-[11px] text-[#6b6354]">w/ {event.collab}</span>
              )}
              {onStage && canManage && (
                <div className="relative flex items-center">
                  <select
                    value={event.stage}
                    disabled={stageLoading}
                    onChange={async e => {
                      setStageLoading(true);
                      try { await onStage(event.id, e.target.value as ProgrammingStage); }
                      finally { setStageLoading(false); }
                    }}
                    className={`rounded-md border border-[rgba(236,231,221,0.12)] bg-[rgba(236,231,221,0.04)] px-2 py-0.5 text-[11px] font-medium text-[#c9c2b4] focus:border-[#a78bfa]/40 focus:outline-none transition-opacity ${stageLoading ? "opacity-40" : ""}`}
                  >
                    {STAGES.map(s => <option key={s} value={s} className="bg-[#0f0d0a]">{STAGE_LABELS[s]}</option>)}
                  </select>
                  {stageLoading && (
                    <svg className="ml-1.5 h-3 w-3 animate-spin text-[#958d7c]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                  )}
                </div>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1.5">
              <button onClick={onEdit} className="rounded-md bg-[rgba(236,231,221,0.05)] px-2.5 py-1 text-[11px] font-medium text-[#c9c2b4] ring-1 ring-inset ring-[rgba(236,231,221,0.1)] hover:bg-[#a78bfa]/15 hover:text-[#c4b5fd]">
                Edit
              </button>
              <button onClick={onDelete} className="rounded-md bg-[#d98ba3]/10 px-2.5 py-1 text-[11px] font-medium text-[#d98ba3] ring-1 ring-inset ring-[#d98ba3]/20 hover:bg-[#d98ba3]/20">
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-[#6b6354]">
            <span>Prep progress</span>
            <span className="tabular-nums">{prep.done}/{prep.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(236,231,221,0.06)]">
            <div
              className="h-full rounded-full bg-[#a78bfa] transition-all duration-500 ease-out"
              style={{ width: `${prepPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Checklist</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel tone="dusk">Room confirmed</FieldLabel>
              <PrepStatusPill
                value={event.roomStatus}
                disabled={!canManage}
                onChange={v => onPatch(event.id, { roomStatus: v as ProgrammingTask["roomStatus"] })}
              />
            </div>
            <div>
              <FieldLabel tone="dusk">Attachments</FieldLabel>
              <AttachmentField
                attachmentUrl={event.attachmentUrl}
                attachmentDocId={event.attachmentDocId}
                docs={resourceDocs}
                canManage={canManage}
                onUrlCommit={url => onPatch(event.id, { attachmentUrl: url, attachmentDocId: null })}
                onDocPick={id => onPatch(event.id, { attachmentDocId: id, attachmentUrl: null })}
                onClear={() => onPatch(event.id, { attachmentUrl: null, attachmentDocId: null })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className={`flex items-center gap-2 text-[12px] ${canManage ? "cursor-pointer" : ""} text-[#c9c2b4]`}>
              <input
                type="checkbox"
                checked={event.flyerPosted}
                disabled={!canManage}
                onChange={e => onPatch(event.id, { flyerPosted: e.target.checked })}
                className="h-4 w-4 rounded accent-[#a78bfa]"
              />
              Flyer posted
            </label>
          </div>
          <div>
            <FieldLabel tone="dusk">Spending (manual)</FieldLabel>
            {canManage ? (
              <input
                type="number"
                min={0}
                step={0.01}
                className={`${inputDuskCls} max-w-[140px] tabular-nums`}
                value={(event.spendingCents / 100).toFixed(2)}
                onChange={e => {
                  const cents = Math.round(parseFloat(e.target.value || "0") * 100);
                  if (Number.isFinite(cents)) onPatch(event.id, { spendingCents: Math.max(0, cents) });
                }}
              />
            ) : (
              <p className="text-[13px] tabular-nums text-[#ece7dd]">{fmt$(event.spendingCents / 100)}</p>
            )}
          </div>
        </section>

        {/* ── Linked Transactions ─────────────────────────────────────────── */}
        {event.calendarEventId && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Linked Transactions</h3>
              {canManage && !showTxForm && (
                <button
                  onClick={() => setShowTxForm(true)}
                  className="text-[11px] font-semibold text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
                >
                  + Log transaction
                </button>
              )}
            </div>

            {showTxForm && (
              <TxForm
                tone="dusk"
                lockType="expense"
                lockEventIds={event.calendarEventId ? [event.calendarEventId] : []}
                events={event.calendarEventId ? [{
                  id: event.calendarEventId,
                  title: event.title,
                  date: event.dueDate ?? todayStr(),
                  category: event.type,
                }] : []}
                initial={{ date: event.dueDate ?? todayStr() }}
                onCancel={() => setShowTxForm(false)}
                onSubmit={async data => {
                  try {
                    const saved = await requestJson<Transaction>("/api/transactions", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(data),
                    });
                    setLinkedTxns(prev => [saved, ...prev]);
                    setShowTxForm(false);
                  } catch {
                    // leave form open so user can retry
                  }
                }}
              />
            )}

            {txLoading ? (
              <p className="text-[12px] text-[#6b6354]">Loading…</p>
            ) : linkedTxns.length === 0 && !showTxForm ? (
              <p className="text-[12px] text-[#6b6354]">No transactions linked to this event yet.</p>
            ) : linkedTxns.length > 0 ? (
              <>
                <div className="space-y-1">
                  {linkedTxns.map(t => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] text-[#c9c2b4]">{t.description || t.category}</p>
                        <p className="text-[10px] text-[#6b6354]">{fmtDate(t.date)} · {t.category}</p>
                      </div>
                      <span className={`ml-3 shrink-0 font-mono text-[12px] font-medium tabular-nums ${t.type === "income" ? "text-[#7ecba3]" : "text-[#d98ba3]"}`}>
                        {t.type === "income" ? "+" : "−"}{fmt$(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Total expenses</span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-[#d98ba3]">
                    {fmt$(linkedTxns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0))}
                  </span>
                </div>
              </>
            ) : null}
          </section>
        )}

        <ProgrammingChecklist
          eventId={event.id}
          items={event.checklist}
          canManage={canManage}
          onChange={items => onPatch(event.id, { checklist: items })}
        />

        {isPast && (
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Post-event</h3>
            <FieldLabel tone="dusk">Event success</FieldLabel>
            <StarRating
              value={event.successRating}
              disabled={!canManage}
              onChange={v => onPatch(event.id, { successRating: v })}
            />
            {canManage && (
              <>
                <FieldLabel tone="dusk">Notes</FieldLabel>
                <textarea
                  className={`${inputDuskCls} min-h-[72px] resize-y`}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={() => {
                    if (notes !== (event.wrapUpNotes ?? "")) {
                      onPatch(event.id, { wrapUpNotes: notes.trim() || null });
                    }
                  }}
                  placeholder="Debrief, lessons learned…"
                />
              </>
            )}
          </section>
        )}
      </div>
    </Card>
  );
}
