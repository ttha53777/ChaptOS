"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";
import { DEFAULT_THRESHOLDS, THRESHOLD_KEYS, type Thresholds } from "@/lib/thresholds";

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
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= min && num <= max) onChange(field, num);
    setEditing(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] py-3 last:border-0">
      <span className="text-[12px] text-slate-400">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="number"
            step={step}
            min={min}
            max={max}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKey}
            className="w-20 rounded-md border border-indigo-500/50 bg-indigo-500/10 px-2 py-1 text-right text-[12px] font-semibold tabular-nums text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {unit && <span className="text-[11px] text-slate-500">{unit}</span>}
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="group flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-white/[0.05]"
        >
          <span className="text-[12px] font-semibold tabular-nums text-slate-200">{value}{unit}</span>
          <svg className="h-3 w-3 text-slate-600 transition-colors group-hover:text-slate-400" viewBox="0 0 16 16" fill="currentColor">
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

  const dirty = useMemo(
    () => THRESHOLD_KEYS.some(k => draft[k] !== persisted[k]),
    [draft, persisted],
  );

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
      onStatus("Thresholds saved for everyone in this org.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      onError(
        message.includes("403") || /forbidden/i.test(message)
          ? "Only an org admin can change thresholds."
          : "Couldn't save your changes. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, draft, refreshChapterData, onStatus, onError]);

  return (
    <div className="space-y-6">
      <p className="text-[12px] text-slate-500">
        Click any value to edit it inline. These cutoffs apply to everyone in your
        org and drive the At-Risk / Watch badges and the health score. Saving
        updates the dashboard for all members.
      </p>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4">
        <p className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Attendance</p>
        <ThresholdRow label="At risk below" field="attendanceAtRisk" value={draft.attendanceAtRisk} unit="%" step={1} min={0} max={100} onChange={update} />
        <ThresholdRow label="Watch below"   field="attendanceWatch"  value={draft.attendanceWatch}  unit="%" step={1} min={0} max={100} onChange={update} />

        <p className="pt-5 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-600">GPA</p>
        <ThresholdRow label="At risk below" field="gpaAtRisk" value={draft.gpaAtRisk} unit="" step={0.1} min={0} max={4} onChange={update} />
        <ThresholdRow label="Watch below"   field="gpaWatch"   value={draft.gpaWatch}   unit="" step={0.1} min={0} max={4} onChange={update} />

        <p className="pt-5 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Service</p>
        <ThresholdRow label="Hours goal" field="serviceHoursGoal" value={draft.serviceHoursGoal} unit="h" step={1} min={0} max={1000} onChange={update} />
        <div className="pb-1" />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-all hover:bg-indigo-500 disabled:cursor-default disabled:opacity-30"
        >
          {saving ? "Saving…" : "Save thresholds"}
        </button>
        <button
          onClick={reset}
          disabled={saving}
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-30"
        >
          Reset to defaults
        </button>
        {dirty && (
          <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
            Unsaved
          </span>
        )}
      </div>
    </div>
  );
}
