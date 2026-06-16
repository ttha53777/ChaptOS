"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "../../../components/dashboard/primitives";
import { useChapter } from "../../../context/ChapterContext";
import { requestJson } from "../../../lib/api";

interface Semester {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

function NewSemesterModal({
  onClose, onCreated, onError,
}: {
  onClose: () => void;
  onCreated: (s: Semester) => void;
  onError: (msg: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !startDate || !endDate) { setFormError("All fields are required."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const s = await requestJson<Semester>("/api/semesters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), startDate, endDate }),
      });
      onCreated(s);
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create semester.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { border: "1px solid var(--line)", background: "var(--paper-2)", color: "var(--ink)" };
  return (
    <Modal title="New semester" onClose={onClose} tone="dusk">
      <form onSubmit={submit} className="space-y-4">
        {formError && (
          <div className="rounded-lg px-3 py-2 text-[12px]" style={{ border: "1px solid rgba(217,139,163,.25)", background: "var(--rose-bg)", color: "var(--rose)" }}>{formError}</div>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium" style={{ color: "var(--muted)" }}>Label</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Fall 2026"
              className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: "var(--muted)" }}>Start date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: "var(--muted)" }}>End date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={inputStyle} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-[12px] font-medium transition-colors"
            style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-soft)" }}>
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--vio)", color: "#1a1206" }}>
            {saving ? "Creating…" : "Create & activate"}
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

  useEffect(() => {
    requestJson<Semester[]>("/api/semesters")
      .then(setSemesters)
      .catch(() => onError("Could not load semesters."))
      .finally(() => setLoading(false));
  }, [onError]);

  async function setActive(id: number) {
    setActivating(id);
    try {
      await requestJson(`/api/semesters/${id}`, { method: "PATCH" });
      setSemesters(prev => prev.map(s => ({ ...s, isActive: s.id === id })));
      onStatus("Active semester updated.");
    } catch {
      onError("Failed to switch active semester.");
    } finally {
      setActivating(null);
    }
  }

  function onCreated(s: Semester) {
    setSemesters(prev => [s, ...prev.map(x => ({ ...x, isActive: false }))]);
    onStatus(`Semester "${s.label}" created and set active.`);
  }

  return (
    <>
      <div className="sc-stack-tight">
        <div className="flex items-center justify-between gap-3">
          <p className="sc-lede" style={{ margin: 0 }}>Switch the active semester or create a new one.</p>
          {canManage && (
            <button onClick={() => setNewOpen(true)} className="sc-btn sc-btn-accent sc-btn-sm">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              New semester
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-8 text-center sc-note">Loading…</div>
        ) : semesters.length === 0 ? (
          <div className="sc-empty">
            <div className="t">No semesters yet</div>
            <div className="h">Create one to start scoping your reporting periods.</div>
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
                    {s.isActive && <span className="sc-pill sc-pill-vio shrink-0">Active</span>}
                  </div>
                  <p className="sc-row-sub">{s.startDate} – {s.endDate}</p>
                </div>
                {!s.isActive && canManage && (
                  <button
                    onClick={() => setActive(s.id)}
                    disabled={activating === s.id}
                    className="sc-btn sc-btn-ghost sc-btn-sm shrink-0"
                  >
                    {activating === s.id ? "Setting…" : "Set active"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {newOpen && (
        <NewSemesterModal onClose={() => setNewOpen(false)} onCreated={onCreated} onError={onError} />
      )}
    </>
  );
}
