"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Sidebar } from "../components/Sidebar";
import { UserAvatar } from "../components/UserAvatar";
import { Modal, FieldLabel, ConfirmDialog, SaveIndicator, LoadingSpinner } from "../components/dashboard/primitives";
import { useToast } from "../components/dashboard/Toast";
import { headerActionBtnCls, inputCls } from "../components/dashboard/styles";
import { CalendarEvent, fmtDate } from "../data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HttpError = Error & { status: number };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try { const b = await res.json(); detail = typeof b?.error === "string" ? `: ${b.error}` : ""; } catch { /* ignore */ }
    const err = new Error(`${url} returned ${res.status}${detail}`) as HttpError;
    err.status = res.status;
    throw err;
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

function fmtDateFull(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
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

// ─── MeetingCard (click to open detail overlay) ───────────────────────────────

function MeetingCard({
  event,
  isSelected,
  onOpen,
}: {
  event: CalendarEvent;
  isSelected: boolean;
  onOpen: () => void;
}) {
  const notes = (event.description ?? "").trim();
  const hasNotes = !!notes;
  const summary = (event.notesSummary ?? "").trim();
  // Prefer the AI summary on the card; fall back to the first non-empty lines
  // of the raw notes so meetings without a summary still show something useful.
  const previewSource = summary || notes;
  const previewLines = previewSource.split("\n").filter((l: string) => l.trim()).slice(0, 3);
  const sub = [event.time, event.location].filter(Boolean).join(" · ");
  const wordCount = notes ? notes.split(/\s+/).filter(Boolean).length : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`card-premium flex w-full flex-col rounded-xl border bg-[#10121a] p-5 text-left transition-all duration-200 group ${
        isSelected
          ? "border-indigo-500/40 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
          : "border-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      {/* Icon + title + date */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
          <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">{event.title}</p>
          <p className="mt-0.5 text-[22px] font-bold leading-none tracking-tight text-white">{fmtDate(event.date)}</p>
          <p className="mt-1 truncate text-[11px] leading-snug text-slate-400">{sub || " "}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-white/[0.05]" />

      {/* Notes preview — up to 3 lines (summary if available, else raw notes) */}
      <div className="min-h-[52px] flex-1 space-y-1">
        {hasNotes ? (
          <>
            {summary && (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-300 ring-1 ring-inset ring-indigo-500/20">
                AI summary
              </span>
            )}
            {previewLines.map((line: string, i: number) => (
              <p key={i} className="truncate text-[12px] leading-snug text-slate-400">{line.replace(/^[-*]\s*/, "").replace(/\*\*/g, "")}</p>
            ))}
          </>
        ) : (
          <p className="text-[12px] italic text-slate-600">No notes yet</p>
        )}
      </div>

      {/* Footer: word count + open hint */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          {hasNotes ? `${wordCount} word${wordCount !== 1 ? "s" : ""}` : "Empty"}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="text-[10px] text-slate-500">Open</span>
          <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
}

// ─── SummaryMarkdown ──────────────────────────────────────────────────────────
// Tiny renderer for the AI's output: **bold**, lines starting with "- " become
// bullets, and bare bold-only lines render as section headers. No deps; we
// fully control the upstream prompt, so the dialect is intentionally narrow.

function renderInline(text: string, keyPrefix: string) {
  // Split on **...** spans, keeping the delimiters; toggle bold on each match.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function SummaryMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-5 list-disc space-y-1">
        {bullets.map((b, i) => <li key={i}>{renderInline(b, `b-${blocks.length}-${i}`)}</li>)}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flushBullets(); return; }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) { bullets.push(bullet[1]); return; }
    flushBullets();
    // Bold-only line → section header.
    const header = line.match(/^\*\*([^*]+)\*\*:?\s*$/);
    if (header) {
      blocks.push(
        <p key={`h-${i}`} className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-200 first:mt-0">
          {header[1]}
        </p>,
      );
      return;
    }
    blocks.push(<p key={`p-${i}`} className="leading-relaxed">{renderInline(line, `p-${i}`)}</p>);
  });
  flushBullets();
  return <div className="space-y-2 text-[13px] text-slate-200">{blocks}</div>;
}

// ─── MeetingDetailOverlay ─────────────────────────────────────────────────────

function MeetingDetailOverlay({
  event,
  notesDraft,
  saveState,
  summarizeState,
  summarizeError,
  onClose,
  onNotesChange,
  onEdit,
  onDelete,
  onSummarize,
}: {
  event: CalendarEvent;
  notesDraft: string;
  saveState: "idle" | "saving" | "saved" | "error";
  summarizeState: "idle" | "running" | "error";
  summarizeError: string | null;
  onClose: () => void;
  onNotesChange: (val: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSummarize: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const meta = [event.time, event.location].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Panel — stop propagation so clicks inside don't close */}
      <div className="relative flex w-full max-w-5xl flex-col bg-[#07090f]" onClick={e => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#07090f] px-4 sm:px-6">
          {/* Back button */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Title + dot */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
            <p className="truncate text-[14px] font-semibold text-white">{event.title}</p>
          </div>

          {/* Save indicator */}
          <SaveIndicator state={saveState} />

          {/* Summarize / Edit / Delete */}
          <div className="flex items-center gap-1">
            <button
              onClick={onSummarize}
              disabled={summarizeState === "running" || !notesDraft.trim()}
              title={!notesDraft.trim() ? "Add notes first" : "Generate an AI summary of these notes"}
              aria-label={event.notesSummary ? "Re-summarize notes" : "Summarize notes"}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-indigo-300 transition-colors hover:bg-indigo-500/[0.08] hover:text-indigo-200 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent sm:py-1.5"
            >
              {summarizeState === "running" ? (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                  <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
                </svg>
              )}
              <span className="hidden sm:inline">{event.notesSummary ? "Re-summarize" : "Summarize"}</span>
            </button>
            <button
              onClick={onEdit}
              aria-label="Edit meeting"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 sm:py-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete meeting"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-slate-500 transition-colors hover:bg-red-500/[0.08] hover:text-red-400 sm:py-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>

        {/* ── Meta strip ──────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/[0.05] bg-white/[0.015] px-6 py-3">
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <svg className="h-3.5 w-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {fmtDateFull(event.date)}
          </div>
          {meta.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-slate-400">
              <div className="h-3 w-px bg-white/[0.08]" />
              {item}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="h-3 w-px bg-white/[0.08]" />
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
              Required
            </span>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">

            {/* AI summary (when present) */}
            {event.notesSummary && (() => {
              const summaryAt = event.notesSummaryAt ? new Date(event.notesSummaryAt).getTime() : 0;
              const updatedAt = event.notesUpdatedAt ? new Date(event.notesUpdatedAt).getTime() : 0;
              // 2s grace window: server timestamps the description update and
              // the summary creation in the same request, and Postgres rounding
              // can put them microseconds apart in either order.
              const stale = summaryAt > 0 && updatedAt > summaryAt + 2000;
              return (
                <div className={`mb-8 rounded-xl border p-4 ${stale ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-indigo-500/20 bg-indigo-500/[0.04]"}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${stale ? "bg-amber-500/15 text-amber-200 ring-amber-500/25" : "bg-indigo-500/15 text-indigo-200 ring-indigo-500/25"}`}>
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                      </svg>
                      AI Summary
                    </span>
                    {event.notesSummaryAt && (
                      <span className="text-[10px] text-slate-500">
                        Generated {new Date(event.notesSummaryAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                    {stale && (
                      <span className="text-[10px] font-medium text-amber-300">
                        Notes have changed — re-summarize to refresh.
                      </span>
                    )}
                  </div>
                  <SummaryMarkdown text={event.notesSummary} />
                </div>
              );
            })()}

            {summarizeError && (
              <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                {summarizeError}
              </div>
            )}

            {/* Notes section */}
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Meeting Notes</p>
              <textarea
                className={`${inputCls} min-h-[55vh] resize-none font-mono text-[13px] leading-relaxed`}
                value={notesDraft}
                onChange={e => onNotesChange(e.target.value)}
                placeholder="Start typing meeting notes…"
                autoFocus
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChapterPage() {
  const toast = useToast();
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [events,        setEvents]        = useState<CalendarEvent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [pageError,     setPageError]     = useState<string | null>(null);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);
  const [selectedId,    setSelectedId]    = useState<number | null>(null);
  const [notesDraft,    setNotesDraft]    = useState<Record<number, string>>({});
  const [saveState,     setSaveState]     = useState<Record<number, "idle" | "saving" | "saved" | "error">>({});
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [editTarget,    setEditTarget]    = useState<CalendarEvent | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<CalendarEvent | null>(null);
  const [summarizeState, setSummarizeState] = useState<Record<number, "idle" | "running" | "error">>({});
  const [summarizeError, setSummarizeError] = useState<Record<number, string | null>>({});

  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const saveResetTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const savedValues = useRef<Record<number, string>>({});

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    requestJson<CalendarEvent[]>("/api/calendar?category=chapter")
      .then(meetings => {
        setEvents(meetings);
        meetings.forEach(e => { savedValues.current[e.id] = e.description ?? ""; });
      })
      .catch(() => setLoadError("Could not load meetings. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  // ── Cleanup pending timers on unmount ────────────────────────────────────────
  useEffect(() => {
    const t = timers.current;
    const sr = saveResetTimers.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      Object.values(sr).forEach(clearTimeout);
    };
  }, []);

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const flushSave = useCallback(async (id: number, value: string) => {
    if (value === savedValues.current[id]) return;
    clearTimeout(timers.current[id]);
    setSaveState(s => ({ ...s, [id]: "saving" }));
    try {
      const updated = await requestJson<CalendarEvent>(`/api/calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: value }),
      });
      savedValues.current[id] = value;
      // Merge the server-bumped notesUpdatedAt into local state so the stale-summary
      // indicator can compare it against notesSummaryAt.
      setEvents(prev => prev.map(e => e.id === id ? { ...e, description: value, notesUpdatedAt: updated.notesUpdatedAt ?? e.notesUpdatedAt } : e));
      setSaveState(s => ({ ...s, [id]: "saved" }));
      clearTimeout(saveResetTimers.current[id]);
      saveResetTimers.current[id] = setTimeout(() => setSaveState(s => ({ ...s, [id]: "idle" })), 2000);
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

  // ── Open / close overlay ──────────────────────────────────────────────────────
  function handleOpen(id: number) {
    if (selectedId !== null && selectedId !== id) {
      const pending = notesDraft[selectedId];
      if (pending !== undefined) {
        clearTimeout(timers.current[selectedId]);
        flushSave(selectedId, pending);
      }
    }
    setSelectedId(id);
  }

  function handleClose() {
    if (selectedId !== null) {
      const pending = notesDraft[selectedId];
      if (pending !== undefined) {
        clearTimeout(timers.current[selectedId]);
        flushSave(selectedId, pending);
      }
    }
    setSelectedId(null);
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
      setSelectedId(created.id);
      toast.success(`Meeting "${created.title}" added.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create meeting.";
      setPageError(message);
      toast.error(message);
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
      toast.success("Meeting updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update meeting.";
      setPageError(message);
      toast.error(message);
    }
  }

  // ── Summarize notes via AI ───────────────────────────────────────────────────
  async function handleSummarize(id: number) {
    // Flush any pending autosave first so the server summarizes the user's
    // latest text, not the previously saved version.
    const pending = notesDraft[id];
    if (pending !== undefined && pending !== savedValues.current[id]) {
      clearTimeout(timers.current[id]);
      await flushSave(id, pending);
    }
    setSummarizeError(s => ({ ...s, [id]: null }));
    setSummarizeState(s => ({ ...s, [id]: "running" }));
    try {
      const res = await requestJson<{ id: number; notesSummary: string | null; notesSummaryAt: string | null }>(
        "/api/ai/summarize-meeting",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        },
      );
      setEvents(prev => prev.map(e => e.id === id ? { ...e, notesSummary: res.notesSummary, notesSummaryAt: res.notesSummaryAt } : e));
      setSummarizeState(s => ({ ...s, [id]: "idle" }));
      toast.success("Summary generated.");
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to summarize.";
      setSummarizeState(s => ({ ...s, [id]: "error" }));
      setSummarizeError(s => ({ ...s, [id]: message }));
      toast.error(message);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const titleAtDelete = deleteTarget.title;
    setDeleteTarget(null);
    setDeleteError(null);
    try {
      await requestJson<void>(`/api/calendar/${id}`, { method: "DELETE" });
      setEvents(prev => prev.filter(e => e.id !== id));
      if (selectedId === id) setSelectedId(null);
      setNotesDraft(d => { const c = { ...d }; delete c[id]; return c; });
      setSaveState(s => { const c = { ...s }; delete c[id]; return c; });
      clearTimeout(timers.current[id]);
      clearTimeout(saveResetTimers.current[id]);
      delete timers.current[id];
      delete saveResetTimers.current[id];
      delete savedValues.current[id];
      toast.success(`Meeting "${titleAtDelete}" deleted.`);
    } catch (err) {
      const is409 = err instanceof Error && (err as HttpError).status === 409;
      const message = is409
        ? "This meeting has attendance records and cannot be deleted."
        : "Failed to delete meeting.";
      setDeleteError(message);
      toast.error(message);
    }
  }

  const sorted = useMemo(() => sortedMeetings(events), [events]);
  const selectedEvent = selectedId !== null ? events.find(e => e.id === selectedId) ?? null : null;

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
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Lambda Phi Epsilon · Chapter Meetings</p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className={headerActionBtnCls}
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Add Meeting</span>
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
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">

            {/* Loading */}
            {loading && <LoadingSpinner size="md" label="Loading meetings" className="py-24" />}

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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map(event => (
                  <MeetingCard
                    key={event.id}
                    event={event}
                    isSelected={selectedId === event.id}
                    onOpen={() => handleOpen(event.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Full-screen meeting detail overlay ─────────────────────────────────── */}
      {selectedEvent && (
        <MeetingDetailOverlay
          event={selectedEvent}
          notesDraft={notesDraft[selectedEvent.id] ?? (selectedEvent.description ?? "")}
          saveState={saveState[selectedEvent.id] ?? "idle"}
          summarizeState={summarizeState[selectedEvent.id] ?? "idle"}
          summarizeError={summarizeError[selectedEvent.id] ?? null}
          onClose={handleClose}
          onNotesChange={val => handleNotesChange(selectedEvent.id, val)}
          onEdit={() => setEditTarget(selectedEvent)}
          onDelete={() => setDeleteTarget(selectedEvent)}
          onSummarize={() => handleSummarize(selectedEvent.id)}
        />
      )}

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
