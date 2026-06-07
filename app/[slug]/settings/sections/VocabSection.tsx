"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";
import { VOCAB_KEYS, DEFAULT_LABELS, type VocabKey, type VocabOverrides } from "@/lib/vocab";

// Settings → Vocabulary. Lets an org admin rename canonical terms throughout
// the UI — nav labels, page headings, and other surfaces that call useVocab().
// Follows the same pattern as WorkflowsSection: reads from ChapterContext as
// source of truth, diffs locally to detect unsaved changes, PATCHes on save,
// then calls refreshChapterData() so the rest of the UI updates immediately.

const VOCAB_GROUPS: { label: string; keys: VocabKey[] }[] = [
  {
    label: "People",
    keys: ["Member", "Admin", "Role"],
  },
  {
    label: "Features",
    keys: ["Treasury", "Meetings", "Service", "Attendance", "Announcement", "Doc"],
  },
  {
    label: "Time",
    keys: ["Period", "Event"],
  },
];

export function VocabSection({
  onStatus,
  onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { currentUser, refreshChapterData } = useChapter();

  const persisted = useMemo(
    () => (currentUser?.org?.vocabularyOverrides ?? {}) as VocabOverrides,
    [currentUser?.org?.vocabularyOverrides],
  );

  const persistedKey = useMemo(() => JSON.stringify(persisted), [persisted]);

  const [draft, setDraft] = useState<VocabOverrides>(() => ({ ...persisted }));
  const [saving, setSaving] = useState(false);

  const lastSyncedKey = useRef(persistedKey);
  useEffect(() => {
    if (lastSyncedKey.current === persistedKey) return;
    lastSyncedKey.current = persistedKey;
    setDraft({ ...persisted });
  }, [persistedKey, persisted]);

  const dirty = useMemo(() => {
    for (const key of VOCAB_KEYS) {
      const draftVal = draft[key] ?? "";
      const persistedVal = persisted[key] ?? "";
      if (draftVal !== persistedVal) return true;
    }
    return false;
  }, [draft, persisted]);

  function setField(key: VocabKey, value: string) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function reset() {
    setDraft({ ...persisted });
  }

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    // Send only non-empty overrides. Empty string = "use default" = omit the key.
    const overrides: VocabOverrides = {};
    for (const key of VOCAB_KEYS) {
      const val = draft[key]?.trim();
      if (val) overrides[key] = val;
    }

    try {
      await requestJson("/api/orgs/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vocabularyOverrides: overrides }),
      });
      await refreshChapterData().catch(() => undefined);
      onStatus("Vocabulary updated.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      onError(
        message.includes("403") || /forbidden/i.test(message)
          ? "Only an org admin can change vocabulary."
          : "Couldn't save your changes. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, draft, refreshChapterData, onStatus, onError]);

  return (
    <div className="space-y-6">
      <p className="text-[12px] text-slate-500">
        Rename canonical terms to match your organization&apos;s language. Leave a field blank to use the default.
        Changes appear in sidebar labels and page headings immediately after saving.
      </p>

      {VOCAB_GROUPS.map(group => (
        <div key={group.label}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">{group.label}</p>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
            {group.keys.map(key => {
              const value = draft[key] ?? "";
              const placeholder = DEFAULT_LABELS[key];
              return (
                <div key={key} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-28 shrink-0 text-[12px] font-medium text-slate-400">{key}</span>
                  <input
                    type="text"
                    value={value}
                    onChange={e => setField(key, e.target.value)}
                    placeholder={placeholder}
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-all hover:bg-indigo-500 disabled:cursor-default disabled:opacity-30"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={reset}
          disabled={!dirty || saving}
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-30"
        >
          Reset
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
