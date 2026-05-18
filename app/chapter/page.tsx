"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sidebar } from "../components/Sidebar";
import { UserAvatar } from "../components/UserAvatar";
import { Modal, FieldLabel, ConfirmDialog } from "../components/dashboard/primitives";
import { inputCls } from "../components/dashboard/styles";
import { CalendarEvent, fmtDate } from "../data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try { const b = await res.json(); detail = typeof b?.error === "string" ? `: ${b.error}` : ""; } catch { /* ignore */ }
    throw new Error(`${url} returned ${res.status}${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sortedMeetings(events: CalendarEvent[]) {
  return [...events].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

// ─── MeetingForm (shared by add + edit modals) ────────────────────────────────

type MeetingDraft = { title: string; date: string; time: string; location: string };

function MeetingForm({
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  initial: MeetingDraft;
  submitLabel: string;
  onSubmit: (d: MeetingDraft) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<MeetingDraft>(initial);
  const set = (k: keyof MeetingDraft) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <form
      onSubmit={ev => { ev.preventDefault(); onSubmit(form); }}
      className="space-y-3"
    >
      <div>
        <FieldLabel>Title *</FieldLabel>
        <input required className={inputCls} value={form.title} onChange={set("title")} placeholder="Spring Chapter Meeting" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date *</FieldLabel>
          <input required type="date" className={inputCls} value={form.date} onChange={set("date")} />
        </div>
        <div>
          <FieldLabel>Time</FieldLabel>
          <input className={inputCls} value={form.time} onChange={set("time")} placeholder="7:00 PM" />
        </div>
      </div>
      <div>
        <FieldLabel>Location</FieldLabel>
        <input className={inputCls} value={form.location} onChange={set("location")} placeholder="Chapter Room" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/[0.08] px-4 py-1.5 text-[13px] text-slate-400 hover:border-white/[0.16] hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── SaveIndicator ────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  if (state === "saving") return (
    <span className="flex items-center gap-1 text-[11px] text-slate-500">
      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Saving…
    </span>
  );
  if (state === "saved") return (
    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Saved
    </span>
  );
  return <span className="text-[11px] text-red-400">Save failed</span>;
}

// ─── MeetingCard ──────────────────────────────────────────────────────────────

function MeetingCard({
  event,
  expanded,
  notesDraft,
  saveState,
  onToggle,
  onNotesChange,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  expanded: boolean;
  notesDraft: string;
  saveState: "idle" | "saving" | "saved" | "error";
  onToggle: () => void;
  onNotesChange: (val: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasNotes = !!(event.description ?? "").trim() || notesDraft.trim().length > 0;

  const meta = [
    fmtDate(event.date),
    event.time,
    event.location,
  ].filter(Boolean).join(" · ");

  return (
    <div className={`overflow-hidden rounded-xl border border-white/[0.07] bg-[#10121a] transition-colors ${expanded ? "border-white/[0.10]" : "hover:border-white/[0.10]"}`}>
      {/* Left emerald accent bar + header row */}
      <div className="flex">
        <div className="w-[3px] shrink-0 self-stretch bg-emerald-500 opacity-70" />
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 px-4 py-3.5 text-left"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-white">{event.title}</p>
            <p className="mt-0.5 text-[12px] text-slate-400">{meta}</p>
          </div>
          {!hasNotes && !expanded && (
            <span className="shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-600 ring-1 ring-inset ring-white/[0.06]">
              No notes
            </span>
          )}
          <svg
            className={`h-4 w-4 shrink-0 text-slate-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-5 pb-4 pt-3">
          <textarea
            rows={10}
            className={`${inputCls} resize-none font-mono text-[13px] leading-relaxed`}
            value={notesDraft}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Start typing meeting notes…"
          />
          <div className="mt-2 flex items-center justify-between">
            <SaveIndicator state={saveState} />
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-red-500/[0.08] hover:text-red-400"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChapterPage() {
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [events,        setEvents]        = useState<CalendarEvent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [pageError,     setPageError]     = useState<string | null>(null);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [notesDraft,    setNotesDraft]    = useState<Record<number, string>>({});
  const [saveState,     setSaveState]     = useState<Record<number, "idle" | "saving" | "saved" | "error">>({});
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [editTarget,    setEditTarget]    = useState<CalendarEvent | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<CalendarEvent | null>(null);

  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const savedValues = useRef<Record<number, string>>({});

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    requestJson<CalendarEvent[]>("/api/calendar")
      .then(all => {
        const meetings = all.filter(e => e.category === "chapter");
        setEvents(meetings);
        // seed savedValues so autosave can guard against no-op PATCHes
        meetings.forEach(e => { savedValues.current[e.id] = e.description ?? ""; });
      })
      .catch(() => setLoadError("Could not load meetings. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const flushSave = useCallback(async (id: number, value: string) => {
    if (value === savedValues.current[id]) return;
    clearTimeout(timers.current[id]);
    setSaveState(s => ({ ...s, [id]: "saving" }));
    try {
      await requestJson<CalendarEvent>(`/api/calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      savedValues.current[id] = value;
      setEvents(prev => prev.map(e => e.id === id ? { ...e, description: value } : e));
      setSaveState(s => ({ ...s, [id]: "saved" }));
      setTimeout(() => setSaveState(s => ({ ...s, [id]: "idle" })), 2000);
    } catch {
      setSaveState(s => ({ ...s, [id]: "error" }));
    }
  }, []);

  function handleNotesChange(id: number, value: string) {
    setNotesDraft(d => ({ ...d, [id]: value }));
    setSaveState(s => ({ ...s, [id]: "saving" }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => flushSave(id, value), 600);
  }

  // ── Accordion toggle ─────────────────────────────────────────────────────────
  function handleToggle(id: number) {
    // Flush pending save on the currently expanded card before switching
    if (expandedId !== null && expandedId !== id) {
      const pending = notesDraft[expandedId];
      if (pending !== undefined) {
        clearTimeout(timers.current[expandedId]);
        flushSave(expandedId, pending);
      }
    }
    setExpandedId(prev => prev === id ? null : id);
  }

  // ── Add meeting ───────────────────────────────────────────────────────────────
  async function handleAdd(draft: MeetingDraft) {
    setPageError(null);
    try {
      const created = await requestJson<CalendarEvent>("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          date: draft.date,
          time: draft.time.trim() || null,
          location: draft.location.trim() || null,
          category: "chapter",
          mandatory: true,
          description: "",
        }),
      });
      savedValues.current[created.id] = "";
      setEvents(prev => [created, ...prev]);
      setShowAddModal(false);
      setExpandedId(created.id);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to create meeting.");
    }
  }

  // ── Edit metadata ─────────────────────────────────────────────────────────────
  async function handleEdit(draft: MeetingDraft) {
    if (!editTarget) return;
    const id = editTarget.id;
    setPageError(null);
    try {
      const updated = await requestJson<CalendarEvent>(`/api/calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          date: draft.date,
          time: draft.time.trim() || null,
          location: draft.location.trim() || null,
        }),
      });
      setEvents(prev => prev.map(e => e.id === id ? { ...updated, description: e.description } : e));
      setEditTarget(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to update meeting.");
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setDeleteError(null);
    try {
      await requestJson<void>(`/api/calendar/${id}`, { method: "DELETE" });
      setEvents(prev => prev.filter(e => e.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      const msg = err instanceof Error && err.message.includes("409")
        ? "This meeting has attendance records and cannot be deleted."
        : "Failed to delete meeting.";
      setDeleteError(msg);
    }
  }

  const sorted = sortedMeetings(events);

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Chapter"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Chapter</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">
              {loading ? "Loading…" : `${events.length} meeting${events.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Meeting
          </button>

          <UserAvatar />
        </header>

        {/* ── Error banners ───────────────────────────────────────────────────── */}
        {pageError && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-5 py-2.5">
            <p className="text-[12px] text-amber-400">{pageError}</p>
            <button onClick={() => setPageError(null)} className="text-amber-500 hover:text-amber-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {deleteError && (
          <div className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/10 px-5 py-2.5">
            <p className="text-[12px] text-red-400">{deleteError}</p>
            <button onClick={() => setDeleteError(null)} className="text-red-500 hover:text-red-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Main ────────────────────────────────────────────────────────────── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-24">
                <svg className="h-8 w-8 animate-spin text-slate-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}

            {/* Load error */}
            {!loading && loadError && (
              <div className="flex flex-col items-center gap-2 py-24 text-center">
                <p className="text-[14px] text-red-400">{loadError}</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && !loadError && sorted.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-slate-500">No chapter meetings yet</p>
                <p className="text-[12px] text-slate-600">Add a meeting to start keeping notes.</p>
              </div>
            )}

            {/* Meeting cards */}
            {!loading && !loadError && sorted.length > 0 && (
              <div className="space-y-2">
                {sorted.map(event => (
                  <MeetingCard
                    key={event.id}
                    event={event}
                    expanded={expandedId === event.id}
                    notesDraft={notesDraft[event.id] ?? (event.description ?? "")}
                    saveState={saveState[event.id] ?? "idle"}
                    onToggle={() => handleToggle(event.id)}
                    onNotesChange={val => handleNotesChange(event.id, val)}
                    onEdit={() => setEditTarget(event)}
                    onDelete={() => setDeleteTarget(event)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add modal */}
      {showAddModal && (
        <Modal title="Add Meeting" onClose={() => setShowAddModal(false)}>
          <MeetingForm
            initial={{ title: "", date: todayStr(), time: "", location: "" }}
            submitLabel="Add Meeting"
            onSubmit={handleAdd}
            onClose={() => setShowAddModal(false)}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title="Edit Meeting" onClose={() => setEditTarget(null)}>
          <MeetingForm
            initial={{
              title: editTarget.title,
              date: editTarget.date,
              time: editTarget.time ?? "",
              location: editTarget.location ?? "",
            }}
            submitLabel="Save Changes"
            onSubmit={handleEdit}
            onClose={() => setEditTarget(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Meeting"
          message={
            <>
              Delete <span className="font-semibold text-white">&ldquo;{deleteTarget.title}&rdquo;</span>?
              {" "}This will permanently remove the meeting and its notes.
              If attendance was recorded for this event, deletion will be blocked.
            </>
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
