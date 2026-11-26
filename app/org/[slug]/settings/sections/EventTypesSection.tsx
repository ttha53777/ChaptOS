"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../../../components/dashboard/primitives";
import { requestJson } from "../../../../lib/api";
import { useChapter } from "../../../../context/ChapterContext";
import type { CalEventType } from "@/app/data";
import { EVENT_TYPE_PALETTE, nextPaletteColor, type EventTypeColor } from "@/lib/event-types";
import {
  EVENT_TYPES_COPY as C, MAX_EVENT_TYPES, TYPE_LABEL_MAX, newTypeSlug, sameColor, slugifyType, typeTag,
} from "@/lib/settings/event-types";

// Settings → Event types. The org's timeline categories: what the add-event
// picker offers and what colors the timeline's dots, spine and legend use.
// The same set the founder chose on /create's Timeline step — this is where it
// stays editable, so that step's "editable in Settings later" is true.
//
// Two kinds of row, and the difference is enforced by the service, not here:
//   · BUILT-IN (chapter/party/deadline/service) — rename + recolor only. Their
//     slugs are load-bearing (behavior branches and timeline synthesis key off
//     them), so they can't be deleted, and an active one can't be hidden.
//   · CUSTOM — everything above plus delete, which the service refuses while
//     events still reference the type.
// We surface those refusals as the API returns them rather than duplicating the
// rules client-side, so the two can't drift.

/** Palette picker. Both hexes move together — a type is one ivory/dusk pair. */
function ColorPicker({
  colorDark,
  onPick,
}: {
  colorDark: string | null;
  onPick: (c: { color: string; colorDark: string }) => void;
}) {
  return (
    <div className="et-swatches">
      {EVENT_TYPE_PALETTE.map(c => (
        <button
          key={c.id}
          type="button"
          className={`et-swatch${sameColor(colorDark, c.colorDark) ? " on" : ""}`}
          style={{ background: c.colorDark, ["--sc" as string]: c.colorDark }}
          title={c.label}
          aria-label={C.useColor(c.label)}
          onClick={() => onPick({ color: c.color, colorDark: c.colorDark })}
        />
      ))}
    </div>
  );
}

function TypeRow({
  type,
  enabledWorkflows,
  onUpdated,
  onDeleted,
  onStatus,
  onError,
}: {
  type: CalEventType;
  enabledWorkflows: readonly string[];
  onUpdated: (t: CalEventType) => void;
  onDeleted: (id: number) => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [label, setLabel] = useState(type.label);
  const [color, setColor] = useState({ color: type.color, colorDark: type.colorDark ?? type.color });

  useEffect(() => {
    setLabel(type.label);
    setColor({ color: type.color, colorDark: type.colorDark ?? type.color });
  }, [type]);

  const tag = typeTag(type, enabledWorkflows);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await requestJson<CalEventType>(`/api/calendar/event-types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), color: color.color, colorDark: color.colorDark }),
      });
      onUpdated(updated);
      setEditing(false);
      onStatus(C.saved(updated.label));
    } catch (e) {
      onError(e instanceof Error ? e.message : C.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await requestJson(`/api/calendar/event-types/${type.id}`, { method: "DELETE" });
      onDeleted(type.id);
      onStatus(C.removed(type.label));
    } catch (e) {
      onError(e instanceof Error ? e.message : C.deleteFailed);
    } finally {
      setDeleting(false);
    }
  }

  if (!editing) {
    return (
      <div className="sc-row sc-row-between">
        <div className="sc-row-lead et-lead">
          <span className="et-dot" style={{ background: type.colorDark ?? type.color }} />
          <div>
            <div className="sc-row-key">
              {type.label}
              {type.builtin && <span className="sc-pill sc-pill-muted et-tag">{C.builtin}</span>}
              {tag && (
                <span className="sc-pill sc-pill-gold et-tag">
                  {tag}
                </span>
              )}
            </div>
            <div className="sc-row-sub">
              <code>{type.slug}</code>
              {!type.creatable && <>{C.bookedElsewhere}</>}
              {type.workflowId && <>{C.follows(type.workflowId)[0]}{C.follows(type.workflowId)[1]}{C.follows(type.workflowId)[2]}</>}
            </div>
          </div>
        </div>
        <div className="sc-actions">
          <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={() => setEditing(true)}>
            {C.edit}
          </button>
          {!type.builtin && (
            <button className="sc-btn sc-btn-danger sc-btn-sm" onClick={() => setConfirmDelete(true)} disabled={deleting}>
              {deleting ? C.removing : C.delete}
            </button>
          )}
        </div>
        {confirmDelete && (
          <ConfirmDialog
            title={C.deleteTitle(type.label)}
            message={C.deleteMessage}
            confirmLabel={C.delete}
            tone="dusk"
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="sc-row" style={{ display: "block" }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="sc-mlabel">{C.label}</label>
          <input
            className="sc-input sc-input-sm mt-1"
            value={label}
            maxLength={TYPE_LABEL_MAX}
            onChange={e => setLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="sc-mlabel">{C.slug}</label>
          <input className="sc-input sc-input-sm mt-1" style={{ fontFamily: "var(--mono)" }} value={type.slug} disabled />
        </div>
      </div>
      <div className="mt-3">
        <label className="sc-mlabel">{C.color}</label>
        <ColorPicker colorDark={color.colorDark} onPick={setColor} />
      </div>
      <div className="flex gap-2 pt-3">
        <button className="sc-btn sc-btn-primary sc-btn-sm" onClick={handleSave} disabled={saving || !label.trim()}>
          {saving ? C.saving : C.save}
        </button>
        <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={() => setEditing(false)} disabled={saving}>
          {C.cancel}
        </button>
      </div>
    </div>
  );
}

export function EventTypesSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser } = useChapter();
  const enabledWorkflows = useMemo(
    () => (currentUser?.org?.enabledWorkflows ?? []) as string[],
    [currentUser?.org?.enabledWorkflows],
  );

  const [types, setTypes] = useState<CalEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<EventTypeColor>(EVENT_TYPE_PALETTE[0]!);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await requestJson<CalEventType[]>("/api/calendar/event-types");
      if (mounted.current) setTypes(data);
    } catch {
      if (mounted.current) onError(C.loadFailed);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setNewColor(nextPaletteColor(types.map(t => t.color)));
    setNewLabel("");
    setShowNew(true);
  }

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label) return;
    const slug = newTypeSlug(label, types.map(t => t.slug));

    setCreating(true);
    try {
      const created = await requestJson<CalEventType>("/api/calendar/event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          label,
          color: newColor.color,
          colorDark: newColor.colorDark,
          // Ungated, matching what the /create step's adder produces: a type
          // someone typed by hand shouldn't disappear with a page toggle.
          workflowId: null,
          displayOrder: types.length,
        }),
      });
      setTypes(prev => [...prev, created]);
      setShowNew(false);
      onStatus(C.added(created.label));
    } catch (e) {
      onError(e instanceof Error ? e.message : C.createFailed);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="py-8 text-center sc-note">{C.loading}</div>;

  return (
    <div className="sc-stack-tight">
      {/* No lede paragraph here — the section header already renders NAV_ITEMS'
          `lede` for this section, and repeating it reads as a stutter. */}
      <div className="sc-card" style={{ display: "flex", flexDirection: "column" }}>
        {types.map((type, i) => (
          <div
            key={type.id}
            style={i < types.length - 1 ? { borderBottom: "1px solid var(--line-soft)" } : undefined}
          >
            <TypeRow
              type={type}
              enabledWorkflows={enabledWorkflows}
              onUpdated={updated => setTypes(prev => prev.map(t => (t.id === updated.id ? updated : t)))}
              onDeleted={id => setTypes(prev => prev.filter(t => t.id !== id))}
              onStatus={onStatus}
              onError={onError}
            />
          </div>
        ))}
      </div>

      {types.length >= MAX_EVENT_TYPES && (
        <p className="sc-note">{C.maxed[0]}{C.maxed[1]}{C.maxed[2]}</p>
      )}

      {showNew && (
        <div
          className="rounded-xl px-4 py-4 space-y-3"
          style={{ border: "1px solid rgba(var(--vio-rgb),.35)", background: "var(--card)" }}
        >
          <h3 className="sc-h" style={{ fontSize: 14 }}>
            {C.newType}
          </h3>
          <div>
            <label className="sc-mlabel">{C.labelReq}</label>
            <input
              className="sc-input sc-input-sm mt-1"
              value={newLabel}
              maxLength={TYPE_LABEL_MAX}
              placeholder={C.labelPlaceholder}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newLabel.trim()) handleCreate();
              }}
            />
            {newLabel.trim() && (
              <p className="sc-note mt-1">
                {C.slugPreview("")[0]}<code>{slugifyType(newLabel) || "type"}</code>{C.slugPreview("")[2]}
              </p>
            )}
          </div>
          <div>
            <label className="sc-mlabel">{C.color}</label>
            <ColorPicker colorDark={newColor.colorDark} onPick={c => setNewColor({ ...newColor, ...c })} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="sc-btn sc-btn-primary sc-btn-sm"
              onClick={handleCreate}
              disabled={creating || !newLabel.trim()}
            >
              {creating ? C.creating : C.create}
            </button>
            <button className="sc-btn sc-btn-ghost sc-btn-sm" onClick={() => setShowNew(false)} disabled={creating}>
              {C.cancel}
            </button>
          </div>
        </div>
      )}

      {!showNew && types.length < MAX_EVENT_TYPES && (
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] transition-colors"
          style={{ border: "1px dashed var(--line)", color: "var(--muted)" }}
        >
          <span className="text-base leading-none">+</span>{` ${C.add}`}
        </button>
      )}
    </div>
  );
}
