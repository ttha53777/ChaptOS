"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Brother, ProgrammingTask, Transaction } from "../../data";
import { fmt$, fmtDate } from "../../data";
import { OwnerAvatar, OwnerPicker, type RoleOption } from "./OwnerPicker";
import { StageControl } from "./panel/StageControl";
import type { TypeVisual } from "./typeColor";
import { Card, Modal } from "../dashboard/primitives";
import { inputDuskCls } from "../dashboard/styles";
import { TypeBadge } from "./ProgrammingChips";
import { AttachmentField } from "./AttachmentField";
import { TxForm, type TxFormEvent } from "../treasury/TxForm";
import type { Doc } from "@/app/[slug]/docs/lib";
import { requestJson } from "../../lib/api";
import { ownerLabel } from "@/lib/event-owner";
import { fieldsFor, hasRequiredField, type RequiredField } from "@/lib/programming";
import type { EventFieldDef } from "@/lib/event-fields";
import { FieldTogglePills } from "./panel/FieldTogglePills";
import { useOrgPath } from "../../hooks/useOrgPath";
import { useToast } from "../dashboard/Toast";

/** EventFieldDef plus the row id the fields API keys on. */
type EventFieldRow = EventFieldDef & { id: number };
import type { ProgrammingStage } from "@/lib/state/programming-stage";
import { todayStr } from "../../lib/dates";

export function ProgrammingDetailPanel({
  event,
  canManage,
  brothers,
  roles,
  visual,
  onPatch,
  onStage,
  onEdit,
  onDelete,
}: {
  event: ProgrammingTask;
  canManage: boolean;
  brothers: Brother[];
  roles: RoleOption[];
  /** Colour + label resolved from the org's event-type row. */
  visual: TypeVisual;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
  onStage?: (id: number, stage: ProgrammingStage) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const orgPath = useOrgPath();
  const toast = useToast();
  const [editingOwner, setEditingOwner] = useState(false);
  // The field a gate sentence just pointed at. Scrolled to and pulsed so the
  // jump lands somewhere visible rather than silently changing state offscreen.
  const [huntKey, setHuntKey] = useState<string | null>(null);
  // The field a locked click just bounced off, so the row can answer visibly.
  const [refusedKey, setRefusedKey] = useState<string | null>(null);
  const [resourceDocs, setResourceDocs] = useState<Doc[]>([]);
  const [stageLoading, setStageLoading] = useState(false);
  const [linkedTxns, setLinkedTxns] = useState<Transaction[]>([]);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  // The org's optional field definitions. Fetched rather than passed so the panel
  // works from anywhere it's mounted; the list is small and cached by the browser.
  // The API returns the row id alongside the definition; the toggle pills PATCH by it.
  const [fieldDefs, setFieldDefs] = useState<EventFieldRow[]>([]);

  const isPast = event.dueDate != null && event.dueDate < todayStr();
  const isDone = event.stage === "done";

  // What this event still needs to move up a lane now lives in StageControl,
  // which says it AND links each gap to its editor.

  // Published events are frozen: Confirmed sits on everyone's Timeline, so
  // changing the room or the date silently rewrites a plan people already made.
  // The server enforces this too — the panel just doesn't offer the edit.
  const isPublished = event.stage === "confirmed" || event.stage === "done";
  const canEditFields = canManage && !isPublished;

  // Bring the hunted field into view, then let the pulse expire on its own so a
  // second jump to the same field re-fires it.
  useEffect(() => {
    if (!huntKey) return;
    document.querySelector(`[data-field-key="${huntKey}"]`)?.scrollIntoView({ block: "nearest" });
    const t = setTimeout(() => setHuntKey(null), 1600);
    return () => clearTimeout(t);
  }, [huntKey]);

  /**
   * A click on a field that publishing has frozen.
   *
   * Rendering the row merely inert makes the click land on nothing, which reads
   * as a dead interface rather than as a rule — so the row answers, and the toast
   * carries the way out instead of leaving it to be discovered. Done has no way
   * out on purpose: offering to un-finish an event that already happened isn't a
   * fix, it's a lie about the record.
   */
  const refuseEdit = useCallback((key: string, label: string) => {
    // Clear first so a second click on the SAME row restarts the animation;
    // React skips the re-render entirely if the key never changes.
    setRefusedKey(null);
    requestAnimationFrame(() => setRefusedKey(key));
    if (isDone) {
      toast.info(`${label} is part of the record now — a wrapped event can't be edited.`);
      return;
    }
    toast.info(`${label} is locked while the chapter can see this event.`, {
      action: {
        label: "Move to Planning",
        onClick: async () => {
          if (!onStage) return;
          setStageLoading(true);
          try {
            await onStage(event.id, "planning");
            // Land the officer on the field they were reaching for, rather than
            // on an unlocked sheet they now have to re-scan.
            setHuntKey(key);
            if (key === "owner") setEditingOwner(true);
          } finally {
            setStageLoading(false);
          }
        },
      },
    });
  }, [isDone, toast, onStage, event.id]);

  useEffect(() => {
    if (!refusedKey) return;
    const t = setTimeout(() => setRefusedKey(null), 2600);
    return () => clearTimeout(t);
  }, [refusedKey]);

  const loadFields = useCallback(() => {
    requestJson<EventFieldRow[]>("/api/events/fields")
      .then(setFieldDefs)
      .catch(() => setFieldDefs([]));
  }, []);
  useEffect(() => { loadFields(); }, [loadFields]);

  // Disabled fields are hidden, never deleted — their answers stay on disk and
  // come back if the org switches the field on again (the server sanitizes reads
  // against the live definitions, so a disabled answer simply doesn't ship).
  const enabledFields = fieldDefs.filter(d => d.enabled);

  /**
   * Which required fields this panel shows.
   *
   * An Idea is only asked for what Planning will cost — printing the date and
   * location rows on something nobody owns yet turns the required section into a
   * wall of four "Needed to confirm" lines the officer can do nothing about. Once
   * it is owned, the full confirm set is what's relevant.
   */
  const requiredSet = useMemo(
    () => fieldsFor(event.stage === "idea" ? "planning" : "confirmed"),
    [event.stage],
  );
  const requiredGot = requiredSet.filter(f => hasRequiredField(event, f.key)).length;
  const optionalGot = enabledFields.filter(d => hasOptionalAnswer(event, d)).length;

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
            <h2 className="ev-pn-title">{event.title}</h2>
            <p className="ev-pn-when">
              {event.dueDate ? fmtDate(event.dueDate) : "No date set"}{event.time ? ` · ${event.time}` : ""}{event.location ? ` · ${event.location}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TypeBadge label={visual.label} hex={visual.hex} />
              {event.collab && (
                <span className="ev-pn-collab">w/ {event.collab}</span>
              )}
              {/* The owner used to be printed here as flat text. It now lives in
                  the Details list as an editable row, so repeating it in the
                  header would just be a second, unclickable copy of the same
                  fact — except when it's MISSING, which the header should say
                  because that's the gate the board is waiting on. */}
              {!event.owner && !event.ownerNote && (
                <span className="ev-pn-unowned">Unowned</span>
              )}
              {/* An eye or a padlock, not a sentence fragment. Whether the
                  chapter can see this is the fact the whole stage ladder is
                  about, and it should be readable at a glance. */}
              <span className={`ev-vis ${event.calendarEventId != null ? "public" : "private"}`}>
                {event.calendarEventId != null ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="3.2" />
                    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" />
                  </svg>
                )}
                {event.calendarEventId != null ? "On the chapter Timeline" : "Not visible to the Timeline yet"}
              </span>
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1.5">
              <button onClick={onEdit} className="ev-pn-btn">
                Edit
              </button>
              <button onClick={onDelete} className="ev-pn-btn danger">
                Delete
              </button>
            </div>
          )}
        </div>
        {/* The lanes, what this one means, and what the next one costs — with
            the missing fields as buttons straight to their editors. */}
        {onStage && (
          <div className="mt-3">
            <StageControl
              event={event}
              canManage={canManage}
              busy={stageLoading}
              onStage={async s => {
                setStageLoading(true);
                try { await onStage(event.id, s); }
                finally { setStageLoading(false); }
              }}
              onJumpToField={key => {
                if (key === "owner") { setEditingOwner(true); }
                setHuntKey(key);
              }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">

        {/* ── Wrap-up card — shown first when event is done ── */}
        {/* A RECORD, not a form. The wrap-up step is the only writer: Done is
            what the term actually did, and a rating that can be quietly revised
            months later is not a record of anything. So this is three lines, not
            the bordered card it used to be — the card read as something you were
            being invited to fill in. */}
        {isDone && (
          <div className="ev-pn-wrap">
            <div className="pw-head">
              <span className="pw-k">Wrap-up</span>
              {event.successRating != null ? (
                <span className="pw-stars" role="img" aria-label={`Rated ${event.successRating} out of 5`}>
                  {"★".repeat(event.successRating)}
                  <span className="off" aria-hidden>{"☆".repeat(5 - event.successRating)}</span>
                </span>
              ) : (
                <span className="pw-none">Not rated</span>
              )}
            </div>
            {event.wrapUpNotes
              ? <p className="pw-notes">{event.wrapUpNotes}</p>
              : <p className="pw-nonotes">No review notes.</p>}
          </div>
        )}

        {/* ── The org's optional fields ────────────────────────────────────
            One list, declared by the org once, answered the same way by every
            event — which is what makes a budget or a head count something you
            can compare across the term. The per-event free-text checklist this
            replaced was written from scratch each time, so nothing could ever be
            counted or compared. */}
        {/* Renders when the org collects anything OR when the officer can turn
            something back on. Gating purely on enabledFields would mean an org
            that switched every field off lost the pills that switch them back —
            a dead end reachable in two clicks. */}
        {/* ── Required ─────────────────────────────────────────────────────
            Split out from the optional set because "which of these actually
            gates the board" is the question the panel is asked most, and one
            undifferentiated list can't answer it. The counter is the same
            fraction the lane gate is computing, shown where you can act on it. */}
        <section className="ev-pn-sec">
          <div className="ps-head">
            <span className="ps-t">Required</span>
            <span className="ps-why gates">Gates the board</span>
            <span className={`ps-n${requiredGot === requiredSet.length ? " ready" : ""}`}>
              {requiredGot}/{requiredSet.length}
            </span>
          </div>
          <div className="ev-flds">
            {requiredSet.map(f => (
              <RequiredRow
                key={f.key}
                field={f}
                event={event}
                visual={visual}
                brothers={brothers}
                roles={roles}
                canManage={canManage}
                // Owner is deliberately outside the server's frozen set, so an
                // officer handoff on a Confirmed event doesn't require
                // unpublishing it first.
                locked={isPublished && f.key !== "owner"}
                editingOwner={editingOwner}
                hunted={huntKey === f.key}
                refused={refusedKey === f.key}
                onToggleOwner={() => setEditingOwner(v => !v)}
                onRefuse={canManage ? () => refuseEdit(f.key, f.label) : undefined}
                onPatch={onPatch}
              />
            ))}
          </div>
        </section>

        {/* ── Optional ─────────────────────────────────────────────────── */}
        {(enabledFields.length > 0 || (canManage && fieldDefs.length > 0)) && (
          <section className="ev-pn-sec">
            <div className="ps-head">
              <span className="ps-t">Optional</span>
              <span className="ps-why opt">Never blocks</span>
              <span className="ps-n">{optionalGot}/{enabledFields.length}</span>
            </div>
            <div className="ev-flds">
              {enabledFields.map(def => (
                <FieldRow
                  key={def.slug}
                  def={def}
                  event={event}
                  docs={resourceDocs}
                  canEdit={canEditFields}
                  onPatch={onPatch}
                  // Only a publish freeze is worth answering. A plain member has
                  // no edit affordance to click in the first place, so a refusal
                  // there would be explaining a rule they never met.
                  onRefuse={canManage && isPublished ? () => refuseEdit(def.slug, def.label) : undefined}
                  refused={refusedKey === def.slug}
                />
              ))}
              {enabledFields.length === 0 && (
                <p className="ev-fld-none">
                  This chapter collects nothing optional. Turn a field on below.
                </p>
              )}
            </div>
            {canManage && fieldDefs.length > 0 && (
              <FieldTogglePills
                fields={fieldDefs}
                settingsHref={orgPath("/settings?section=event-fields")}
                onChanged={loadFields}
                onStatus={toast.success}
                onError={toast.error}
              />
            )}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="ev-pn-h">Spending</h3>
          {canManage ? (
            <div className="relative max-w-[160px]">
              <span className="ev-pn-dollar">$</span>
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
            <p className="ev-pn-amt">{fmt$(event.spendingCents / 100)}</p>
          )}
          <p className="ev-pn-note">Manual total — linked transactions are tracked separately below.</p>
        </section>

        {/* ── Linked Transactions ─────────────────────────────────────────── */}
        {event.calendarEventId && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="ev-pn-h">Linked Transactions</h3>
              {canManage && !showTxForm && (
                <button
                  onClick={() => setShowTxForm(true)}
                  className="ev-pn-link"
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
              <p className="ev-pn-note">Loading…</p>
            ) : linkedTxns.length === 0 && !showTxForm ? (
              <p className="ev-pn-note">No transactions linked to this event yet.</p>
            ) : linkedTxns.length > 0 ? (
              <>
                <div className="space-y-1">
                  {linkedTxns.map(t => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <div className="min-w-0">
                        <p className="ev-pn-tx-t">{t.description || t.category}</p>
                        <p className="ev-pn-tx-m">{fmtDate(t.date)} · {t.category}</p>
                      </div>
                      <span className={`ev-pn-tx-amt ${t.type === "income" ? "in" : "out"}`}>
                        {t.type === "income" ? "+" : "−"}{fmt$(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2">
                  <span className="ev-pn-h">Total expenses</span>
                  <span className="ev-pn-tx-amt out total">
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
  onPatch,
  onRefuse,
  refused,
}: {
  def: EventFieldDef;
  event: ProgrammingTask;
  docs: Doc[];
  canEdit: boolean;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
  /** Set only when the row is frozen by publishing and the viewer could otherwise edit it. */
  onRefuse?: () => void;
  refused?: boolean;
}) {
  const has = hasOptionalAnswer(event, def);
  // A frozen row stays a click target so the rule can answer for itself. The
  // wrapper carries the mark, the shake and the not-allowed cursor, so every
  // branch below gets them for free.
  return (
    <div
      className={`ev-fld${has ? " set" : ""}${refused ? " ev-refused" : ""}`}
      data-field-key={def.slug}
      onClick={onRefuse}
      title={onRefuse ? "Locked while the chapter can see this event" : undefined}
    >
      {/* Optional fields never render the gold "missing" state — nothing they
          do blocks anything, and a gold prompt would claim otherwise. */}
      <FieldMark state={has ? "set" : "empty"} />
      <div className={`ev-fld-main${onRefuse ? " locked" : ""}`}>
        <span className="ev-fld-k">{def.label}</span>
        <FieldRowBody def={def} event={event} docs={docs} canEdit={canEdit} onPatch={onPatch} />
        {onRefuse && (
          <svg className="ev-fld-pencil lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" />
          </svg>
        )}
      </div>
    </div>
  );
}

function FieldRowBody({
  def, event, docs, canEdit, onPatch,
}: {
  def: EventFieldDef;
  event: ProgrammingTask;
  docs: Doc[];
  canEdit: boolean;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
}) {

  // Column-backed built-ins first — these never touch fieldValues.
  if (def.slug === "attachment") {
    return (
      <span className="ev-fld-v">
        <AttachmentField
          attachmentUrl={event.attachmentUrl}
          attachmentDocId={event.attachmentDocId}
          docs={docs}
          canManage={canEdit}
          onUrlCommit={url => onPatch(event.id, { attachmentUrl: url, attachmentDocId: null })}
          onDocPick={id => onPatch(event.id, { attachmentDocId: id, attachmentUrl: null })}
          onClear={() => onPatch(event.id, { attachmentUrl: null, attachmentDocId: null })}
        />
      </span>
    );
  }

  if (def.slug === "description") {
    return canEdit ? (
      <TextValue
        value={event.description ?? ""}
        multiline
        onCommit={v => onPatch(event.id, { description: v || null })}
      />
    ) : (
      <ReadValue text={event.description} />
    );
  }

  if (def.slug === "cohost") {
    return canEdit ? (
      <TextValue value={event.collab ?? ""} onCommit={v => onPatch(event.id, { collab: v || null })} />
    ) : (
      <ReadValue text={event.collab} />
    );
  }

  // Everything else lives in fieldValues, keyed by slug.
  const raw = event.fieldValues?.[def.slug] ?? null;
  const commit = (value: string | number | boolean | null) =>
    onPatch(event.id, { fieldValues: { ...event.fieldValues, [def.slug]: value } });

  if (def.kind === "bool") {
    return canEdit ? (
      <span className="ev-fld-v">
        <button type="button" onClick={() => commit(!raw)} className={`ev-fld-bool${raw ? " on" : ""}`}>
          {raw ? "Yes" : "No"}
        </button>
      </span>
    ) : (
      <ReadValue text={raw ? "Yes" : "No"} />
    );
  }

  if (def.kind === "num" || def.kind === "money") {
    const asNumber = typeof raw === "number" ? raw : null;
    return canEdit ? (
      <span className="ev-fld-v">
        <span className="ev-fld-num">
          {def.kind === "money" && <span className="pre">$</span>}
          <input
            type="number"
            min={0}
            step={def.kind === "money" ? 0.01 : 1}
            defaultValue={asNumber ?? ""}
            onBlur={e => {
              const v = e.target.value.trim();
              const n = v === "" ? null : Number(v);
              if (n !== asNumber) commit(Number.isFinite(n as number) ? n : null);
            }}
          />
        </span>
      </span>
    ) : (
      <ReadValue
        text={asNumber == null ? null : def.kind === "money" ? fmt$(asNumber) : String(asNumber)}
        mono
      />
    );
  }

  // text / date / person / file all edit as a string; `date` gets a date input.
  const asText = raw == null ? "" : String(raw);
  return canEdit ? (
    <TextValue value={asText} type={def.kind === "date" ? "date" : "text"} onCommit={v => commit(v || null)} />
  ) : (
    <ReadValue text={asText || null} />
  );
}

/**
 * Whether an optional field has an answer.
 *
 * Three of the built-ins are backed by real columns rather than fieldValues (see
 * COLUMN_BACKED_FIELDS), so a naive fieldValues lookup reports a filled
 * description as empty and the counter drifts from what the rows show.
 */
function hasOptionalAnswer(event: ProgrammingTask, def: EventFieldDef): boolean {
  if (def.slug === "description") return Boolean(event.description?.trim());
  if (def.slug === "cohost") return Boolean(event.collab?.trim());
  if (def.slug === "attachment") return Boolean(event.attachmentUrl || event.attachmentDocId != null);
  const v = event.fieldValues?.[def.slug];
  if (v == null || v === "") return false;
  // A boolean is answered by existing; `false` is a value, not an empty.
  return true;
}

/**
 * The bullet that opens every field row.
 *
 * The value IS the checkmark: a filled mark means the field is answered, a dashed
 * gold one means a gate is still waiting on it. Optional fields never render the
 * gold state — nothing they do blocks anything.
 */
function FieldMark({ state }: { state: "set" | "miss" | "empty" }) {
  return (
    <span className={`ev-fld-mark ${state}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

/**
 * One of the six gating fields.
 *
 * These are columns, not fieldValues, and five of the six are frozen once the
 * event publishes — so unlike an optional row this one mostly READS, and its job
 * is to say whether the gate it belongs to is satisfied. Owner is the exception
 * and carries the picker inline, because assigning one is the single most common
 * thing this panel is opened to do.
 */
function RequiredRow({
  field, event, visual, brothers, roles, canManage, locked,
  editingOwner, hunted, refused, onToggleOwner, onRefuse, onPatch,
}: {
  field: RequiredField;
  event: ProgrammingTask;
  visual: TypeVisual;
  brothers: Brother[];
  roles: RoleOption[];
  canManage: boolean;
  locked: boolean;
  editingOwner: boolean;
  hunted: boolean;
  refused: boolean;
  onToggleOwner: () => void;
  onRefuse?: () => void;
  onPatch: (id: number, patch: Partial<ProgrammingTask>) => Promise<void>;
}) {
  const has = hasRequiredField(event, field.key);

  // What the gate is waiting for, named by the lane that wants it — the same
  // sentence the board's drop cue and the fix-step use. A wrapped event has no
  // gate left to satisfy, so it says what's true instead: the answer is simply
  // not on the record. Telling a Done event it "needs an owner to start
  // planning" names a move that no longer exists.
  const emptyText = event.stage === "done"
    ? "Never recorded"
    : `Needed to ${
        field.gate === "planning" ? "start planning" : field.gate === "confirmed" ? "confirm" : "save"
      }`;

  let value: React.ReactNode = null;
  if (field.key === "title") value = event.title;
  else if (field.key === "category") value = visual.label;
  else if (field.key === "date") value = event.dueDate ? fmtDate(event.dueDate) : null;
  else if (field.key === "location") value = event.location || null;
  else if (field.key === "mandatory") {
    value = event.mandatory ? "Required of every member" : "Optional — no attendance taken";
  } else if (field.key === "owner") {
    value = event.owner ? (
      <>
        <OwnerAvatar owner={event.owner} size={18} />
        {ownerLabel(event.owner)}
      </>
    ) : event.ownerNote ? (
      // Retired migration data: a pre-v3 free-text owner that matched no roster
      // row. It is NOT an owner and does not satisfy the gate — say so.
      `${event.ownerNote} (not on the roster)`
    ) : null;
  }

  const isOwner = field.key === "owner";
  const canEditOwner = isOwner && canManage;
  // Gold flags a gate that is still waiting. Done has no gate ahead of it, so an
  // unanswered field there is a gap in the record, not a blocker.
  const state = has ? "set" : event.stage === "done" ? "empty" : "miss";

  return (
    <div
      className={`ev-fld ${state}${refused ? " ev-refused" : ""}${hunted ? " ev-hunted" : ""}`}
      data-field-key={field.key}
    >
      <FieldMark state={state} />
      <div
        className={`ev-fld-main${locked ? " locked" : canEditOwner ? " edit" : ""}`}
        onClick={locked ? onRefuse : canEditOwner ? onToggleOwner : undefined}
        role={locked || canEditOwner ? "button" : undefined}
        tabIndex={locked || canEditOwner ? 0 : undefined}
        onKeyDown={
          locked || canEditOwner
            ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (locked ? onRefuse : onToggleOwner)?.(); } }
            : undefined
        }
        aria-label={locked ? `${field.label} — locked while ${event.stage}` : canEditOwner ? `Edit ${field.label}` : undefined}
        title={locked ? "Locked while the chapter can see this event" : undefined}
      >
        <span className="ev-fld-k">{field.label}</span>
        <span className={`ev-fld-v${has ? "" : " empty"}`}>{has ? value : emptyText}</span>
        {locked ? (
          <svg className="ev-fld-pencil lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" />
          </svg>
        ) : canEditOwner ? (
          <svg className="ev-fld-pencil" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
          </svg>
        ) : null}
        {/* Inside .ev-fld-main so it lines up under the value rather than
            beside the mark — the row is a two-column flex. */}
        {isOwner && editingOwner && canManage && (
          <div className="ev-fld-ed" onClick={e => e.stopPropagation()}>
            <OwnerPicker
              value={event.owner}
              brothers={brothers}
              roles={roles}
              onChange={patch => {
                // One key only — the service nulls the sibling FK, and the Zod
                // refine rejects a payload carrying both.
                void onPatch(event.id, patch as Partial<ProgrammingTask>);
                onToggleOwner();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** An unanswered field says so rather than rendering an empty row. */
function ReadValue({ text, mono }: { text: string | null; mono?: boolean }) {
  return text
    ? <span className={`ev-fld-v${mono ? " mono" : ""}`}>{text}</span>
    : <span className="ev-fld-v empty">Not set</span>;
}

/** Commit-on-blur text input, so a field isn't PATCHed on every keystroke. */
function TextValue({
  value, multiline, type = "text", onCommit,
}: { value: string; multiline?: boolean; type?: string; onCommit: (v: string) => void }) {
  if (multiline) {
    return (
      <span className="ev-fld-v">
        <textarea
          defaultValue={value}
          className="ev-fld-ta"
          onBlur={e => { if (e.target.value !== value) onCommit(e.target.value.trim()); }}
        />
      </span>
    );
  }
  return (
    <span className="ev-fld-v">
      <input
        type={type}
        defaultValue={value}
        className={`ev-fld-in${type === "date" ? " mono" : ""}`}
        onBlur={e => { if (e.target.value !== value) onCommit(e.target.value.trim()); }}
      />
    </span>
  );
}


