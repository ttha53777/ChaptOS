"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "../../../../components/dashboard/primitives";
import { useChapter } from "../../../../context/ChapterContext";
import { requestJson } from "../../../../lib/api";
import { invalidateSemesters } from "../../../../hooks/useActiveSemester";
import { SEMESTERS_COPY as C, checkSemester, semesterBody, semesterRange, withActive, withCreated, withEdited } from "@/lib/settings/semesters";

interface Semester {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

/** New semester, or — given `editing` — fix an existing one's label/dates without changing which is active. */
function SemesterModal({
  editing, onClose, onSaved,
}: {
  editing?: Semester;
  onClose: () => void;
  onSaved: (s: Semester) => void;
}) {
  const [label, setLabel] = useState(editing?.label ?? "");
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [endDate, setEndDate] = useState(editing?.endDate ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = checkSemester(label, startDate, endDate);
    if (problem) { setFormError(problem); return; }
    setSaving(true);
    setFormError(null);
    try {
      const s = await requestJson<Semester>(editing ? `/api/semesters/${editing.id}` : "/api/semesters", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(semesterBody(label, startDate, endDate, !!editing)),
      });
      onSaved(s);
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : editing ? C.saveFailed : C.createFailed);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { border: "1px solid var(--line)", background: "var(--paper-2)", color: "var(--ink)" };
  return (
    <Modal title={editing ? C.editSemester : C.newSemester} onClose={onClose} tone="dusk">
      <form onSubmit={submit} className="space-y-4">
        {formError && (
          <div className="rounded-lg px-3 py-2 text-[12px]" style={{ border: "1px solid rgba(217,139,163,.25)", background: "var(--rose-bg)", color: "var(--rose)" }}>{formError}</div>
        )}
        <div className="space-y-3">
          <div>
            <label className="ui-label mb-1.5 block text-[11px] font-medium" style={{ color: "var(--muted)" }}>{C.label}</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={C.labelPlaceholder}
              className="ui-inp w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="ui-label mb-1.5 block text-[11px] font-medium" style={{ color: "var(--muted)" }}>{C.start}</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="ui-inp w-full min-w-0 rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={inputStyle} />
            </div>
            <div className="min-w-0">
              <label className="ui-label mb-1.5 block text-[11px] font-medium" style={{ color: "var(--muted)" }}>{C.end}</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="ui-inp w-full min-w-0 rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={inputStyle} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="ui-btn-ghost rounded-lg px-4 py-2 text-[12px] font-medium transition-colors"
            style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-soft)" }}>
            {C.cancel}
          </button>
          <button type="submit" disabled={saving}
            className="ui-btn-primary rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--vio)", color: "#1a1206" }}>
            {editing ? (saving ? C.saving : C.save) : (saving ? C.creating : C.create)}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SemestersSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { can } = useChapter();
  const canManage = can("MANAGE_SEMESTERS");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);

  useEffect(() => {
    requestJson<Semester[]>("/api/semesters")
      .then(setSemesters)
      .catch(() => onError(C.loadFailed))
      .finally(() => setLoading(false));
  }, [onError]);

  async function setActive(id: number) {
    setActivating(id);
    try {
      await requestJson(`/api/semesters/${id}`, { method: "PATCH" });
      setSemesters(prev => withActive(prev, id));
      invalidateSemesters();
      onStatus(C.activated);
    } catch {
      onError(C.activateFailed);
    } finally {
      setActivating(null);
    }
  }

  function onCreated(s: Semester) {
    setSemesters(prev => withCreated(prev, s));
    invalidateSemesters();
    onStatus(C.created(s.label));
  }

  function onEdited(s: Semester) {
    setSemesters(prev => withEdited(prev, s));
    invalidateSemesters();
    onStatus(C.saved(s.label));
  }

  return (
    <>
      <div className="sc-stack-tight">
        <div className="flex items-center justify-between gap-3">
          <p className="sc-lede" style={{ margin: 0 }}>{C.lede}</p>
          {canManage && (
            <button onClick={() => setNewOpen(true)} className="sc-btn sc-btn-accent sc-btn-sm">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              {C.newSemester}
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-8 text-center sc-note">{C.loading}</div>
        ) : semesters.length === 0 ? (
          <div className="sc-empty">
            <div className="t">{C.emptyTitle}</div>
            <div className="h">{C.emptyHint}</div>
          </div>
        ) : (
          <div className="sc-card">
            {semesters.map((s) => (
              <div
                key={s.id}
                className="sc-row sc-row-between"
                style={s.isActive ? { background: "var(--vio-bg)" } : undefined}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="sc-row-key truncate">{s.label}</span>
                    {s.isActive && <span className="sc-pill sc-pill-vio shrink-0">{C.active}</span>}
                  </div>
                  <p className="sc-row-sub">{semesterRange(s)[0]}{semesterRange(s)[1]}{semesterRange(s)[2]}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditing(s)} className="sc-btn sc-btn-ghost sc-btn-sm">{C.edit}</button>
                    {!s.isActive && (
                      <button
                        onClick={() => setActive(s.id)}
                        disabled={activating === s.id}
                        className="sc-btn sc-btn-ghost sc-btn-sm"
                      >
                        {activating === s.id ? C.setting : C.setActive}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {newOpen && (
        <SemesterModal onClose={() => setNewOpen(false)} onSaved={onCreated} />
      )}
      {editing && (
        <SemesterModal editing={editing} onClose={() => setEditing(null)} onSaved={onEdited} />
      )}
    </>
  );
}
