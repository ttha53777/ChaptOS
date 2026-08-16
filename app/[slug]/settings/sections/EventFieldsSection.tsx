"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../../components/dashboard/primitives";
import { apiErrorMessage, requestJson } from "../../../lib/api";
import {
  FIELD_KINDS,
  MAX_EVENT_FIELDS,
  MAX_FIELD_LABEL,
  type EventFieldDef,
  type FieldKind,
} from "@/lib/event-fields";

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
//   · BUILTIN — the ten the platform ships. Renameable and reorderable, never
//     deletable and never disable-able: their slugs are what the board and any
//     future report address them by. The toggle simply isn't offered.
//   · CUSTOM, IN USE — everything, but delete comes back refused with a count.
//   · CUSTOM, UNUSED — everything.
//
// Duplicate labels, the org ceiling and in-use refusals are all decided by the
// API and surfaced as returned, rather than re-litigated here where the two
// could drift.

/** What each kind collects, in the officer's words rather than the schema's. */
const KIND_COPY: Record<FieldKind, { label: string; eg: string }> = {
  text:   { label: "Text",     eg: "Anything written — a contact, a note, a dress code." },
  num:    { label: "Number",   eg: "A count. Head count, buses, tables." },
  money:  { label: "Money",    eg: "A dollar amount, kept apart from what was actually spent." },
  bool:   { label: "Yes / no", eg: "A box that's either ticked or it isn't. Risk form filed?" },
  date:   { label: "Date",     eg: "A second date the event depends on — a deposit deadline." },
  person: { label: "Person",   eg: "Somebody on the roster who isn't the owner." },
  file:   { label: "File",     eg: "A link or an attachment." },
};

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
      onError(apiErrorMessage(err, "Could not load event fields."));
      setFields([]);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(
    () => [...(fields ?? [])].sort((a, b) => a.displayOrder - b.displayOrder || a.slug.localeCompare(b.slug)),
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
      onError(apiErrorMessage(err, "Could not save the change."));
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
    }, "Order saved.");
  }

  if (fields === null) {
    return <p className="sc-lede" style={{ margin: 0 }}>Loading…</p>;
  }

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede" style={{ margin: 0 }}>
        What every event records. Set once for the chapter, not per event — that&apos;s what
        makes a budget or a head count something you can compare across the term.
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
                    type="button" aria-label="Move up" disabled={idx === 0 || busy}
                    onClick={() => void move(idx, -1)}
                    className="flex h-4 w-4 items-center justify-center rounded disabled:opacity-20"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button" aria-label="Move down" disabled={idx === sorted.length - 1 || busy}
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
                        void patch(f, { label: draftLabel.trim() }, "Field renamed.");
                      }
                    }}
                    onBlur={() => {
                      setEditing(null);
                      if (draftLabel.trim() && draftLabel.trim() !== f.label) {
                        void patch(f, { label: draftLabel.trim() }, "Field renamed.");
                      }
                    }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate sc-row-key">{f.label}</span>
                )}

                <span className="sc-pill sc-pill-muted shrink-0">{KIND_COPY[f.kind]?.label ?? f.kind}</span>
                {f.builtin && <span className="sc-pill sc-pill-muted shrink-0">Built-in</span>}
                {!f.enabled && <span className="sc-pill sc-pill-muted shrink-0">Off</span>}

                <button
                  type="button" disabled={busy}
                  className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
                  onClick={() => { setEditing(f.slug); setDraftLabel(f.label); }}
                >
                  Rename
                </button>

                {/* A builtin's toggle isn't offered, because the server refuses
                    it — showing a control that always fails teaches nothing. */}
                {!f.builtin && (
                  <button
                    type="button" disabled={busy}
                    className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
                    onClick={() => void patch(
                      f,
                      { enabled: !f.enabled },
                      f.enabled
                        ? `${f.label} is no longer collected. Existing answers are kept.`
                        : `${f.label} is collected on every event again.`,
                    )}
                  >
                    {f.enabled ? "Stop collecting" : "Collect again"}
                  </button>
                )}

                {!f.builtin && (
                  <button
                    type="button" disabled={busy}
                    className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
                    onClick={() => setDeleteTarget(f)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="px-4 pb-3 text-[11.5px]" style={{ color: "var(--faint)" }}>
                {f.builtin
                  ? "Built in — rename it to suit the chapter. It can't be removed."
                  : KIND_COPY[f.kind]?.eg}
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
            placeholder="Beneficiary"
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
            A field&apos;s type is fixed once events start answering it — retyping
            an answered field has no safe reading.
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
                `${newLabel.trim()} is now collected on every event.`,
              ).then(() => { setAdding(false); setNewLabel(""); setNewKind("text"); })}
            >
              Add field
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-sm"
              onClick={() => { setAdding(false); setNewLabel(""); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="sc-btn sc-btn-ghost sc-btn-sm"
          disabled={atCeiling || busy}
          onClick={() => setAdding(true)}
          title={atCeiling ? `A chapter can collect at most ${MAX_EVENT_FIELDS} fields.` : undefined}
        >
          + New field
        </button>
      )}
      {atCeiling && (
        <p className="text-[11.5px]" style={{ color: "var(--faint)" }}>
          That&apos;s all {MAX_EVENT_FIELDS} fields. Stop collecting one to make room.
        </p>
      )}

      {deleteTarget && (
        <ConfirmDialog
          tone="dusk"
          title={`Delete “${deleteTarget.label}”?`}
          message={
            "Every event's answer to this field goes with it. If you only want to stop " +
            "asking, use “Stop collecting” instead — that keeps the answers on file."
          }
          confirmLabel="Delete"
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            void mutate(
              () => requestJson(`/api/events/fields/${target.id}`, { method: "DELETE" }),
              `${target.label} deleted.`,
            );
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
