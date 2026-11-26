"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../../context/ChapterContext";
import { requestJson } from "../../../../lib/api";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";
import { THRESHOLD_GROUPS, THRESHOLDS_COPY as C, checkThreshold, thresholdsDirty } from "@/lib/settings/thresholds";
import { saveErrorOf } from "@/lib/settings/workflows";
import { useDirtyGuard } from "../SettingsDirtyContext";

// Settings → Thresholds. Org-wide member-status cutoffs that drive every
// At-Risk/Watch badge and the health score. Persisted to OrganizationConfig
// (not localStorage), so every officer shares one set of rules across devices.
//
// Follows the VocabSection pattern: ChapterContext is the source of truth, the
// draft diffs locally to detect unsaved changes, save PATCHes /api/orgs/config
// then calls refreshChapterData() so the dashboard reflects the new cutoffs
// without a manual reload.

function ThresholdRow({
  label, field, value, unit = "", step = 1, min = 0, max = 100, onChange,
}: {
  label: string;
  field: keyof Thresholds;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (field: keyof Thresholds, value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(String(value));
    setInvalid(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  // Commit fires on blur as well as Enter, so a rejected value used to be thrown
  // away in silence: type a number, click elsewhere, watch the old one come
  // back. Now an out-of-range value keeps the editor open and says why. Escape
  // is still the way to abandon an edit.
  function commit() {
    const checked = checkThreshold(draft, { min, max, unit });
    if ("error" in checked) {
      setInvalid(checked.error);
      return;
    }
    onChange(field, checked.value);
    setInvalid(null);
    setEditing(false);
  }

  function cancel() {
    setInvalid(null);
    setEditing(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") cancel();
  }

  return (
    <div className="sc-row sc-row-between">
      <span className="sc-row-key">{label}</span>
      {editing ? (
        <div>
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="number"
              step={step}
              min={min}
              max={max}
              value={draft}
              onChange={e => { setDraft(e.target.value); setInvalid(null); }}
              onBlur={commit}
              onKeyDown={onKey}
              aria-invalid={invalid != null}
              aria-describedby={invalid ? `${field}-err` : undefined}
              className="sc-input sc-input-num sc-input-sm w-20"
              style={invalid ? { borderColor: "rgba(217,139,163,.6)" } : undefined}
            />
            {unit && <span className="sc-unit">{unit}</span>}
          </div>
          {invalid && (
            <p className="sc-err mt-1 text-right" id={`${field}-err`} role="alert">{invalid}</p>
          )}
        </div>
      ) : (
        <button onClick={startEdit} className="sc-edit-btn">
          <span className="v">{value}{unit}</span>
          <svg className="pen" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ThresholdsSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, refreshChapterData } = useChapter();

  // Source of truth: the org's resolved thresholds from /me (always complete).
  const persisted = useMemo<Thresholds>(
    () => currentUser?.org?.thresholds ?? DEFAULT_THRESHOLDS,
    [currentUser?.org?.thresholds],
  );
  const persistedKey = useMemo(() => JSON.stringify(persisted), [persisted]);

  const [draft, setDraft] = useState<Thresholds>(() => ({ ...persisted }));
  const [saving, setSaving] = useState(false);

  // Re-sync the draft if the persisted value changes underneath us (another
  // tab/officer saved, or the first /me load landed after mount).
  const lastSyncedKey = useRef(persistedKey);
  useEffect(() => {
    if (lastSyncedKey.current === persistedKey) return;
    lastSyncedKey.current = persistedKey;
    setDraft({ ...persisted });
  }, [persistedKey, persisted]);

  const dirty = useMemo(() => thresholdsDirty(draft, persisted), [draft, persisted]);
  useDirtyGuard("thresholds", dirty);

  function update(field: keyof Thresholds, value: number) {
    setDraft(prev => ({ ...prev, [field]: value }));
  }

  function reset() {
    setDraft({ ...DEFAULT_THRESHOLDS });
  }

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholds: draft }),
      });
      await refreshChapterData().catch(() => undefined);
      onStatus(C.saved);
    } catch (e) {
      onError(saveErrorOf(e instanceof Error ? e.message : "", C.forbidden));
    } finally {
      setSaving(false);
    }
  }, [saving, draft, refreshChapterData, onStatus, onError]);

  return (
    <div className="sc-stack-tight">
      <p className="sc-lede">{C.lede}</p>

      {THRESHOLD_GROUPS.map(g => (
        <div key={g.label}>
          <p className="sc-grp-label">{g.label}</p>
          <div className="sc-card sc-card-pad">
            {g.rows.map(r => (
              <ThresholdRow key={r.field} label={r.label} field={r.field} value={draft[r.field]} unit={r.unit} step={r.step} min={r.min} max={r.max} onChange={update} />
            ))}
          </div>
        </div>
      ))}

      <div className="sc-actions">
        <button onClick={save} disabled={!dirty || saving} className="sc-btn sc-btn-primary">
          {saving ? C.saving : C.save}
        </button>
        <button onClick={reset} disabled={saving} className="sc-btn sc-btn-ghost">
          {C.reset}
        </button>
        {dirty && <span className="sc-dirty">{C.unsaved}</span>}
      </div>
    </div>
  );
}
