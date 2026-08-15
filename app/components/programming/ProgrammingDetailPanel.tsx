"use client";

import { useEffect, useState } from "react";
import type { ProgrammingTask, Transaction } from "../../data";
import { fmt$, fmtDate } from "../../data";
import { Card, Modal } from "../dashboard/primitives";
import { inputDuskCls } from "../dashboard/styles";
import { TypeBadge } from "./ProgrammingChips";
import { AttachmentField } from "./AttachmentField";
import { TxForm, type TxFormEvent } from "../treasury/TxForm";
import type { Doc } from "@/app/[slug]/docs/lib";
import { requestJson } from "../../lib/api";
import { missingFor, needsConfirmFirst } from "@/lib/programming";
import { ownerLabel } from "@/lib/event-owner";
import type { EventFieldDef } from "@/lib/event-fields";
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
  // The org's optional field definitions. Fetched rather than passed so the panel
  // works from anywhere it's mounted; the list is small and cached by the browser.
  const [fieldDefs, setFieldDefs] = useState<EventFieldDef[]>([]);

  const isPast = event.dueDate != null && event.dueDate < todayStr();
  const isDone = event.stage === "done";

  /**
   * What this event still needs before it can move up a lane — the FIELDS, not a
   * prep score. The four booleans this replaced were one org's ops list, and
   * three of the four were self-attested; "Needs date + location" is checkable.
   */
  const nextStage: ProgrammingStage | null =
    event.stage === "idea" ? "planning" : event.stage === "planning" ? "confirmed" : null;
  const missing = nextStage ? missingFor(event, nextStage) : [];

  // Published events are frozen: Confirmed sits on everyone's Timeline, so
  // changing the room or the date silently rewrites a plan people already made.
  // The server enforces this too — the panel just doesn't offer the edit.
  const isPublished = event.stage === "confirmed" || event.stage === "done";
  const canEditFields = canManage && !isPublished;

  useEffect(() => {
    setNotes(event.wrapUpNotes ?? "");
  }, [event.id, event.wrapUpNotes]);

  useEffect(() => {
    requestJson<EventFieldDef[]>("/api/events/fields")
      .then(setFieldDefs)
      .catch(() => setFieldDefs([]));
  }, []);

  // Disabled fields are hidden, never deleted — their answers stay on disk and
  // come back if the org switches the field on again (the server sanitizes reads
  // against the live definitions, so a disabled answer simply doesn't ship).
  const enabledFields = fieldDefs.filter(d => d.enabled);

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
              {/* The owner is a field now, so it says who — and for a role owner,
                  who that is TODAY. A role owner survives the officer turning
                  over; the parenthetical is just a gloss on who holds it. */}
              <span className="text-[11px] text-[#958d7c]">
                {event.owner ? ownerLabel(event.owner) : event.ownerNote ? `${event.ownerNote} (not on the roster)` : "Unowned"}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#6b6354]">
                {event.calendarEventId != null ? "· The chapter can see this" : "· Confirm to publish it to the chapter"}
              </span>
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
        {nextStage && (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
            {missing.length === 0 ? (
              <>
                <p className="text-[12.5px] font-semibold text-[#7ecba3]">
                  Ready to move to {STAGE_LABELS[nextStage]}
                </p>
                <p className="text-[11px] text-[#6b6354]">
                  {nextStage === "confirmed"
                    ? "Confirming publishes it to the chapter's timeline."
                    : "Planning means somebody owns it."}
                </p>
              </>
            ) : (
              <>
                <p className="text-[12.5px] font-semibold text-[#ece7dd]">
                  Needs {missing.map(f => f.label.toLowerCase()).join(" + ")}
                </p>
                <p className="text-[11px] text-[#6b6354]">
                  to move to {STAGE_LABELS[nextStage]}
                </p>
              </>
            )}
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

        {/* ── The org's optional fields ────────────────────────────────────
            One list, declared by the org once, answered the same way by every
            event — which is what makes a budget or a head count something you
            can compare across the term. The per-event free-text checklist this
            replaced was written from scratch each time, so nothing could ever be
            counted or compared. */}
        {enabledFields.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6354]">Details</h3>
              {isPublished && canManage && (
                <span className="text-[10.5px] text-[#6b6354]">
                  Published — move back to Planning to edit
                </span>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
              {enabledFields.map((def, i) => (
                <FieldRow
                  key={def.slug}
                  def={def}
                  event={event}
                  docs={resourceDocs}
                  canEdit={canEditFields}
                  divider={i > 0}
                  onPatch={onPatch}
                />
              ))}
            </div>
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
                  category: event.category,
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

      </div>
    </Card>
  );
}

/**
 * One optional-field row: label · value editor, typed by the field's `kind`.
 *
 * Three of the built-in slugs are backed by REAL COLUMNS rather than by
 * fieldValues — description, attachment and cohost predate this table and their
 * data was never copied into JSON. They render here so an org can turn them off
 * like any other optional field, but they read and write their own column; a
 * copy in the JSON would be a second, drifting source of truth.
 */
function FieldRow({
  def,
  event,
  docs,
  canEdit,
  divider,
  onPatch,
}: {
  def: EventFieldDef;
  event: ProgrammingTask;
  docs: Doc[];
  canEdit: boolean;
  divider: boolean;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
}) {
  const border = divider ? "border-t border-white/[0.05]" : "";

  // Column-backed built-ins first — these never touch fieldValues.
  if (def.slug === "attachment") {
    return (
      <div className={`px-3 py-2.5 ${border}`}>
        <p className="mb-2 text-[12.5px] text-[#958d7c]">{def.label}</p>
        <AttachmentField
          attachmentUrl={event.attachmentUrl}
          attachmentDocId={event.attachmentDocId}
          docs={docs}
          canManage={canEdit}
          onUrlCommit={url => onPatch(event.id, { attachmentUrl: url, attachmentDocId: null })}
          onDocPick={id => onPatch(event.id, { attachmentDocId: id, attachmentUrl: null })}
          onClear={() => onPatch(event.id, { attachmentUrl: null, attachmentDocId: null })}
        />
      </div>
    );
  }

  if (def.slug === "description") {
    return (
      <FieldShell label={def.label} border={border} stacked>
        {canEdit ? (
          <TextValue
            value={event.description ?? ""}
            multiline
            onCommit={v => onPatch(event.id, { description: v || null })}
          />
        ) : (
          <ReadValue text={event.description} />
        )}
      </FieldShell>
    );
  }

  if (def.slug === "cohost") {
    return (
      <FieldShell label={def.label} border={border}>
        {canEdit ? (
          <TextValue value={event.collab ?? ""} onCommit={v => onPatch(event.id, { collab: v || null })} />
        ) : (
          <ReadValue text={event.collab} />
        )}
      </FieldShell>
    );
  }

  // Everything else lives in fieldValues, keyed by slug.
  const raw = event.fieldValues?.[def.slug] ?? null;
  const commit = (value: string | number | boolean | null) =>
    onPatch(event.id, { fieldValues: { ...event.fieldValues, [def.slug]: value } });

  if (def.kind === "bool") {
    return (
      <FieldShell label={def.label} border={border}>
        {canEdit ? (
          <button
            type="button"
            onClick={() => commit(!raw)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors ${raw
              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/25"
              : "bg-white/[0.04] text-[#958d7c] ring-white/10 hover:bg-white/[0.08] hover:text-[#c9c2b4]"}`}
          >
            {raw ? "Yes" : "No"}
          </button>
        ) : (
          <ReadValue text={raw ? "Yes" : "No"} />
        )}
      </FieldShell>
    );
  }

  if (def.kind === "num" || def.kind === "money") {
    const asNumber = typeof raw === "number" ? raw : null;
    return (
      <FieldShell label={def.label} border={border}>
        {canEdit ? (
          <div className="relative w-[130px]">
            {def.kind === "money" && (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#6b6354]">$</span>
            )}
            <input
              type="number"
              min={0}
              step={def.kind === "money" ? 0.01 : 1}
              defaultValue={asNumber ?? ""}
              className={`${inputDuskCls} tabular-nums ${def.kind === "money" ? "pl-6" : ""}`}
              onBlur={e => {
                const v = e.target.value.trim();
                const n = v === "" ? null : Number(v);
                if (n !== asNumber) commit(Number.isFinite(n as number) ? n : null);
              }}
            />
          </div>
        ) : (
          <ReadValue text={asNumber == null ? null : def.kind === "money" ? fmt$(asNumber) : String(asNumber)} />
        )}
      </FieldShell>
    );
  }

  // text / date / person / file all edit as a string; `date` gets a date input.
  const asText = raw == null ? "" : String(raw);
  return (
    <FieldShell label={def.label} border={border}>
      {canEdit ? (
        <TextValue value={asText} type={def.kind === "date" ? "date" : "text"} onCommit={v => commit(v || null)} />
      ) : (
        <ReadValue text={asText || null} />
      )}
    </FieldShell>
  );
}

/** Label on the left, control on the right — or stacked, for a multiline value. */
function FieldShell({
  label, border, stacked, children,
}: { label: string; border: string; stacked?: boolean; children: React.ReactNode }) {
  if (stacked) {
    return (
      <div className={`px-3 py-2.5 ${border}`}>
        <p className="mb-2 text-[12.5px] text-[#958d7c]">{label}</p>
        {children}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${border}`}>
      <span className="min-w-0 flex-1 text-[12.5px] text-[#958d7c]">{label}</span>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

/** An unanswered field says so rather than rendering an empty row. */
function ReadValue({ text }: { text: string | null }) {
  return text
    ? <span className="text-[12.5px] text-[#c9c2b4]">{text}</span>
    : <span className="text-[12px] italic text-[#4a4439]">Not set</span>;
}

/** Commit-on-blur text input, so a field isn't PATCHed on every keystroke. */
function TextValue({
  value, multiline, type = "text", onCommit,
}: { value: string; multiline?: boolean; type?: string; onCommit: (v: string) => void }) {
  if (multiline) {
    return (
      <textarea
        defaultValue={value}
        className="min-h-[70px] w-full resize-none rounded-lg border border-[rgba(236,231,221,0.08)] bg-[rgba(236,231,221,0.03)] px-3 py-2.5 text-[12.5px] text-[#c9c2b4] placeholder:text-[#4a4439] transition-colors focus:border-[#d9b08b]/40 focus:outline-none"
        onBlur={e => { if (e.target.value !== value) onCommit(e.target.value.trim()); }}
      />
    );
  }
  return (
    <input
      type={type}
      defaultValue={value}
      className={`${inputDuskCls} w-[170px]`}
      onBlur={e => { if (e.target.value !== value) onCommit(e.target.value.trim()); }}
    />
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

