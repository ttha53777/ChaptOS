"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../../../components/dashboard/primitives";
import { apiErrorMessage, requestJson } from "../../../../lib/api";
import type { EventFieldDef } from "@/lib/event-fields";
import {
  EVENT_FIELDS_COPY as C, FIELD_KINDS, KIND_COPY, MAX_FIELD_LABEL, MAX_EVENT_FIELDS,
  fieldNote, kindLabel, sortFields, toggleMessage, type FieldKind,
} from "@/lib/settings/event-fields";

/**
 * What the API actually returns: EventFieldDef plus the row id.
 *
 * Declared here rather than imported from the service — that module is
 * server-only (it reaches ctx.db), and pulling it into a "use client" file
 * would drag Prisma into the browser bundle while tsc stayed perfectly green.
 */
type EventFieldRow = EventFieldDef & { id: number };

// Settings → Event fields. The org's own vocabulary for what an event records:
// every event on the board answers this same list, which is the whole point —
// a budget or a head count is only worth collecting if it can be compared
// across the term. It replaced a per-event free-text checklist that was written
// from scratch each time, so nothing could ever be counted.
//
// Modelled on TransactionCategoriesSection rather than MemberFieldsSection:
// event fields are a real table with REST CRUD (per-row PATCH/DELETE, server-
// owned validation), not a config blob diffed and PATCHed whole.
//
// Three kinds of row, and the difference is enforced by the SERVICE, not here:
//   · BUILTIN — the ten the platform ships. Renameable, reorderable and now
//     disable-able like anything else; only DELETE is refused, because the slug
//     is reserved and the row has to survive to hold the place. (Disabling was
//     refused too, until it turned out nothing downstream needed it: the stage
//     gates read real columns, not this table.)
//   · CUSTOM, IN USE — everything, but delete comes back refused with a count.
//   · CUSTOM, UNUSED — everything.
//
// Duplicate labels, the org ceiling and in-use refusals are all decided by the
// API and surfaced as returned, rather than re-litigated here where the two
// could drift.

export function EventFieldsSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [fields, setFields] = useState<EventFieldRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EventFieldRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<FieldKind>("text");

  const load = useCallback(async () => {
    try {
      // Returns disabled rows too — this is the surface that turns them back on.
      setFields(await requestJson<EventFieldRow[]>("/api/events/fields"));
    } catch (err) {
      onError(apiErrorMessage(err, C.loadFailed));
      setFields([]);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(
    () => sortFields(fields ?? []),
    [fields],
  );
  const atCeiling = sorted.length >= MAX_EVENT_FIELDS;

  /** Every write goes through here so one failure path surfaces the API's words. */
  async function mutate(run: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(true);
    try {
      await run();
      await load();
      onStatus(ok);
    } catch (err) {
      onError(apiErrorMessage(err, C.saveFailed));
    } finally {
      setBusy(false);
    }
  }

  function patch(def: EventFieldRow, body: Record<string, unknown>, ok: string) {
    return mutate(
      () => requestJson(`/api/events/fields/${def.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      ok,
    );
  }

  /** Swap two rows' displayOrder. Order is the sheet's reading order, nothing more. */
  async function move(idx: number, dir: -1 | 1) {
    const a = sorted[idx];
    const b = sorted[idx + dir];
    if (!a || !b) return;
    await mutate(async () => {
      await requestJson(`/api/events/fields/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayOrder: b.displayOrder }),
      });
      await requestJson(`/api/events/fields/${b.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayOrder: a.displayOrder }),
      });
    }, C.orderSaved);
  }

  if (fields === null) {
    return <p className="sc-lede" style={{ margin: 0 }}>{C.loading}</p>;
  }

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede" style={{ margin: 0 }}>
        {C.lede}
      </p>

      <div className="space-y-2">
        {sorted.map((f, idx) => {
          const isEditing = editing === f.slug;
          return (
            <div key={f.slug} className="sc-card">
              <div className="flex items-center gap-2 px-4 py-3">
                {/* Reorder */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button" aria-label={C.moveUp} disabled={idx === 0 || busy}
                    onClick={() => void move(idx, -1)}
                    className="flex h-4 w-4 items-center justify-center rounded disabled:opacity-20"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button" aria-label={C.moveDown} disabled={idx === sorted.length - 1 || busy}
                    onClick={() => void move(idx, 1)}
                    className="flex h-4 w-4 items-center justify-center rounded disabled:opacity-20"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {isEditing ? (
                  <input
                    autoFocus
                    className="sc-input min-w-0 flex-1"
                    maxLength={MAX_FIELD_LABEL}
                    value={draftLabel}
                    onChange={e => setDraftLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Escape") { setEditing(null); }
                      if (e.key === "Enter" && draftLabel.trim()) {
                        setEditing(null);
                        void patch(f, { label: draftLabel.trim() }, C.renamed);
                      }
                    }}
                    onBlur={() => {
                      setEditing(null);
                      if (draftLabel.trim() && draftLabel.trim() !== f.label) {
                        void patch(f, { label: draftLabel.trim() }, C.renamed);
                      }
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate sc-row-key">{f.label}</span>
                )}

                <span className="sc-pill sc-pill-muted shrink-0">{kindLabel(f.kind)}</span>
                {f.builtin && <span className="sc-pill sc-pill-muted shrink-0">{C.builtin}</span>}
                {!f.enabled && <span className="sc-pill sc-pill-muted shrink-0">{C.off}</span>}

                <button
                  type="button" disabled={busy}
                  className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
                  onClick={() => { setEditing(f.slug); setDraftLabel(f.label); }}
                >
                  {C.rename}
                </button>

                {/* Offered for builtins too. They were exempt while the service
                    refused to disable them; that rule was unfounded and is gone,
                    so a chapter that doesn't do dress codes can stop being asked
                    about dress codes. Delete stays builtin-only. */}
                <button
                  type="button" disabled={busy}
                  className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
                  onClick={() => void patch(
                    f,
                    { enabled: !f.enabled },
                    toggleMessage(f),
                  )}
                >
                  {f.enabled ? C.stop : C.again}
                </button>

                {!f.builtin && (
                  <button
                    type="button" disabled={busy}
                    className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
                    onClick={() => setDeleteTarget(f)}
                  >
                    {C.delete}
                  </button>
                )}
              </div>
              <p className="px-4 pb-3 text-[11.5px]" style={{ color: "var(--faint)" }}>
                {fieldNote(f)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Add */}
      {adding ? (
        <div className="sc-card p-4 space-y-3">
          <input
            autoFocus
            className="sc-input w-full"
            placeholder={C.newPlaceholder}
            maxLength={MAX_FIELD_LABEL}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {FIELD_KINDS.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setNewKind(k)}
                className={`sc-pill ${newKind === k ? "sc-pill-vio" : "sc-pill-muted"}`}
              >
                {KIND_COPY[k].label}
              </button>
            ))}
          </div>
          {/* Says what the picked kind means, because the word alone ("Money")
              doesn't tell you it's kept apart from actual spend. */}
          <p className="text-[11.5px]" style={{ color: "var(--faint)" }}>{KIND_COPY[newKind].eg}</p>
          <p className="text-[11.5px]" style={{ color: "var(--faint)" }}>
            {C.fixedType}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newLabel.trim() || busy}
              className="sc-btn sc-btn-primary sc-btn-sm"
              onClick={() => void mutate(
                () => requestJson("/api/events/fields", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ label: newLabel.trim(), kind: newKind }),
                }),
                C.added(newLabel.trim()),
              ).then(() => { setAdding(false); setNewLabel(""); setNewKind("text"); })}
            >
              {C.addField}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-sm"
              onClick={() => { setAdding(false); setNewLabel(""); }}
            >
              {C.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="sc-btn sc-btn-ghost sc-btn-sm"
          disabled={atCeiling || busy}
          onClick={() => setAdding(true)}
          title={atCeiling ? C.ceilingTitle : undefined}
        >
          {C.newField}
        </button>
      )}
      {atCeiling && (
        <p className="text-[11.5px]" style={{ color: "var(--faint)" }}>
          {C.ceiling}
        </p>
      )}

      {deleteTarget && (
        <ConfirmDialog
          tone="dusk"
          title={C.deleteTitle(deleteTarget.label)}
          message={C.deleteMessage}
          confirmLabel={C.delete}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            void mutate(
              () => requestJson(`/api/events/fields/${target.id}`, { method: "DELETE" }),
              C.deleted(target.label),
            );
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
