"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal, FieldLabel, ConfirmDialog, SaveIndicator, LoadingSpinner } from "../../components/dashboard/primitives";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { useVocab } from "../../hooks/useVocab";
import { inputDuskCls } from "../../components/dashboard/styles";
import { CalendarEvent, fmtDate } from "../../data";
import { orgFetch } from "../../lib/api";
import { daysFromToday, todayStr } from "../../lib/dates";
import "../../components/dashboard/dashboard-ledger.css";
import "../../components/dashboard/meetings-ledger.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HttpError = Error & { status: number };

// Local wrapper kept (instead of lib/api's requestJson) because callers need
// err.status for the 409 attendance-conflict message. Routed through orgFetch
// so requests carry the x-org-slug header.
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await orgFetch(url, init);
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

function sortedMeetings(events: CalendarEvent[]) {
  return [...events].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function fmtDateFull(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

// Date parts for the ledger date column ("Tue / 9 / Jun").
function dateParts(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { dow: dows[dt.getDay()], dnum: d, mon: months[m - 1] };
}

// Relative "In N days / Today / Tomorrow" label from a yyyy-mm-dd string.
function relativeWhen(dateStr: string) {
  const diff = daysFromToday(dateStr);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `In ${diff} days`;
  if (diff === -1) return "Yesterday";
  return `${Math.abs(diff)} days ago`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
}

// One-line preview of a meeting's notes / AI summary for the ledger row.
function notesPreview(event: CalendarEvent): string {
  const summary = (event.notesSummary ?? "").trim();
  const notes = (event.description ?? "").trim();
  const source = summary || notes;
  if (!source) return "";
  return source
    .split("\n")
    .map(l => l.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .join(" · ");
}

// ─── Attendance (roll-call) types ─────────────────────────────────────────────
// Shape returned by GET /api/attendance/[eventId] — same as the timeline page.

type AttendanceDetail = {
  excused:   { brotherId: number; brotherName: string; reason: string; isRetroactive: boolean }[];
  unexcused: { brotherId: number; brotherName: string }[];
  attended:  { brotherId: number; brotherName: string }[];
};

// Per-event present/eligible counts from GET /api/attendance/summary.
type AttendanceSummaryRow = { calendarEventId: number; present: number; eligible: number };

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
        <FieldLabel tone="dusk">Title *</FieldLabel>
        <input required className={inputDuskCls} value={form.title} onChange={set("title")} placeholder="Spring Chapter Meeting" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel tone="dusk">Date *</FieldLabel>
          <input required type="date" className={inputDuskCls} value={form.date} onChange={set("date")} />
        </div>
        <div>
          <FieldLabel tone="dusk">Time</FieldLabel>
          <input className={inputDuskCls} value={form.time} onChange={set("time")} placeholder="7:00 PM" />
        </div>
      </div>
      <div>
        <FieldLabel tone="dusk">Location</FieldLabel>
        <input className={inputDuskCls} value={form.location} onChange={set("location")} placeholder="Chapter Room" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[rgba(236,231,221,0.12)] px-4 py-1.5 text-[13px] text-[#958d7c] hover:border-[rgba(236,231,221,0.24)] hover:text-[#ece7dd] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[#7c3aed] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#6d28d9] transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── SummaryMarkdown ──────────────────────────────────────────────────────────
// Tiny renderer for the AI's output: **bold**, lines starting with "- " become
// bullets, and bare bold-only lines render as section headers. No deps; we
// fully control the upstream prompt, so the dialect is intentionally narrow.

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`} className="font-semibold text-[#ece7dd]">{part.slice(2, -2)}</strong>;
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
    const header = line.match(/^\*\*([^*]+)\*\*:?\s*$/);
    if (header) {
      blocks.push(
        <p key={`h-${i}`} className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[#a78bfa] first:mt-0">
          {header[1]}
        </p>,
      );
      return;
    }
    blocks.push(<p key={`p-${i}`} className="leading-relaxed">{renderInline(line, `p-${i}`)}</p>);
  });
  flushBullets();
  return <div className="space-y-2 text-[13px] text-[#c9c2b4]">{blocks}</div>;
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
    <div className="dash fixed inset-0 z-50 flex items-stretch justify-center" style={{ maxWidth: "none", margin: 0, padding: 0 }} onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Panel — stop propagation so clicks inside don't close */}
      <div className="relative flex w-full max-w-5xl flex-col bg-[#0f0d0a]" onClick={e => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(236,231,221,0.08)] bg-[#0f0d0a] px-4 sm:px-6">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-[#958d7c] transition-colors hover:bg-[rgba(236,231,221,0.06)] hover:text-[#ece7dd]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="h-4 w-px bg-[rgba(236,231,221,0.1)]" />

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#a78bfa]" />
            <p className="truncate text-[14px] font-semibold text-[#ece7dd]">{event.title}</p>
          </div>

          <SaveIndicator state={saveState} tone="dusk" />

          <div className="flex items-center gap-1">
            <button
              onClick={onSummarize}
              disabled={summarizeState === "running" || !notesDraft.trim()}
              title={!notesDraft.trim() ? "Add notes first" : "Generate an AI summary of these notes"}
              aria-label={event.notesSummary ? "Re-summarize notes" : "Summarize notes"}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-[#a78bfa] transition-colors hover:bg-[rgba(167,139,250,0.1)] hover:text-[#c4b5fd] disabled:cursor-not-allowed disabled:text-[#6b6354] disabled:hover:bg-transparent sm:py-1.5"
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
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-[#958d7c] transition-colors hover:bg-[rgba(236,231,221,0.06)] hover:text-[#c9c2b4] sm:py-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete meeting"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-[#958d7c] transition-colors hover:bg-[rgba(217,139,163,0.1)] hover:text-[#d98ba3] sm:py-1.5"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>

        {/* ── Meta strip ──────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[rgba(236,231,221,0.05)] bg-[rgba(236,231,221,0.02)] px-6 py-3">
          <div className="flex items-center gap-2 text-[12px] text-[#958d7c]">
            <svg className="h-3.5 w-3.5 text-[#6b6354]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {fmtDateFull(event.date)}
          </div>
          {meta.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-[#958d7c]">
              <div className="h-3 w-px bg-[rgba(236,231,221,0.1)]" />
              {item}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="h-3 w-px bg-[rgba(236,231,221,0.1)]" />
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(167,139,250,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[#a78bfa] ring-1 ring-inset ring-[rgba(167,139,250,0.2)]">
              Required
            </span>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">

            {event.notesSummary && (() => {
              const summaryAt = event.notesSummaryAt ? new Date(event.notesSummaryAt).getTime() : 0;
              const updatedAt = event.notesUpdatedAt ? new Date(event.notesUpdatedAt).getTime() : 0;
              const stale = summaryAt > 0 && updatedAt > summaryAt + 2000;
              return (
                <div className={`mb-8 rounded-xl border p-4 ${stale ? "border-[rgba(221,179,106,0.3)] bg-[rgba(221,179,106,0.04)]" : "border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.04)]"}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${stale ? "bg-[rgba(221,179,106,0.15)] text-[#ddb36a] ring-[rgba(221,179,106,0.25)]" : "bg-[rgba(167,139,250,0.15)] text-[#a78bfa] ring-[rgba(167,139,250,0.25)]"}`}>
                      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                      </svg>
                      AI Summary
                    </span>
                    {event.notesSummaryAt && (
                      <span className="text-[10px] text-[#6b6354]">
                        Generated {new Date(event.notesSummaryAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                    {stale && (
                      <span className="text-[10px] font-medium text-[#ddb36a]">
                        Notes have changed — re-summarize to refresh.
                      </span>
                    )}
                  </div>
                  <SummaryMarkdown text={event.notesSummary} />
                </div>
              );
            })()}

            {summarizeError && (
              <div className="mb-6 rounded-lg border border-[rgba(217,139,163,0.2)] bg-[rgba(217,139,163,0.1)] px-3 py-2 text-[12px] text-[#d98ba3]">
                {summarizeError}
              </div>
            )}

            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#958d7c]">Meeting Minutes</p>
              <textarea
                className={`${inputDuskCls} min-h-[55vh] resize-none font-mono text-[13px] leading-relaxed`}
                value={notesDraft}
                onChange={e => onNotesChange(e.target.value)}
                placeholder="Start typing meeting minutes…"
                autoFocus
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RollCallPanel (rail) ─────────────────────────────────────────────────────
// Inline roll-call for the next meeting. Loads the event's AttendanceDetail and,
// for MANAGE_ATTENDANCE holders, lets you toggle each brother Present/Excused and
// save via POST /api/attendance. Read-only (counts only) for everyone else.
// The fetch + eligible-compute + POST flow mirrors app/[slug]/timeline/page.tsx.

function RollCallPanel({
  event,
  brotherList,
  canManage,
  onSaved,
}: {
  event: CalendarEvent | null;
  brotherList: { id: number; name: string }[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [detail, setDetail]   = useState<AttendanceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  // Local present set while marking (only used by managers).
  const [present, setPresent] = useState<Set<number>>(new Set());
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [query, setQuery]     = useState("");

  useEffect(() => {
    if (!event || !event.mandatory) { setDetail(null); return; }
    const controller = new AbortController();
    setDetail(null);
    setDirty(false);
    setError(null);
    setQuery("");
    setLoading(true);
    fetch(`/api/attendance/${event.id}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: AttendanceDetail) => {
        setDetail(data);
        setPresent(new Set(data.attended.map(a => a.brotherId)));
      })
      .catch(err => { if (err.name !== "AbortError") console.error("Failed to load attendance", err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [event]);

  const excusedIds = useMemo(() => new Set((detail?.excused ?? []).map(e => e.brotherId)), [detail]);
  const eligible = useMemo(() => brotherList.filter(b => !excusedIds.has(b.id)), [brotherList, excusedIds]);

  function statusOf(id: number): "present" | "excused" | "pending" {
    if (excusedIds.has(id)) return "excused";
    if (present.has(id)) return "present";
    return "pending";
  }

  function toggle(id: number) {
    if (!canManage || excusedIds.has(id)) return;
    setPresent(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setDirty(true);
  }

  // Bulk mark operates on eligible (non-excused) brothers only. Excused stay out
  // of the present set regardless — they're dropped from the attendance math.
  function markAll(value: boolean) {
    if (!canManage) return;
    setPresent(value ? new Set(eligible.map(b => b.id)) : new Set());
    setDirty(true);
  }

  async function save() {
    if (!event || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarEventId: event.id, attendedIds: Array.from(present) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(typeof err?.error === "string" ? err.error : "Could not save attendance.");
        return;
      }
      const updated = await requestJson<AttendanceDetail>(`/api/attendance/${event.id}`);
      setDetail(updated);
      setPresent(new Set(updated.attended.map(a => a.brotherId)));
      setDirty(false);
      onSaved();
    } catch {
      setError("Could not save attendance.");
    } finally {
      setSaving(false);
    }
  }

  if (!event) return null;

  const presentCount = present.size;
  const eligibleCount = eligible.length;
  // Roster source is brotherList; if it hasn't hydrated yet, fall back to detail.
  const roster = brotherList.length > 0
    ? brotherList
    : [...(detail?.attended ?? []), ...(detail?.unexcused ?? []), ...(detail?.excused ?? [])]
        .map(b => ({ id: b.brotherId, name: b.brotherName }));
  const q = query.trim().toLowerCase();
  const visible = q ? roster.filter(b => b.name.toLowerCase().includes(q)) : roster;

  return (
    <div className="roster">
      <div className="r-head">
        <span className="h">Roll call</span>
        <span className="c">{loading ? "…" : `${presentCount} / ${eligibleCount} present`}</span>
      </div>

      {canManage && !loading && roster.length > 0 && (
        <div className="r-tools">
          {roster.length > 6 && (
            <input
              type="text"
              className="r-search"
              placeholder="Search brothers…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          )}
          <div className="r-bulk">
            <button type="button" onClick={() => markAll(true)}>Mark all present</button>
            <button type="button" onClick={() => markAll(false)}>Clear all</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="r-locked">Loading attendance…</div>
      ) : roster.length === 0 ? (
        <div className="r-locked">No brothers on the roster yet.</div>
      ) : visible.length === 0 ? (
        <div className="r-locked">No brothers match “{query}”.</div>
      ) : (
        <div className="r-list">
          {visible.map(b => {
            const st = statusOf(b.id);
            return (
              <button
                key={b.id}
                type="button"
                className={`rmember${canManage && !excusedIds.has(b.id) ? " clickable" : ""}`}
                onClick={() => toggle(b.id)}
                disabled={!canManage || excusedIds.has(b.id)}
              >
                <span className="av">{initials(b.name)}</span>
                <span className="nm">{b.name}</span>
                <span className={`st ${st}`}>{st === "pending" ? "Pending" : st === "present" ? "Present" : "Excused"}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="r-locked" style={{ color: "var(--rose)", fontStyle: "normal", fontFamily: "var(--sans)" }}>{error}</div>}

      <div className="r-foot">
        {canManage ? (
          <button type="button" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save attendance" : "Saved"}
          </button>
        ) : (
          <span className="r-locked" style={{ padding: 0 }}>Read-only · ask an officer to take roll</span>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChapterPage() {
  const toast = useToast();
  const { currentUser, can, brotherList } = useChapter();
  const v = useVocab();
  const canAttendance = can("MANAGE_ATTENDANCE");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [events,        setEvents]        = useState<CalendarEvent[]>([]);
  const [summary,       setSummary]       = useState<Record<number, AttendanceSummaryRow>>({});
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

  // ── Fetch meetings + attendance summary ──────────────────────────────────────
  const loadSummary = useCallback(() => {
    requestJson<AttendanceSummaryRow[]>("/api/attendance/summary?category=chapter")
      .then(rows => {
        const map: Record<number, AttendanceSummaryRow> = {};
        rows.forEach(r => { map[r.calendarEventId] = r; });
        setSummary(map);
      })
      .catch(() => { /* counts are non-critical; ledger renders without them */ });
  }, []);

  useEffect(() => {
    requestJson<CalendarEvent[]>("/api/calendar?category=chapter")
      .then(meetings => {
        setEvents(meetings);
        meetings.forEach(e => { savedValues.current[e.id] = e.description ?? ""; });
      })
      .catch(() => setLoadError("Could not load meetings. Please refresh."))
      .finally(() => setLoading(false));
    loadSummary();
  }, [loadSummary]);

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

  // Next meeting = earliest chapter event on/after today; else the most recent.
  const today = todayStr();
  const { nextMeeting, pastMeetings } = useMemo(() => {
    const upcoming = sorted.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const next = upcoming[0] ?? null;
    const past = sorted.filter(e => e.id !== next?.id);
    return { nextMeeting: next, pastMeetings: past };
  }, [sorted, today]);

  const meetingsHeld = events.length;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Chapter"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Top bar (mobile/tablet only — hidden at lg+ where the sidebar is
            static and "Add meeting" lives in the briefing below). ─────────────── */}
        <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(236,231,221,0.06)] bg-[#14120e] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#958d7c] hover:bg-[rgba(236,231,221,0.07)] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-[#ece7dd]">{v("Meetings")}</p>
          </div>
        </header>

        {/* ── Error banners ───────────────────────────────────────────────────── */}
        {pageError && (
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(221,179,106,0.2)] bg-[rgba(221,179,106,0.1)] px-5 py-2.5">
            <p className="text-[12px] text-[#ddb36a]">{pageError}</p>
            <button onClick={() => setPageError(null)} className="text-[#ddb36a] hover:text-[#f0d9a8]" aria-label="Dismiss">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {deleteError && (
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(217,139,163,0.2)] bg-[rgba(217,139,163,0.1)] px-5 py-2.5">
            <p className="text-[12px] text-[#d98ba3]">{deleteError}</p>
            <button onClick={() => setDeleteError(null)} className="text-[#d98ba3] hover:text-[#e8b0c2]" aria-label="Dismiss">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Main ────────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-[#0f0d0a]">
          <div className="dash" data-dashboard-theme="dusk">

            {/* Briefing */}
            <div className="briefing">
              <div>
                <p className="kicker">
                  <span className="today">{fmtDateFull(today)}</span>&ensp;·&ensp;Chapter Meetings
                </p>
                <h1 className="greeting">The <em>minutes</em>.</h1>
                <div className="digest">
                  <span className="ai-chip">AI</span>
                  <p>
                    {nextMeeting
                      ? `Next meeting ${relativeWhen(nextMeeting.date).toLowerCase()} — ${fmtDate(nextMeeting.date)}${nextMeeting.time ? ` at ${nextMeeting.time}` : ""}${nextMeeting.location ? ` in ${nextMeeting.location}` : ""}. ${meetingsHeld} meeting${meetingsHeld === 1 ? "" : "s"} on the books this term.`
                      : `No upcoming meetings scheduled. ${meetingsHeld} meeting${meetingsHeld === 1 ? "" : "s"} on the books this term.`}
                  </p>
                </div>
              </div>
              <button className="mt-add-btn" onClick={() => setShowAddModal(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Add meeting
              </button>
            </div>

            {loading && <LoadingSpinner size="md" label="Loading meetings" className="py-24" tone="dusk" />}

            {!loading && loadError && (
              <div className="flex flex-col items-center gap-2 py-24 text-center">
                <p className="text-[14px] text-[#d98ba3]">{loadError}</p>
              </div>
            )}

            {!loading && !loadError && (
              <>
                {/* ── On deck ───────────────────────────────────────────────── */}
                <div className="sec-label">
                  <h2>On deck</h2>
                  <span className="rule" />
                  <span className="cnt">{nextMeeting ? relativeWhen(nextMeeting.date) : "Nothing scheduled"}</span>
                </div>

                <div className="mt-layout">
                  {/* LEFT */}
                  <div>
                    {nextMeeting ? (
                      <OnDeckHero
                        event={nextMeeting}
                        summary={summary[nextMeeting.id]}
                        canManage={canAttendance}
                        onTakeRoll={() => handleOpen(nextMeeting.id)}
                        onOpen={() => handleOpen(nextMeeting.id)}
                      />
                    ) : (
                      <div className="ondeck empty">
                        <p>No upcoming chapter meeting. Add one to start a fresh agenda.</p>
                        <div className="actions" style={{ marginTop: 16 }}>
                          <button className="btn-primary" onClick={() => setShowAddModal(true)}>Add meeting</button>
                        </div>
                      </div>
                    )}

                    {/* ── Past meetings ledger ─────────────────────────────── */}
                    <div className="sec-label">
                      <h2>Past meetings</h2>
                      <span className="rule" />
                      <span className="cnt">{pastMeetings.length} meeting{pastMeetings.length === 1 ? "" : "s"} · newest first</span>
                    </div>

                    {pastMeetings.length === 0 ? (
                      <div className="ledger-list">
                        <div className="r-locked" style={{ padding: "22px 18px" }}>No past meetings yet.</div>
                      </div>
                    ) : (
                      <div className="ledger-list">
                        {pastMeetings.map(ev => {
                          const dp = dateParts(ev.date);
                          const preview = notesPreview(ev);
                          const hasNotes = !!(ev.description ?? "").trim();
                          const row = summary[ev.id];
                          const lowAttendance = row && row.eligible > 0 && row.present / row.eligible < 0.7;
                          return (
                            <button key={ev.id} type="button" className="led-row" onClick={() => handleOpen(ev.id)}>
                              <div className="led-date">
                                <div className="dow">{dp.dow}</div>
                                <div className="dnum">{dp.dnum}</div>
                                <div className="mon">{dp.mon}</div>
                              </div>
                              <div className="led-main">
                                <div className="t"><span className="vdot" />{ev.title}</div>
                                {preview ? (
                                  <div className="sum">{preview}</div>
                                ) : (
                                  <div className="sum empty">Minutes not filed — add notes before the next meeting.</div>
                                )}
                              </div>
                              <div className="led-stats">
                                <span className={`tag ${hasNotes ? "minutes" : "nominutes"}`}>{hasNotes ? "Minutes" : "No minutes"}</span>
                                <div className="stat">
                                  <div className={`sv${row && row.eligible > 0 ? (lowAttendance ? " lo" : "") : " none"}`}>
                                    {row && row.eligible > 0 ? `${row.present}/${row.eligible}` : "—"}
                                  </div>
                                  <div className="sk">present</div>
                                </div>
                                <svg className="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* RIGHT rail — roll call for the next meeting */}
                  <aside className="mt-rail">
                    <div>
                      <p className="lbl">Roll call{nextMeeting ? ` · ${fmtDate(nextMeeting.date)}` : ""}</p>
                      {nextMeeting ? (
                        <RollCallPanel
                          event={nextMeeting}
                          brotherList={brotherList}
                          canManage={canAttendance}
                          onSaved={loadSummary}
                        />
                      ) : (
                        <div className="roster"><div className="r-locked" style={{ padding: "18px 16px" }}>No upcoming meeting to take roll for.</div></div>
                      )}
                    </div>
                  </aside>
                </div>
              </>
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
        <Modal title="Add Meeting" tone="dusk" onClose={() => setShowAddModal(false)}>
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
        <Modal title="Edit Meeting" tone="dusk" onClose={() => setEditTarget(null)}>
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
          tone="dusk"
          message={
            <>
              Delete <span className="font-semibold text-[#ece7dd]">&ldquo;{deleteTarget.title}&rdquo;</span>?
              {" "}This will permanently remove the meeting and its minutes.
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

// ─── OnDeckHero ───────────────────────────────────────────────────────────────

function OnDeckHero({
  event,
  summary,
  canManage,
  onTakeRoll,
  onOpen,
}: {
  event: CalendarEvent;
  summary: AttendanceSummaryRow | undefined;
  canManage: boolean;
  onTakeRoll: () => void;
  onOpen: () => void;
}) {
  const dp = dateParts(event.date);
  const present = summary?.present ?? 0;
  const eligible = summary?.eligible ?? 0;
  const pct = eligible > 0 ? Math.round((present / eligible) * 100) : 0;

  return (
    <div className="ondeck">
      <div className="od-top">
        <span className="pill">Next meeting</span>
        <span className="when">{dp.dow} · {fmtDate(event.date)}{event.time ? ` · ${event.time}` : ""}</span>
      </div>
      <h3>{event.title}</h3>
      <p className="od-meta">
        {event.location && <><span><b>{event.location}</b></span><span>·</span></>}
        <span><b>Mandatory</b> for all brothers</span>
      </p>

      <div className="od-progress">
        <div className="p-head">
          <span className="p-lbl">{eligible > 0 ? "Attendance marked" : "Roll not taken yet"}</span>
          {eligible > 0 && <span className="p-count"><b>{present}</b> / {eligible} present</span>}
        </div>
        {eligible > 0 && (
          <>
            <div className="meter">
              <i className="fill-present" style={{ width: `${pct}%` }} />
            </div>
            <div className="p-legend">
              <span className="li"><span className="d" style={{ background: "var(--vio)" }} />Present {present}</span>
              <span className="li"><span className="d" style={{ background: "var(--faint)" }} />Not present {Math.max(eligible - present, 0)}</span>
            </div>
          </>
        )}
      </div>

      <div className="actions">
        {canManage && (
          <button className="btn-primary" onClick={onTakeRoll}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            Take roll
          </button>
        )}
        <button className="btn-ghost" onClick={onOpen}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h7" /></svg>
          Open minutes
        </button>
      </div>
    </div>
  );
}
