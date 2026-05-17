"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { Sidebar } from "../components/Sidebar";
import { Card, Modal } from "../components/dashboard/primitives";
import { AddDeadlineForm, AddIGTaskForm, AddRevenueForm } from "../components/dashboard/forms";
import { useChapter } from "../context/ChapterContext";
import {
  THRESHOLDS,
  TaskStatus,
  ActivityEntry,
  Deadline,
  InstagramTask,
  PartyEvent,
  fmt$,
} from "../data";

// ─── Types ───────────────────────────────────────────────────────────────────

type ModalKey = "deadline" | "revenue" | "ig" | "newSemester" | null;

interface Semester {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface AccountRow {
  id: number;
  name: string;
  role: string;
  linked: boolean;
  isSelf: boolean;
}

type ThresholdValues = {
  attendanceAtRisk: number;
  attendanceWatch: number;
  gpaAtRisk: number;
  gpaWatch: number;
  serviceHoursGoal: number;
};

const THRESHOLD_STORAGE_KEY = "chaptos_thresholds";

function loadThresholds(): ThresholdValues {
  if (typeof window === "undefined") return { ...THRESHOLDS };
  try {
    const raw = localStorage.getItem(THRESHOLD_STORAGE_KEY);
    if (!raw) return { ...THRESHOLDS };
    return { ...THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return { ...THRESHOLDS };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _nextId = Date.now();

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch { /* ignore */ }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ThresholdRow({
  label, field, value, unit = "", step = 1, min = 0, max = 100,
  onChange,
}: {
  label: string;
  field: keyof ThresholdValues;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (field: keyof ThresholdValues, value: number) => void;
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
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(field, num);
    }
    setEditing(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/[0.04] last:border-0">
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
            className="w-20 rounded-md border border-indigo-500/50 bg-indigo-500/10 px-2 py-1 text-[12px] font-semibold tabular-nums text-white text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {unit && <span className="text-[11px] text-slate-500">{unit}</span>}
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="group flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white/[0.05] transition-colors"
        >
          <span className="text-[12px] font-semibold tabular-nums text-slate-200">
            {value}{unit}
          </span>
          <svg className="h-3 w-3 text-slate-600 group-hover:text-slate-400 transition-colors" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Z" />
          </svg>
        </button>
      )}
    </div>
  );
}

function SemesterSection({
  onOpenNew, onStatus, onError,
}: {
  onOpenNew: () => void;
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<number | null>(null);

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

  function onNewCreated(s: Semester) {
    setSemesters(prev => [s, ...prev.map(x => ({ ...x, isActive: false }))]);
    onStatus(`Semester "${s.label}" created and set active.`);
  }

  // Expose creator callback via ref trick — parent calls onOpenNew, we need to pass onNewCreated down
  // We render a hidden span that passes the callback up via a data attribute workaround isn't clean,
  // so instead we lift state: the NewSemesterModal is rendered here condionally.
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[12px] font-semibold text-slate-300">Semesters</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Switch the active semester or create a new one.</p>
          </div>
          <button
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            New Semester
          </button>
        </div>

        {loading ? (
          <div className="py-4 text-center text-[11px] text-slate-600">Loading…</div>
        ) : semesters.length === 0 ? (
          <div className="py-4 text-center text-[11px] text-slate-600">No semesters yet.</div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            {semesters.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${i < semesters.length - 1 ? "border-b border-white/[0.04]" : ""} ${s.isActive ? "bg-indigo-500/5" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-slate-200 truncate">{s.label}</span>
                    {s.isActive && (
                      <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">Active</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">{s.startDate} – {s.endDate}</p>
                </div>
                {!s.isActive && (
                  <button
                    onClick={() => setActive(s.id)}
                    disabled={activating === s.id}
                    className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-400 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400 transition-all disabled:opacity-40"
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
        <NewSemesterModal
          onClose={() => setNewOpen(false)}
          onCreated={onNewCreated}
          onError={onError}
        />
      )}
    </>
  );
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
    if (!label.trim() || !startDate || !endDate) {
      setFormError("All fields are required.");
      return;
    }
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
      const msg = err instanceof Error ? err.message : "Failed to create semester.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Semester" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {formError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-[12px] text-red-400">
            {formError}
          </div>
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
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-slate-400">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-slate-400 hover:bg-white/[0.08] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating…" : "Create & Activate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AuthAccountsSection({
  onStatus, onError,
}: {
  onStatus: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState<number | null>(null);

  useEffect(() => {
    requestJson<AccountRow[]>("/api/auth/accounts")
      .then(setAccounts)
      .catch(() => onError("Could not load account list."))
      .finally(() => setLoading(false));
  }, [onError]);

  async function unlink(id: number, name: string) {
    setUnlinking(id);
    try {
      await requestJson(`/api/auth/accounts/${id}`, { method: "DELETE" });
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, linked: false } : a));
      onStatus(`Unlinked Google account from ${name}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unlink account.";
      onError(msg);
    } finally {
      setUnlinking(null);
    }
  }

  const linked = accounts.filter(a => a.linked);
  const unlinked = accounts.filter(a => !a.linked);

  return (
    <div>
      <div className="mb-3">
        <p className="text-[12px] font-semibold text-slate-300">Auth Accounts</p>
        <p className="text-[11px] text-slate-500 mt-0.5">Manage which brothers have linked their Google account.</p>
      </div>

      {loading ? (
        <div className="py-4 text-center text-[11px] text-slate-600">Loading…</div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          {accounts.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-slate-600">No brothers found.</div>
          ) : (
            <>
              {linked.map((a, i) => (
                <div
                  key={a.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${i < linked.length - 1 || unlinked.length > 0 ? "border-b border-white/[0.04]" : ""}`}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-slate-200 truncate">{a.name}</span>
                        {a.isSelf && (
                          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">you</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">{a.role || "Member"} · linked</p>
                    </div>
                  </div>
                  {!a.isSelf && (
                    <button
                      onClick={() => unlink(a.id, a.name)}
                      disabled={unlinking === a.id}
                      className="shrink-0 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-500/15 transition-all disabled:opacity-40"
                    >
                      {unlinking === a.id ? "Unlinking…" : "Unlink"}
                    </button>
                  )}
                </div>
              ))}
              {unlinked.map((a, i) => (
                <div
                  key={a.id}
                  className={`flex items-center gap-2.5 px-4 py-3 ${i < unlinked.length - 1 ? "border-b border-white/[0.04]" : ""}`}
                >
                  <div className="h-2 w-2 rounded-full bg-slate-700 shrink-0" />
                  <div>
                    <span className="text-[12px] text-slate-500 truncate">{a.name}</span>
                    <p className="text-[11px] text-slate-700">{a.role || "Member"} · not linked</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKey>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Thresholds — localStorage-persisted
  const [thresholds, setThresholds] = useState<ThresholdValues>({ ...THRESHOLDS });
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false);
  const [thresholdsDirty, setThresholdsDirty] = useState(false);

  useEffect(() => {
    setThresholds(loadThresholds());
    setThresholdsLoaded(true);
  }, []);

  function updateThreshold(field: keyof ThresholdValues, value: number) {
    setThresholds(prev => ({ ...prev, [field]: value }));
    setThresholdsDirty(true);
  }

  function saveThresholds() {
    localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(thresholds));
    setThresholdsDirty(false);
    setStatusMsg("Thresholds saved — reload the dashboard to apply.");
  }

  function resetThresholds() {
    const defaults = { ...THRESHOLDS };
    setThresholds(defaults);
    localStorage.removeItem(THRESHOLD_STORAGE_KEY);
    setThresholdsDirty(false);
    setStatusMsg("Thresholds reset to defaults.");
  }

  const {
    brotherList,
    deadlineList,
    setDeadlineList,
    igTaskList,
    setIgTaskList,
    partyList,
    setPartyList,
    setActivityFeed,
    mutationError,
    setMutationError,
    refreshChapterData,
  } = useChapter();

  const brotherNames = useMemo(() => brotherList.map(b => b.name), [brotherList]);

  const addActivity = useCallback((message: string, type: ActivityEntry["type"]) => {
    const optimisticId = _nextId++;
    setActivityFeed(prev => [{ id: optimisticId, message, timestamp: "just now", type }, ...prev]);
    requestJson<ActivityEntry>("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, type }),
    })
      .then(saved => {
        setMutationError(null);
        setActivityFeed(prev => prev.map(e => (e.id === optimisticId ? { ...saved, timestamp: "just now" } : e)));
      })
      .catch(error => {
        console.error(error);
        setActivityFeed(prev => prev.filter(e => e.id !== optimisticId));
        setMutationError("Activity could not be saved to the database.");
      });
  }, [setActivityFeed, setMutationError]);

  function persistMutation<T>(
    operation: Promise<T>,
    errorMessage: string,
    rollback?: () => void,
    onSuccess?: (value: T) => void,
  ) {
    operation
      .then(value => {
        setMutationError(null);
        onSuccess?.(value);
      })
      .catch(error => {
        console.error(error);
        rollback?.();
        setMutationError(errorMessage);
      });
  }

  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 4000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  useEffect(() => {
    if (!pageError) return;
    const t = setTimeout(() => setPageError(null), 6000);
    return () => clearTimeout(t);
  }, [pageError]);

  function refreshDataFromDatabase() {
    refreshChapterData()
      .then(() => {
        setMutationError(null);
        setStatusMsg("Data refreshed from database");
        addActivity("Data refreshed from database", "info");
      })
      .catch(error => {
        console.error(error);
        setMutationError("Could not refresh data from the database.");
      });
  }

  function handleAddDeadline(d: { title: string; dueDate: string; owner: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setDeadlineList(prev => [...prev, { id: tempId, ...d }]);
    addActivity(`New deadline added: "${d.title}"`, "info");
    setActiveModal(null);
    persistMutation(
      requestJson<Deadline>("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      }),
      "Deadline could not be saved. Local changes were reverted.",
      () => setDeadlineList(prev => prev.filter(x => x.id !== tempId)),
      saved => setDeadlineList(prev => prev.map(x => (x.id === tempId ? saved : x))),
    );
  }

  function handleAddRevenue(e: { name: string; date: string; doorRevenue: number; attendance: number; notes: string }) {
    const tempId = _nextId++;
    setPartyList(prev => [
      ...prev,
      { id: tempId, theme: "", collabOrg: "", expenses: 0, partyType: "Open", completed: false, completedAt: null, ...e },
    ]);
    addActivity(`Revenue logged: ${e.name} — ${fmt$(e.doorRevenue)}`, "success");
    setActiveModal(null);
    persistMutation(
      requestJson<PartyEvent>("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      }),
      "Revenue entry could not be saved. Local changes were reverted.",
      () => setPartyList(prev => prev.filter(x => x.id !== tempId)),
      saved => setPartyList(prev => prev.map(x => (x.id === tempId ? saved : x))),
    );
  }

  function handleAddIGTask(t: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    const tempId = _nextId++;
    setIgTaskList(prev => [...prev, { id: tempId, ...t }]);
    addActivity(`IG task added: "${t.title}"`, "info");
    setActiveModal(null);
    persistMutation(
      requestJson<InstagramTask>("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      }),
      "Instagram task could not be saved. Local changes were reverted.",
      () => setIgTaskList(prev => prev.filter(x => x.id !== tempId)),
      saved => setIgTaskList(prev => prev.map(x => (x.id === tempId ? saved : x))),
    );
  }

  const combinedError = mutationError || pageError;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Settings"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Settings</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Chapter configuration &amp; data tools</p>
          </div>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">

            {(combinedError || statusMsg) && (
              <div
                className={`rounded-xl border px-4 py-3 text-[12px] transition-all ${
                  combinedError
                    ? "border-red-500/25 bg-red-500/10 text-red-200"
                    : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {combinedError ?? statusMsg}
              </div>
            )}

            {/* ── Data Controls + Quick Actions ── */}
            <Card className="overflow-hidden">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <h2 className="text-[14px] font-semibold text-white">Chapter Settings</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Database-backed controls · optimistic UI updates</p>
              </div>

              <div className="divide-y divide-white/[0.06]">
                <div className="px-5 py-4">
                  <p className="mb-3 text-[12px] font-semibold text-slate-300">Data Controls</p>
                  <p className="mb-3 text-[11px] text-slate-500">
                    Dashboard changes are saved through the Prisma API. Use the button below to refresh the local view
                    from the database.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={refreshDataFromDatabase}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 focus:outline-none"
                    >
                      <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh from database
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-white/[0.2] hover:bg-white/[0.08] focus:outline-none"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-slate-400">
                        <path fillRule="evenodd" d="M11.5 4.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM4.25 8.5a3.25 3.25 0 0 0-3.25 3.25v.5A1.75 1.75 0 0 0 2.75 14h10.5A1.75 1.75 0 0 0 15 12.25v-.5A3.25 3.25 0 0 0 11.75 8.5h-7.5Z" clipRule="evenodd" />
                      </svg>
                      Export report
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <p className="mb-3 text-[12px] font-semibold text-slate-300">Quick Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["deadline", "+ Add Deadline"],
                        ["revenue", "+ Log Revenue"],
                        ["ig", "+ Add IG Task"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setActiveModal(key)}
                        className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
                      >
                        {label}
                      </button>
                    ))}
                    <Link
                      href="/timeline"
                      className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
                    >
                      Log Attendance
                    </Link>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <p className="mb-2 text-[12px] font-semibold text-slate-300">Chapter</p>
                  <div className="space-y-1 text-[11px] text-slate-500">
                    <p>Lambda Phi Epsilon · Fall 2026</p>
                    <p>{brotherList.length} brothers · {deadlineList.length} deadlines · {partyList.length} parties</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Thresholds ── */}
            <Card className="overflow-hidden">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-semibold text-white">Thresholds</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Click any value to edit. Changes are saved locally and applied on next dashboard load.
                    </p>
                  </div>
                  {thresholdsDirty && (
                    <span className="mt-0.5 shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      Unsaved
                    </span>
                  )}
                </div>
              </div>

              <div className="px-5 py-4">
                {thresholdsLoaded ? (
                  <>
                    <ThresholdRow
                      label="Attendance — At Risk below"
                      field="attendanceAtRisk"
                      value={thresholds.attendanceAtRisk}
                      unit="%"
                      step={1}
                      min={0}
                      max={100}
                      onChange={updateThreshold}
                    />
                    <ThresholdRow
                      label="Attendance — Watch below"
                      field="attendanceWatch"
                      value={thresholds.attendanceWatch}
                      unit="%"
                      step={1}
                      min={0}
                      max={100}
                      onChange={updateThreshold}
                    />
                    <ThresholdRow
                      label="GPA — At Risk below"
                      field="gpaAtRisk"
                      value={thresholds.gpaAtRisk}
                      unit=""
                      step={0.1}
                      min={0}
                      max={4}
                      onChange={updateThreshold}
                    />
                    <ThresholdRow
                      label="GPA — Watch below"
                      field="gpaWatch"
                      value={thresholds.gpaWatch}
                      unit=""
                      step={0.1}
                      min={0}
                      max={4}
                      onChange={updateThreshold}
                    />
                    <ThresholdRow
                      label="Service Hours goal"
                      field="serviceHoursGoal"
                      value={thresholds.serviceHoursGoal}
                      unit="h"
                      step={1}
                      min={0}
                      max={200}
                      onChange={updateThreshold}
                    />

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={saveThresholds}
                        disabled={!thresholdsDirty}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-default transition-all"
                      >
                        Save thresholds
                      </button>
                      <button
                        onClick={resetThresholds}
                        className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-slate-400 hover:bg-white/[0.08] transition-colors"
                      >
                        Reset to defaults
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-4 text-center text-[11px] text-slate-600">Loading…</div>
                )}
              </div>
            </Card>

            {/* ── Semester Management ── */}
            <Card className="overflow-hidden">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <h2 className="text-[14px] font-semibold text-white">Semester Management</h2>
              </div>
              <div className="px-5 py-4">
                <SemesterSection
                  onOpenNew={() => {}}
                  onStatus={setStatusMsg}
                  onError={setPageError}
                />
              </div>
            </Card>

            {/* ── Auth Accounts ── */}
            <Card className="overflow-hidden">
              <div className="border-b border-white/[0.07] px-5 py-4">
                <h2 className="text-[14px] font-semibold text-white">Auth Accounts</h2>
              </div>
              <div className="px-5 py-4">
                <AuthAccountsSection
                  onStatus={setStatusMsg}
                  onError={setPageError}
                />
              </div>
            </Card>

          </div>
        </main>
      </div>

      {activeModal === "deadline" && (
        <Modal title="Add Deadline" onClose={() => setActiveModal(null)}>
          <AddDeadlineForm brotherNames={brotherNames} onSubmit={handleAddDeadline} />
        </Modal>
      )}
      {activeModal === "revenue" && (
        <Modal title="Log Revenue" onClose={() => setActiveModal(null)}>
          <AddRevenueForm onSubmit={handleAddRevenue} />
        </Modal>
      )}
      {activeModal === "ig" && (
        <Modal title="Add Instagram Task" onClose={() => setActiveModal(null)}>
          <AddIGTaskForm brotherNames={brotherNames} onSubmit={handleAddIGTask} />
        </Modal>
      )}
    </div>
  );
}
