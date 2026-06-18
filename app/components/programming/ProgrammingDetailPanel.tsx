"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ProgrammingTask, Transaction } from "../../data";
import { fmt$, fmtDate } from "../../data";
import { Card, Modal } from "../dashboard/primitives";
import { inputDuskCls } from "../dashboard/styles";
import { PrepStatusPill, TypeBadge } from "./PrepStatusPill";
import { ProgrammingChecklist } from "./ProgrammingChecklist";
import { AttachmentField } from "./AttachmentField";
import { TxForm, type TxFormEvent } from "../treasury/TxForm";
import type { Doc } from "@/app/[slug]/docs/DocCard";
import { requestJson } from "../../lib/api";
import { programmingPrepChecks, programmingPrepScore } from "@/lib/programming";
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
  // Animate prep ring from 0 → real value on mount/event change.
  const [prepPct, setPrepPct] = useState(0);
  // Collapsed-by-default disclosure for the completed prep items.
  const [showDone, setShowDone] = useState(false);

  const isPast = event.dueDate != null && event.dueDate < todayStr();
  const isDone = event.stage === "done";
  const prep = programmingPrepScore(event);

  // Per-item done-ness comes straight from the scoring helper so the rows stay in
  // lockstep with the progress bar. Each row pairs that status with its inline control.
  const prepDone = Object.fromEntries(
    programmingPrepChecks(event).map(c => [c.key, c.done]),
  ) as Record<string, boolean>;
  const hasItineraryFile = Boolean(event.attachmentUrl?.trim() || event.attachmentDocId);
  const prepRows = [
    {
      key: "room",
      label: "Room confirmed",
      done: prepDone.room,
      onToggleDone: canManage && !isDone
        ? () => onPatch(event.id, { roomStatus: prepDone.room ? "not_submitted" : "confirmed" })
        : undefined,
      control: (
        <PrepStatusPill
          value={event.roomStatus}
          disabled={!canManage || isDone}
          onChange={isDone ? undefined : v => onPatch(event.id, { roomStatus: v as ProgrammingTask["roomStatus"] })}
        />
      ),
    },
    {
      key: "attachment",
      label: "Itinerary attached",
      done: prepDone.attachment,
      wide: canManage && !isDone && !hasItineraryFile,
      onToggleDone: canManage && !isDone && !hasItineraryFile
        ? () => onPatch(event.id, { itineraryNotNeeded: !event.itineraryNotNeeded })
        : undefined,
      control: isDone ? (
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${prepDone.attachment ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/35" : "bg-slate-500/15 text-slate-400 ring-slate-400/25"}`}>
          {prepDone.attachment ? "Attached" : "None"}
        </span>
      ) : (
        <AttachmentField
          attachmentUrl={event.attachmentUrl}
          attachmentDocId={event.attachmentDocId}
          docs={resourceDocs}
          canManage={canManage}
          onUrlCommit={url => onPatch(event.id, { attachmentUrl: url, attachmentDocId: null })}
          onDocPick={id => onPatch(event.id, { attachmentDocId: id, attachmentUrl: null })}
          onClear={() => onPatch(event.id, { attachmentUrl: null, attachmentDocId: null })}
        />
      ),
    },
    {
      key: "flyer",
      label: "Flyer posted",
      done: prepDone.flyer,
      onToggleDone: canManage && !isDone ? () => onPatch(event.id, { flyerPosted: !event.flyerPosted }) : undefined,
      control: (
        <PrepToggle
          on={event.flyerPosted}
          disabled={!canManage || isDone}
          onToggle={() => onPatch(event.id, { flyerPosted: !event.flyerPosted })}
        />
      ),
    },
    {
      key: "socials",
      label: "Socials meeting held",
      done: prepDone.socials,
      onToggleDone: canManage && !isDone ? () => onPatch(event.id, { socialsMeeting: !event.socialsMeeting }) : undefined,
      control: (
        <PrepToggle
          on={event.socialsMeeting}
          disabled={!canManage || isDone}
          onToggle={() => onPatch(event.id, { socialsMeeting: !event.socialsMeeting })}
        />
      ),
    },
  ];
  const todoRows = prepRows.filter(r => !r.done);
  const doneRows = prepRows.filter(r => r.done);

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
        {!isDone && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
            <ProgressRing pct={prepPct} complete={prep.done === prep.total} />
            <div className="min-w-0">
              {prep.done === prep.total ? (
                <>
                  <p className="text-[12.5px] font-semibold text-[#7ecba3]">Ready to go</p>
                  <p className="text-[11px] text-[#6b6354]">All {prep.total} prep items complete</p>
                </>
              ) : (
                <>
                  <p className="text-[12.5px] font-semibold text-[#ece7dd]">
                    <span className="tabular-nums text-[#d9b08b]">{prep.total - prep.done}</span> {prep.total - prep.done === 1 ? "item" : "items"} left to prep
                  </p>
                  <p className="text-[11px] text-[#6b6354]">{prep.done} of {prep.total} done</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">

        {/* ── Wrap-up card — shown first when event is done ── */}
        {isDone && (
          <section>
            <div className="overflow-hidden rounded-xl border border-[#d9b08b]/25 bg-gradient-to-b from-[#d9b08b]/[0.07] to-[#d9b08b]/[0.03]">
              {/* Header */}
              <div className="flex items-center gap-2.5 border-b border-[#d9b08b]/15 px-4 py-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d9b08b]/15">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#d9b08b]">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <h3 className="text-[12px] font-semibold text-[#d9b08b]">Event wrap-up</h3>
                <span className="ml-auto rounded-full bg-[#7ecba3]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7ecba3]">Done</span>
              </div>

              {/* Star rating */}
              <div className="px-4 pt-4 pb-1">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#6b6354]">How did it go?</p>
                <div className="flex items-center gap-3">
                  <StarRatingLarge
                    value={event.successRating}
                    disabled={!canManage}
                    onChange={v => onPatch(event.id, { successRating: v })}
                  />
                  {event.successRating != null && (
                    <span className="text-[12px] text-[#958d7c]">{RATING_LABELS[event.successRating]}</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="px-4 pt-3 pb-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#6b6354]">Notes</p>
                {canManage ? (
                  <textarea
                    className="w-full resize-none rounded-lg border border-[rgba(236,231,221,0.08)] bg-[rgba(236,231,221,0.03)] px-3 py-2.5 text-[12.5px] text-[#c9c2b4] placeholder:text-[#4a4439] focus:border-[#d9b08b]/40 focus:outline-none transition-colors min-h-[80px]"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={() => {
                      if (notes !== (event.wrapUpNotes ?? "")) {
                        onPatch(event.id, { wrapUpNotes: notes.trim() || null });
                      }
                    }}
                    placeholder="Debrief, what worked, lessons learned…"
                  />
                ) : event.wrapUpNotes ? (
                  <p className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#c9c2b4]">{event.wrapUpNotes}</p>
                ) : (
                  <p className="text-[12px] italic text-[#4a4439]">No notes recorded.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {!isDone && (
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Prep checklist</h3>

            {todoRows.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
                {todoRows.map((row, i) => (
                  <PrepRow key={row.key} row={row} divider={i > 0} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-[#7ecba3]/20 bg-[#7ecba3]/[0.06] px-3 py-2.5 text-[12.5px] font-medium text-[#7ecba3]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 6L9 17l-5-5" /></svg>
                Every prep item is done
              </div>
            )}

            {doneRows.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowDone(v => !v)}
                  className="flex w-full items-center gap-1.5 px-1 py-1.5 text-[11px] font-medium text-[#6b6354] transition-colors hover:text-[#958d7c]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={`h-3 w-3 transition-transform ${showDone ? "rotate-90" : ""}`}><path d="M9 18l6-6-6-6" /></svg>
                  <span className="tabular-nums">{doneRows.length}</span> completed
                  {!showDone && <span className="truncate text-[#4a4439]">· {doneRows.map(r => r.label.replace(/ (confirmed|attached|posted|held)$/, "")).join(", ")}</span>}
                </button>
                {showDone && (
                  <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.01]">
                    {doneRows.map((row, i) => (
                      <PrepRow key={row.key} row={row} divider={i > 0} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Spending</h3>
          {canManage ? (
            <div className="relative max-w-[160px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6b6354]">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                className={`${inputDuskCls} pl-6 tabular-nums`}
                value={(event.spendingCents / 100).toFixed(2)}
                onChange={e => {
                  const cents = Math.round(parseFloat(e.target.value || "0") * 100);
                  if (Number.isFinite(cents)) onPatch(event.id, { spendingCents: Math.max(0, cents) });
                }}
              />
            </div>
          ) : (
            <p className="text-[15px] font-medium tabular-nums text-[#ece7dd]">{fmt$(event.spendingCents / 100)}</p>
          )}
          <p className="text-[10.5px] text-[#6b6354]">Manual total — linked transactions are tracked separately below.</p>
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

        {!isDone && (
          <ProgrammingChecklist
            eventId={event.id}
            items={event.checklist}
            canManage={canManage}
            onChange={items => onPatch(event.id, { checklist: items })}
          />
        )}

      </div>
    </Card>
  );
}

type PrepRowData = { key: string; label: string; done: boolean; control: ReactNode; wide?: boolean; onToggleDone?: () => void };

/**
 * One prep checklist row: status dot · label · inline control. A `wide` control
 * (e.g. the empty itinerary picker, which is a full-width input) stacks below the
 * label instead of cramming into the narrow inline right slot.
 */
function PrepRow({ row, divider }: { row: PrepRowData; divider: boolean }) {
  const border = divider ? "border-t border-white/[0.05]" : "";
  const labelCls = `text-[12.5px] ${row.done ? "text-[#958d7c]" : "font-medium text-[#ece7dd]"}`;
  if (row.wide) {
    return (
      <div className={`px-3 py-2.5 ${border}`}>
        <div className="flex items-center gap-3">
          <PrepDot done={row.done} onToggle={row.onToggleDone} label={row.label} />
          <span className={`min-w-0 flex-1 ${labelCls}`}>{row.label}</span>
        </div>
        <div className="mt-2 pl-8" onClick={e => e.stopPropagation()}>{row.control}</div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${border}`}>
      <PrepDot done={row.done} onToggle={row.onToggleDone} label={row.label} />
      <span className={`min-w-0 flex-1 ${labelCls}`}>{row.label}</span>
      <div className="flex shrink-0 items-center" onClick={e => e.stopPropagation()}>{row.control}</div>
    </div>
  );
}

/** Compact circular prep-progress indicator. Animates via the stroke-dashoffset on pct change. */
function ProgressRing({ pct, complete }: { pct: number; complete: boolean }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const color = complete ? "#7ecba3" : "#a78bfa";
  return (
    <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0 -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(236,231,221,0.08)" strokeWidth={3} />
      <circle
        cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * pct) / 100}
        style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)" }}
      />
    </svg>
  );
}

/**
 * Status dot for a prep row: filled check when done, hollow ring when outstanding.
 * When `onToggle` is supplied the dot becomes a button that flips the item's done
 * state (a quick alternative to the inline control). Itinerary passes no toggle —
 * you can't "mark" a file attached by clicking a dot — so its dot stays passive.
 */
function PrepDot({ done, onToggle, label }: { done: boolean; onToggle?: () => void; label?: string }) {
  const filled = (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7ecba3]/15 text-[#7ecba3]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 6L9 17l-5-5" /></svg>
    </span>
  );
  const hollow = <span className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-dashed border-[#d9b08b]/50" aria-hidden />;

  if (!onToggle) return done ? filled : hollow;

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      aria-pressed={done}
      title={done ? `Mark "${label}" not done` : `Mark "${label}" done`}
      className="group relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/50"
    >
      {done ? (
        // Check by default; swaps to an × on hover to signal it'll un-check.
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7ecba3]/15 text-[#7ecba3] group-hover:bg-[#d98ba3]/15 group-hover:text-[#d98ba3]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 group-hover:hidden"><path d="M20 6L9 17l-5-5" /></svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="hidden h-3 w-3 group-hover:block"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </span>
      ) : (
        // Hollow ring solidifies + shows a faint check on hover to invite the click.
        <span className="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#d9b08b]/50 text-transparent group-hover:border-solid group-hover:border-[#7ecba3]/60 group-hover:text-[#7ecba3]/70">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
      )}
    </button>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: "Rough",
  2: "Okay",
  3: "Good",
  4: "Great",
  5: "Legendary",
};

/** Large interactive star rating for the wrap-up card. */
function StarRatingLarge({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value;
  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange?.(value === n ? null : n)}
          onMouseEnter={() => !disabled && setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          className={`text-[22px] leading-none transition-all duration-75 ${disabled ? "cursor-default" : "cursor-pointer hover:scale-125"} ${display != null && n <= display ? "text-[#d9b08b]" : "text-[#2e2a24]"}`}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** Compact yes/no toggle for boolean prep items (flyer, socials meeting). */
function PrepToggle({ on, disabled, onToggle }: { on: boolean; disabled?: boolean; onToggle: () => void }) {
  if (disabled) {
    return (
      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${on ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/35" : "bg-slate-500/15 text-slate-400 ring-slate-400/25"}`}>
        {on ? "Done" : "To do"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ring-1 ring-inset ${on
        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/25"
        : "bg-white/[0.04] text-[#958d7c] ring-white/10 hover:bg-white/[0.08] hover:text-[#c9c2b4]"}`}
    >
      {on ? "Done" : "Mark done"}
    </button>
  );
}
