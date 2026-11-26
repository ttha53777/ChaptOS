"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../../context/ChapterContext";
import { requestJson } from "../../../../lib/api";
import type { CustomMemberFieldDef, FieldType } from "@/lib/custom-member-fields";
import {
  FIELD_TYPES, MAX_FIELDS, MAX_LABEL, MEMBER_FIELDS_COPY as C, PLACEHOLDER_MAX,
  blankField, fieldsDirty, fieldsPayload, fieldsSaveError, moveField as moved, toDraft, type DraftField,
} from "@/lib/settings/member-fields";
import { ConfirmDialog } from "../../../../components/dashboard/primitives";
import { useDirtyGuard } from "../SettingsDirtyContext";

// Settings → Member Fields. Lets an org admin define extra fields that appear
// on the member roster and in the MemberSpotlight About section (e.g. jersey number,
// major, pledge class). Follows the VocabSection / ThresholdsSection pattern:
// reads from ChapterContext as source of truth, diffs locally, PATCHes on save,
// then calls refreshChapterData() so the rest of the UI updates immediately.

export function MemberFieldsSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, refreshChapterData } = useChapter();

  const persisted: CustomMemberFieldDef[] = useMemo(
    () => currentUser?.org?.customMemberFields ?? [],
    [currentUser?.org?.customMemberFields],
  );
  const persistedKey = useMemo(() => JSON.stringify(persisted), [persisted]);

  const [draft, setDraft] = useState<DraftField[]>(() => toDraft(persisted));
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  const lastSyncedKey = useRef(persistedKey);
  useEffect(() => {
    if (lastSyncedKey.current === persistedKey) return;
    lastSyncedKey.current = persistedKey;
    setDraft(toDraft(persisted));
    setEditingIdx(null);
    setDeleteConfirmIdx(null);
  }, [persistedKey, persisted]);

  // Dirty when the serialized draft differs from persisted.
  const dirty = useMemo(() => fieldsDirty(draft, persisted), [draft, persisted]);
  useDirtyGuard("member-fields", dirty);

  function addField() {
    if (draft.length >= MAX_FIELDS) return;
    setDraft(prev => [...prev, blankField(prev.length)]);
    setEditingIdx(draft.length);
  }

  function removeField(idx: number) {
    setDraft(prev => prev.filter((_, i) => i !== idx));
    setDeleteConfirmIdx(null);
    if (editingIdx === idx) setEditingIdx(null);
  }

  function updateField(idx: number, patch: Partial<DraftField>) {
    setDraft(prev => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function moveField(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= draft.length) return;
    setDraft(prev => moved(prev, idx, dir));
  }

  function reset() {
    setDraft(toDraft(persisted));
    setEditingIdx(null);
    setDeleteConfirmIdx(null);
  }

  const save = useCallback(async () => {
    if (saving) return;

    // Validate: every field must have a label.
    const problem = fieldsSaveError(draft);
    if (problem) {
      onError(problem);
      return;
    }

    setSaving(true);
    const payload = fieldsPayload(draft);
    try {
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customMemberFields: payload }),
      });
      await refreshChapterData().catch(() => undefined);
      setEditingIdx(null);
      onStatus(C.saved);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      onError(
        message.includes("403") || /forbidden/i.test(message)
          ? C.forbidden
          : C.failed,
      );
    } finally {
      setSaving(false);
    }
  }, [saving, draft, refreshChapterData, onStatus, onError]);

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede" style={{ margin: 0 }}>
        {C.lede}
      </p>

      {/* Field list */}
      <div className="space-y-2">
        {draft.length === 0 && (
          <div className="sc-empty">
            <div className="t">{C.emptyTitle}</div>
            <div className="h">{C.emptyHint}</div>
          </div>
        )}

        {draft.map((field, idx) => (
          <div key={field.id || `new-${idx}`} className="sc-card">
            {/* Row summary */}
            <div className="flex items-center gap-2 px-4 py-3">
              {/* Reorder buttons */}
              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  onClick={() => moveField(idx, -1)}
                  disabled={idx === 0}
                  className="flex h-4 w-4 items-center justify-center rounded disabled:opacity-20"
                  style={{ color: "var(--faint)" }}
                  aria-label={C.moveUp}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => moveField(idx, 1)}
                  disabled={idx === draft.length - 1}
                  className="flex h-4 w-4 items-center justify-center rounded disabled:opacity-20"
                  style={{ color: "var(--faint)" }}
                  aria-label={C.moveDown}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Label */}
              <span className="min-w-0 flex-1 truncate sc-row-key">
                {field.label || <span className="italic" style={{ color: "var(--faint)", fontWeight: 400 }}>{C.untitled}</span>}
              </span>

              {/* Type badge */}
              <span className="sc-pill sc-pill-muted shrink-0">{field.type}</span>

              {/* Roster badge */}
              {field.showOnRoster && <span className="sc-pill sc-pill-vio shrink-0">{C.roster}</span>}

              {/* Edit / Delete buttons */}
              <button
                onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
              >
                {editingIdx === idx ? C.done : C.edit}
              </button>
              <button
                onClick={() => setDeleteConfirmIdx(idx)}
                className="sc-btn sc-btn-danger sc-btn-sm shrink-0"
                aria-label={C.deleteLabel(field.label)}
              >
                ✕
              </button>
            </div>

            {/* Edit form */}
            {editingIdx === idx && (
              <div className="px-4 py-4 space-y-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
                {/* Label */}
                <div className="flex items-center gap-3">
                  <label className="w-28 shrink-0 text-[12px]" style={{ color: "var(--muted)" }}>{C.label}</label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={e => updateField(idx, { label: e.target.value })}
                    maxLength={MAX_LABEL}
                    placeholder={C.labelPlaceholder}
                    className="sc-input sc-input-sm flex-1"
                  />
                </div>

                {/* Type */}
                <div className="flex items-center gap-3">
                  <label className="w-28 shrink-0 text-[12px]" style={{ color: "var(--muted)" }}>{C.type}</label>
                  <select
                    value={field.type}
                    onChange={e => updateField(idx, { type: e.target.value as FieldType })}
                    className="sc-select sc-input-sm flex-1"
                  >
                    {FIELD_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Placeholder */}
                <div className="flex items-center gap-3">
                  <label className="w-28 shrink-0 text-[12px]" style={{ color: "var(--muted)" }}>{C.placeholder}</label>
                  <input
                    type="text"
                    value={field.placeholder ?? ""}
                    onChange={e => updateField(idx, { placeholder: e.target.value || undefined })}
                    maxLength={PLACEHOLDER_MAX}
                    placeholder={C.placeholderHint}
                    className="sc-input sc-input-sm flex-1"
                  />
                </div>

                {/* Toggles */}
                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: "var(--ink-soft)" }}>
                    <input
                      type="checkbox"
                      checked={field.showOnRoster}
                      onChange={e => updateField(idx, { showOnRoster: e.target.checked })}
                      className="h-3.5 w-3.5 rounded"
                      style={{ accentColor: "var(--vio)" }}
                    />
                    {C.showOnRoster}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: "var(--ink-soft)" }}>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={e => updateField(idx, { required: e.target.checked })}
                      className="h-3.5 w-3.5 rounded"
                      style={{ accentColor: "var(--vio)" }}
                    />
                    {C.required}
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add field button */}
      {draft.length < MAX_FIELDS && (
        <button
          onClick={addField}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
          style={{ border: "1px dashed var(--line)", background: "transparent", color: "var(--muted)" }}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {C.add}
        </button>
      )}
      {draft.length >= MAX_FIELDS && (
        <p className="sc-note">{C.maxed[0]}{C.maxed[1]}{C.maxed[2]}</p>
      )}

      {/* Save / reset */}
      <div className="sc-actions">
        <button onClick={save} disabled={!dirty || saving} className="sc-btn sc-btn-primary">
          {saving ? C.saving : C.save}
        </button>
        <button onClick={reset} disabled={!dirty || saving} className="sc-btn sc-btn-ghost">
          {C.reset}
        </button>
        {dirty && <span className="sc-dirty">{C.unsaved}</span>}
      </div>

      {deleteConfirmIdx !== null && (() => {
        const field = draft[deleteConfirmIdx];
        const persistedField = field?.id && persisted.some(p => p.id === field.id);
        return (
          <ConfirmDialog
            title={C.removeTitle(field?.label ?? "")}
            message={C.removeMessage(Boolean(persistedField))}
            confirmLabel={C.remove}
            tone="dusk"
            onConfirm={() => removeField(deleteConfirmIdx)}
            onCancel={() => setDeleteConfirmIdx(null)}
          />
        );
      })()}
    </div>
  );
}
