"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "../../components/dashboard/primitives";

interface Semester {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch { /* ignore */ }
    throw new Error(`${url} returned ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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

  return (
    <Modal title="New Semester" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {formError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-[12px] text-red-400">{formError}</div>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-slate-400">Label</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Fall 2026"
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/[0.08]">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50">
            {saving ? "Creating…" : "Create & Activate"}
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-slate-500">Switch the active semester or create a new one.</p>
          <button
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/20"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            New Semester
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-[11px] text-slate-600">Loading…</div>
        ) : semesters.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] py-8 text-center text-[11px] text-slate-600">
            No semesters yet. Create one to get started.
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            {semesters.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-3 px-4 py-3.5 ${i < semesters.length - 1 ? "border-b border-white/[0.04]" : ""} ${s.isActive ? "bg-indigo-500/[0.06]" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-slate-200 truncate">{s.label}</span>
                    {s.isActive && (
                      <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">Active</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">{s.startDate} – {s.endDate}</p>
                </div>
                {!s.isActive && (
                  <button
                    onClick={() => setActive(s.id)}
                    disabled={activating === s.id}
                    className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400 disabled:opacity-40"
                  >
                    {activating === s.id ? "Setting…" : "Set Active"}
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
