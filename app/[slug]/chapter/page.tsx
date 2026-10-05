"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { NotesEditorHandle } from "@/app/components/meeting-notes/CollaborativeNotesEditor";
import { NotesCollaborators } from "@/app/components/meeting-notes/NotesCollaborators";
import type { Collaborator, NotesStatus } from "@/app/lib/collaboration/notes-session";
import { notesSummaryStale, type NotesSnapshot } from "@/lib/collaboration/notes-protocol";
import { parseMeetingSummary, type MeetingActionItem, type MeetingSummaryData } from "@/lib/meeting-summary";
import "@/app/components/meeting-notes/notes-editor.css";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog, SaveIndicator, LoadingSpinner } from "../../components/dashboard/primitives";
import { LogAttendanceForm } from "../../components/dashboard/forms";
import { useToast } from "../../components/dashboard/Toast";
import { MemberSpotlight } from "../../components/members/MemberSpotlight";
import { BrotherAvatar } from "../../components/BrotherAvatar";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { useChapter } from "../../context/ChapterContext";
import { useVocab } from "../../hooks/useVocab";
import { useOrgPath } from "../../hooks/useOrgPath";
import { useActiveSemester } from "../../hooks/useActiveSemester";
import { CalendarEvent, fmtDate } from "../../data";
import { orgFetch } from "../../lib/api";
import { daysFromToday, todayStr } from "../../lib/dates";
import "../../components/dashboard/dashboard-ledger.css";
import "../../components/dashboard/meetings-ledger.css";
import "../../components/timeline/calendar-event-form.css";
import { compareEvents, formatEventTime, isEventOver } from "@/lib/event-time";
import { useNow } from "../../hooks/useNow";
import { ScheduleFields, initialSchedule, scheduleFromValue, type ScheduleValue } from "../../components/timeline/ScheduleFields";
import { scheduleDate, scheduleTime, type Schedule } from "@/lib/calendar-feed/schedule";

const CollaborativeNotesEditor = dynamic(() => import("@/app/components/meeting-notes/CollaborativeNotesEditor"), { ssr: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

type HttpError = Error & { status: number };

// Org-scoped JSON requests with HTTP status and server error details.
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOWS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LOW_TURNOUT = 0.7;

function localDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDateFull(dateStr: string) {
  return localDate(dateStr).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// Date parts for the ledger date column ("Tue / 9 / Jun").
function dateParts(dateStr: string) {
  const dt = localDate(dateStr);
  return { dow: DOWS[dt.getDay()], dnum: dt.getDate(), mon: MONTHS[dt.getMonth()] };
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

/** The start of an event's time ("7:30 PM" out of "7:30 PM – 9:00 PM"). */
function startTimeOf(e: CalendarEvent) {
  return formatEventTime(e.time, e.schedule)?.split(/\s*[–-]\s*/)[0] ?? null;
}

/** "tonight" / "today" / "tomorrow" / "on Wednesday" / "on Oct 14" — for prose. */
function whenPhrase(e: CalendarEvent) {
  const diff = daysFromToday(e.date);
  if (diff === 0) return /PM/i.test(startTimeOf(e) ?? "") ? "tonight" : "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1 && diff < 7) return `on ${DOWS_LONG[localDate(e.date).getDay()]}`;
  return `on ${fmtDate(e.date)}`;
}

function andList(items: string[]) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const hasNotes = (e: CalendarEvent) => !!(e.description ?? "").trim();

// One-line preview for the ledger row: the summary's gist, else the minutes' first lines.
function notesPreview(event: CalendarEvent): string {
  const data = parseMeetingSummary(event.notesSummaryData);
  if (data?.gist) return data.gist;
  const summary = (event.notesSummary ?? "").split("\n").map(l => l.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim()).find(Boolean);
  if (summary) return summary;
  return (event.description ?? "")
    .split("\n")
    .map(l => l.replace(/^[-*•]\s*/, "").trim())
    .filter(l => l && !/^(opened|closed|agenda|action items)\b/i.test(l))
    .slice(0, 2)
    .join(" · ");
}

/** "Oct 10" from a yyyy-mm-dd due date. */
function dueLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

// Per-event counts from GET /api/attendance/summary.
type AttendanceSummaryRow = { calendarEventId: number; present: number; eligible: number; excused: number; expected: number };
type AttendanceDetail = {
  excused:   { brotherId: number; brotherName: string; reason: string }[];
  unexcused: { brotherId: number; brotherName: string }[];
  attended:  { brotherId: number; brotherName: string }[];
};
type LiveCheckIn = { event: { id: number }; state: "open" | "closing" | "closed"; presentCount: number; eligibleCount: number; msRemaining: number } | null;
type PendingExcuse = { id: number; brotherName: string; calendarEventId: number };

const taken = (row: AttendanceSummaryRow | undefined) => !!row && row.eligible > 0;

// ─── MeetingForm (shared by add + edit) ───────────────────────────────────────
// Built on the Timeline's cef-* vocabulary, so both aesthetics already dress it.

type MeetingDraft = { title: string; when: ScheduleValue; location: string; mandatory: boolean };
/** What the calendar API takes. A structured schedule decides date/time server-side;
 *  only a legacy "as written" time travels as free text. */
type MeetingInput = { title: string; location: string; mandatory: boolean; schedule: Schedule | null; date: string; time: string | null };

const formIcon = (children: React.ReactNode) => (
  <svg className="cef-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

function MeetingForm({
  initial,
  editing,
  submitLabel,
  minDate,
  maxDate,
  onSubmit,
  onClose,
}: {
  initial: MeetingDraft;
  editing: boolean;
  submitLabel: string;
  minDate?: string;
  maxDate?: string;
  onSubmit: (d: MeetingInput) => void | Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<MeetingDraft>(initial);
  const formRef = useRef<HTMLFormElement>(null);
  // Guards the double-click: the submit handler is a network round-trip, so
  // without this a second click fires a second POST and creates a second
  // meeting. A ref, not just state, because two clicks in the same tick would
  // both read the pre-render `false`.
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting.current || !form.title.trim()) return;
    const result = scheduleFromValue(form.when);
    if ("error" in result) { setScheduleError(result.error); return; }
    setScheduleError("");
    const { schedule } = result;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        location: form.location.trim(),
        mandatory: form.mandatory,
        schedule,
        date: schedule ? scheduleDate(schedule) : form.when.date,
        time: schedule ? scheduleTime(schedule) : form.when.legacyTime.trim() || null,
      });
    } finally {
      // On success the parent unmounts this form; on failure it stays open so
      // the officer can retry, which needs the button live again.
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="cef-root">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="cef cef-sheet"
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); formRef.current?.requestSubmit(); } }}
      >
        <div className="cef-head"><span className="cef-kicker">{editing ? "Edit meeting" : "New chapter meeting"}</span></div>
        <label className="sr-only" htmlFor="meeting-title">Title</label>
        <input id="meeting-title" className="cef-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Meeting name" autoComplete="off" autoFocus required />
        <div className="cef-rows">
          <div className="cef-r">
            {formIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)}
            <div>
              <ScheduleFields variant="inline" value={form.when} onChange={when => setForm(f => ({ ...f, when }))} minDate={minDate} maxDate={maxDate} />
              {scheduleError ? <p role="alert" className="cef-hint sched-warn cef-r-note">{scheduleError}</p>
                : <p className="cef-hint cef-r-note">Shows on the Timeline and in everyone&rsquo;s subscribed calendar.</p>}
            </div>
          </div>
          <div className="cef-r">
            {formIcon(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>)}
            <div>
              <label className="sr-only" htmlFor="meeting-location">Location</label>
              <input id="meeting-location" className="cef-quiet" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Add location" />
            </div>
          </div>
          <div className="cef-r">
            {formIcon(<><path d="M9 11l2.5 2.5L16 9" /><rect x="3.5" y="3.5" width="17" height="17" rx="4" /></>)}
            <label className="cef-req">
              <span>
                <span className="t">Required attendance</span>
                <span className="s">{form.mandatory ? "Counts toward standing; excuses go to review." : "Optional: no roll is taken and it doesn’t touch anyone’s standing."}</span>
              </span>
              <span className="cef-sw">
                <input type="checkbox" checked={form.mandatory} onChange={e => setForm(f => ({ ...f, mandatory: e.target.checked }))} />
                <span className="track" aria-hidden />
              </span>
            </label>
          </div>
        </div>
        <div className="cef-foot">
          <span className="cef-kbd"><kbd>⌘</kbd> <kbd>↵</kbd> to {editing ? "save" : "add"}</span>
          <div className="cef-btns">
            <button type="button" className="cef-btn ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="cef-btn primary" disabled={isSubmitting || !form.title.trim()}>{isSubmitting ? "Saving…" : submitLabel}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── SummaryMarkdown ──────────────────────────────────────────────────────────
// Renders a summary written before summaries were structured: **bold**, "- "
// bullets, and bare bold-only lines as section headers.

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`} className="font-semibold text-[color:var(--ink)]">{part.slice(2, -2)}</strong>;
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
      blocks.push(<p key={`h-${i}`} className="mt-sum-h5">{header[1]}</p>);
      return;
    }
    blocks.push(<p key={`p-${i}`} className="leading-relaxed">{renderInline(line, `p-${i}`)}</p>);
  });
  flushBullets();
  return <div className="mt-sum-md space-y-2">{blocks}</div>;
}

// ─── SummaryCard (the minutes' margin column) ─────────────────────────────────

function SummaryCard({
  event,
  running,
  noteLines,
  canEditNotes,
  selfId,
  onSummarize,
  onToggle,
}: {
  event: CalendarEvent;
  running: boolean;
  noteLines: number;
  canEditNotes: boolean;
  selfId: number | null;
  onSummarize: () => void;
  onToggle: (item: MeetingActionItem) => void;
}) {
  const { brotherList } = useChapter();
  const data = parseMeetingSummary(event.notesSummaryData);
  const legacy = !data && (event.notesSummary ?? "").trim();
  const chip = (label: string) => (
    <span className="ai-chip"><span className="lg-only">AI</span><span className="pp-only"><PaperIcon name="spark" />{label}</span></span>
  );

  if (running) {
    return (
      <div className="mt-sum">
        <div className="hd">{chip("Summarizing")}</div>
        <p className="mt-sum-run"><span className="spin" aria-hidden />Reading {noteLines} line{noteLines === 1 ? "" : "s"} of minutes for decisions and owners…</p>
      </div>
    );
  }
  if (!data && !legacy) {
    return (
      <div className="mt-sum empty">
        <div className="hd">{chip("Summary")}</div>
        <p>{hasNotes(event)
          ? <>Not summarized yet. <b>Summarize</b> pulls out the decisions and who owes what.</>
          : "Write the minutes, then Summarize pulls out the decisions and who owes what."}</p>
      </div>
    );
  }

  const stale = notesSummaryStale(event);
  const today = todayStr();
  const ownerName = (a: MeetingActionItem) => {
    const b = a.brotherId != null ? brotherList.find(x => x.id === a.brotherId) : null;
    return b ? b.name.split(" ")[0] : a.owner;
  };
  return (
    <div className={`mt-sum${stale ? " stale" : ""}`}>
      <div className="hd">
        {chip("Summary")}
        {event.notesSummaryAt && (
          <span className="at">Generated {new Date(event.notesSummaryAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        )}
      </div>
      {stale && (
        <p className="stl">Notes changed since — <button type="button" onClick={onSummarize}>Re-summarize</button></p>
      )}
      {legacy ? <SummaryMarkdown text={legacy} /> : data && (
        <>
          {data.gist && <p className="gist">{data.gist}</p>}
          <h5>Decisions</h5>
          {data.decisions.length
            ? <ul className="dec">{data.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
            : <p className="none">None recorded.</p>}
          <h5 className="acts-h">Action items</h5>
          {data.actions.length ? (
            <ul className="acts">
              {data.actions.map(a => {
                const late = !a.done && !!a.due && a.due < today;
                const can = canEditNotes || (selfId != null && a.brotherId === selfId);
                const who = ownerName(a);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`aitem${a.done ? " done" : ""}`}
                      aria-pressed={a.done}
                      disabled={!can}
                      title={can ? (a.done ? "Mark not done" : "Mark done") : "Only an officer or the owner can tick this off"}
                      onClick={() => onToggle(a)}
                    >
                      <span className="bx" aria-hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 13.2 9.4 18 19.5 6.4" /></svg></span>
                      <span>
                        <span className="tx">{a.text}</span>
                        {(who || a.due) && (
                          <small>
                            {who ?? "Someone"}
                            {a.due && <> · {late ? <span className="late">was due {dueLabel(a.due)}</span> : `by ${dueLabel(a.due)}`}</>}
                          </small>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="none">None recorded.</p>}
        </>
      )}
    </div>
  );
}

// ─── AttendanceCard (overlay margin column) ───────────────────────────────────

function AttendanceCard({ event, refresh, canTake, onTake, onOpenMember }: {
  event: CalendarEvent;
  refresh: number;
  canTake: boolean;
  onTake: () => void;
  onOpenMember: (id: number) => void;
}) {
  const { brotherList, currentUser, avatarRevision } = useChapter();
  // undefined = still loading; null = the read failed.
  const [detail, setDetail] = useState<AttendanceDetail | null | undefined>(undefined);
  useEffect(() => {
    if (!event.mandatory) return;
    let live = true;
    requestJson<AttendanceDetail>(`/api/attendance/${event.id}`)
      .then(d => { if (live) setDetail(d); })
      .catch(() => { if (live) setDetail(null); });
    return () => { live = false; };
  }, [event.id, event.mandatory, refresh]);

  const groups: [string, "ok" | "gold" | "rose", { brotherId: number; brotherName: string; reason?: string }[]][] = detail
    ? [["Present", "ok", detail.attended], ["Excused", "gold", detail.excused], ["Absent", "rose", detail.unexcused]]
    : [];
  const any = groups.some(g => g[2].length);
  const over = isEventOver(event);
  return (
    <div className="mt-att">
      <div className="hd">
        <h5>Attendance</h5>
        {canTake && event.mandatory && <button type="button" onClick={onTake}>{detail && detail.attended.length + detail.unexcused.length > 0 ? "Edit" : "Take"}</button>}
      </div>
      {!event.mandatory ? <p className="none">Optional meeting — no roll is taken.</p>
        : detail === undefined ? <p className="none">Loading…</p>
        : detail === null ? <p className="none">Couldn’t load attendance.</p>
        : !any ? <p className="none">{over ? "No attendance recorded." : "Not taken yet."}</p>
        : groups.map(([label, tone, people]) => people.length > 0 && (
          <div key={label} className={`ev-att-group ${tone}`}>
            <div className="gh">
              <span className="d" style={{ background: `var(--${tone})` }} />
              <span className="gl" style={{ color: `var(--${tone})` }}>{label}</span>
              <span className="gc">{people.length}</span>
            </div>
            <div className="nms">
              {people.map(p => {
                const b = brotherList.find(x => x.id === p.brotherId);
                return (
                  <button key={p.brotherId} type="button" className="nm" title={p.reason ?? p.brotherName} onClick={() => onOpenMember(p.brotherId)}>
                    {b && <span className="pp-only"><BrotherAvatar brother={b} selfId={currentUser?.id ?? null} selfAvatarUrl={currentUser?.avatarUrl} avatarRevision={avatarRevision} size="xs" /></span>}
                    <span className="lg-only">{p.brotherName}</span>
                    <span className="pp-only">{p.brotherName.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── MeetingDetailOverlay (the minutes book) ──────────────────────────────────

function MeetingDetailOverlay({
  event,
  notesDraft,
  saveState,
  summarizeState,
  summarizeError,
  attendanceRow,
  attendanceRefresh,
  onClose,
  onNotesChange,
  onEdit,
  onDelete,
  onSummarize,
  onNotesSaved,
  onToggleItem,
  onTakeAttendance,
  onOpenMember,
  canEditNotes,
  canManageEvents,
  canTakeAttendance,
  selfId,
}: {
  event: CalendarEvent;
  notesDraft: string;
  saveState: "idle" | "saving" | "saved" | "error";
  summarizeState: "idle" | "running" | "error";
  summarizeError: string | null;
  attendanceRow: AttendanceSummaryRow | undefined;
  attendanceRefresh: number;
  onClose: () => void;
  onNotesChange: (val: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSummarize: () => void;
  onNotesSaved: (value: NotesSnapshot) => void;
  onToggleItem: (item: MeetingActionItem) => void;
  onTakeAttendance: () => void;
  onOpenMember: (id: number) => void;
  canEditNotes: boolean;
  canManageEvents: boolean;
  canTakeAttendance: boolean;
  selfId: number | null;
}) {
  const editorRef = useRef<NotesEditorHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLTextAreaElement>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [sharedStatus, setSharedStatus] = useState<NotesStatus>({ connection: "Connecting…", saving: "loading" });
  const [sharedError, setSharedError] = useState<string | null>(null);
  const shared = !!event.notesCollaborationEnabled;
  const sharedSave = sharedStatus.saving === "saved" ? "saved" : sharedStatus.saving === "error" ? "error" : "saving";
  const slug = typeof window === "undefined" ? "" : decodeURIComponent(window.location.pathname.split("/")[1] ?? "");
  const summarize = async () => {
    setSharedError(null);
    try {
      if (shared) {
        if (!editorRef.current) throw new Error("Notes are still loading.");
        await editorRef.current.flush();
      }
      onSummarize();
    }
    catch (error) { setSharedError(error instanceof Error ? error.message : "Save notes before summarizing."); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [contenteditable="true"], textarea, [tabindex="0"]') ?? [])].filter(el => el.offsetParent !== null);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  // The legal pad grows with the minutes instead of scrolling inside itself.
  useEffect(() => {
    const t = padRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.max(t.scrollHeight, window.innerHeight * 0.55)}px`;
  }, [notesDraft]);

  const time = formatEventTime(event.time, event.schedule);
  const noteLines = notesDraft.split("\n").filter(l => l.trim()).length;
  const canSummarize = summarizeState !== "running" && (shared ? sharedStatus.saving !== "loading" : !!notesDraft.trim());
  const attLabel = !event.mandatory ? null
    : taken(attendanceRow) ? `${attendanceRow!.present} of ${attendanceRow!.eligible} present`
    : canTakeAttendance ? "Take attendance" : null;
  const icon = (d: React.ReactNode) => <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;

  return (
    <div className="dash mt-ov fixed inset-0 z-50 flex items-stretch justify-center" style={{ maxWidth: "none", margin: 0, padding: 0 }} onClick={onClose}>
      <div className="mt-scrim absolute inset-0 bg-[color:var(--scrim)] backdrop-blur-md" />

      {/* Panel — stop propagation so clicks inside don't close */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={event.title} className="mt-sheet relative flex w-full max-w-5xl flex-col bg-[color:var(--paper)]" onClick={e => e.stopPropagation()}>

        {/* ── Bar ─────────────────────────────────────────────────────────── */}
        <div className="mt-bar flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.08)] bg-[color:var(--paper)] px-4 sm:px-6">
          <button onClick={onClose} className="mt-back flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-[color:var(--muted)] transition-colors hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[color:var(--ink)]">
            {icon(<path d="M15 19l-7-7 7-7" />)}
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="mt-vr h-4 w-px bg-[rgba(var(--ink-rgb),0.1)]" />
          <div className="mt-ttl flex min-w-0 flex-1 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--vio)]" />
            <p className="truncate text-[14px] font-semibold text-[color:var(--ink)]">{event.title}</p>
          </div>
          {shared && <NotesCollaborators peers={collaborators} />}
          <span className="mt-saved"><SaveIndicator state={shared ? sharedSave : saveState} tone="dusk" /></span>
          <div className="flex items-center gap-1">
            <button
              onClick={summarize}
              disabled={!canSummarize}
              title={!notesDraft.trim() ? "Add notes first" : "Pull out decisions and action items"}
              aria-label={event.notesSummary ? "Re-summarize notes" : "Summarize notes"}
              className="mt-sumbtn flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-[color:var(--vio)] transition-colors hover:bg-[rgba(var(--vio-rgb),0.1)] hover:text-[color:var(--vio-hi)] disabled:cursor-not-allowed disabled:text-[color:var(--faint)] disabled:hover:bg-transparent sm:py-1.5"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
                <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
              </svg>
              <span className="hidden sm:inline">{event.notesSummary ? "Re-summarize" : "Summarize"}</span>
            </button>
            {canManageEvents && (
              <>
                <button onClick={onEdit} aria-label="Edit meeting" title="Edit meeting" className="mt-icon flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-[color:var(--muted)] transition-colors hover:bg-[rgba(var(--ink-rgb),0.06)] hover:text-[color:var(--ink-soft)] sm:py-1.5">
                  {icon(<path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />)}
                  <span className="lbl hidden sm:inline">Edit</span>
                </button>
                <button onClick={onDelete} aria-label="Delete meeting" title="Delete meeting" className="mt-icon danger flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] text-[color:var(--muted)] transition-colors hover:bg-[rgba(var(--rose-rgb),0.1)] hover:text-[color:var(--rose)] sm:py-1.5">
                  {icon(<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />)}
                  <span className="lbl hidden sm:inline">Delete</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Meta strip ──────────────────────────────────────────────────── */}
        <div className="mt-meta flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[rgba(var(--ink-rgb),0.05)] bg-[rgba(var(--ink-rgb),0.02)] px-6 py-3 text-[12px] text-[color:var(--muted)]">
          <span className="flex items-center gap-2"><PaperIcon name="cal" className="pp-ic pp-only" />{fmtDateFull(event.date)}</span>
          {time && <span className="flex items-center gap-2"><PaperIcon name="clock" className="pp-ic pp-only" />{time}</span>}
          {event.location && <span className="flex items-center gap-2"><PaperIcon name="pin" className="pp-ic pp-only" />{event.location}</span>}
          <span className={`mt-req ${event.mandatory ? "on" : ""}`}>{event.mandatory ? "Required" : "Optional"}</span>
          {attLabel && (
            canTakeAttendance
              ? <button type="button" className="mt-attchip" onClick={onTakeAttendance}><PaperIcon name="people" className="pp-ic pp-only" />{attLabel}</button>
              : <span className="mt-attchip"><PaperIcon name="people" className="pp-ic pp-only" />{attLabel}</span>
          )}
        </div>

        {/* ── Body: the legal pad beside its margin column ─────────────────── */}
        <div className="mt-body flex-1 overflow-y-auto">
          <div className="mt-grid">
            <div className="mt-main">
              {(summarizeError || sharedError) && <div className="mt-err">{summarizeError || sharedError}</div>}
              {shared ? (
                <div className="mt-pad shared">
                  <CollaborativeNotesEditor key={event.id} ref={editorRef} eventId={event.id} slug={slug} onSaved={onNotesSaved} onState={setSharedStatus} onPeers={setCollaborators} />
                </div>
              ) : (
                <>
                  <div className="mt-pad-h">
                    <span className="lbl">Meeting minutes</span>
                    {canEditNotes && <p className="hint">{event.notesInitialized ? "Shared editing is paused. These are the last saved minutes." : "Write action items as “- Dev to send the budget by Oct 10” and Summarize picks them up."}</p>}
                  </div>
                  <div className="mt-pad">
                    <label className="sr-only" htmlFor="mt-notes">Meeting minutes</label>
                    <textarea
                      id="mt-notes"
                      ref={padRef}
                      className="mt-pad-text"
                      value={notesDraft}
                      readOnly={!canEditNotes || !!event.notesInitialized}
                      onChange={e => onNotesChange(e.target.value)}
                      placeholder={canEditNotes ? "Start typing meeting minutes…" : "No minutes filed yet."}
                      spellCheck
                      autoFocus={canEditNotes && !hasNotes(event)}
                    />
                  </div>
                </>
              )}
            </div>
            <aside className="mt-side">
              <SummaryCard event={event} running={summarizeState === "running"} noteLines={noteLines} canEditNotes={canEditNotes} selfId={selfId} onSummarize={summarize} onToggle={onToggleItem} />
              <AttendanceCard event={event} refresh={attendanceRefresh} canTake={canTakeAttendance} onTake={onTakeAttendance} onOpenMember={onOpenMember} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PastFilter = "all" | "missing" | "low";

export default function ChapterPage() {
  const toast = useToast();
  const router = useRouter();
  const orgPath = useOrgPath();
  const semester = useActiveSemester();
  const { currentUser, can, brotherList, setBrotherList } = useChapter();
  const v = useVocab();
  const canAttendance = can("MANAGE_ATTENDANCE");
  const canEvents = can("MANAGE_EVENTS");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [events,        setEvents]        = useState<CalendarEvent[]>([]);
  const [summary,       setSummary]       = useState<Record<number, AttendanceSummaryRow>>({});
  const [live,          setLive]          = useState<LiveCheckIn>(null);
  const [pending,       setPending]       = useState<PendingExcuse[]>([]);
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
  const [attendanceTarget, setAttendanceTarget] = useState<CalendarEvent | null>(null);
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  const [filter,        setFilter]        = useState<PastFilter>("all");
  const [freshId,       setFreshId]       = useState<number | null>(null);
  const [spotlightId,   setSpotlightId]   = useState<number | null>(null);

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
    // An open check-in window takes over the On deck attendance block.
    requestJson<LiveCheckIn>("/api/attendance/live").then(setLive).catch(() => { /* optional */ });
  }, [loadSummary]);

  // Officers see who's waiting on an excuse decision for the next meeting.
  useEffect(() => {
    if (!canAttendance) return;
    requestJson<PendingExcuse[]>("/api/excuses?status=pending").then(setPending).catch(() => { /* optional */ });
  }, [canAttendance]);

  // Shared with the Dashboard's LogAttendanceForm flow — same endpoint, same
  // brotherList refresh (attendance can affect dues/threshold-derived fields).
  async function handleLogAttendance(attendedIds: number[], eventId: number) {
    const updated = await requestJson<typeof brotherList>("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarEventId: eventId, attendedIds }),
    });
    setBrotherList(updated);
    setAttendanceTarget(null);
    setAttendanceRefresh(n => n + 1);
    loadSummary();
    toast.success(`Attendance saved — ${attendedIds.length} present.`);
  }

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
      setEvents(prev => prev.map(e => e.id === id ? { ...e, description: value, notesUpdatedAt: updated.notesUpdatedAt ?? e.notesUpdatedAt, notesContentRevision: updated.notesContentRevision ?? e.notesContentRevision } : e));
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
      const pendingDraft = notesDraft[selectedId];
      if (pendingDraft !== undefined) {
        clearTimeout(timers.current[selectedId]);
        flushSave(selectedId, pendingDraft);
      }
    }
    setSelectedId(id);
  }

  const handleClose = useCallback(() => {
    if (selectedId !== null) {
      const pendingDraft = notesDraft[selectedId];
      if (pendingDraft !== undefined) {
        clearTimeout(timers.current[selectedId]);
        flushSave(selectedId, pendingDraft);
      }
    }
    setSelectedId(null);
  }, [selectedId, notesDraft, flushSave]);

  // ── Add meeting ───────────────────────────────────────────────────────────────
  async function handleAdd(draft: MeetingInput) {
    setPageError(null);
    try {
      const created = await requestJson<CalendarEvent>("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          schedule: draft.schedule,
          date: draft.date,
          time: draft.time,
          location: draft.location || null,
          category: "chapter",
          mandatory: draft.mandatory,
          description: "",
        }),
      });
      savedValues.current[created.id] = "";
      setEvents(prev => [created, ...prev]);
      setShowAddModal(false);
      setFreshId(created.id);
      loadSummary();
      toast.success(`Meeting added for ${fmtDate(created.date)} — it’s on the Timeline too.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create meeting.";
      setPageError(message);
      toast.error(message);
    }
  }

  // ── Edit metadata ─────────────────────────────────────────────────────────────
  async function handleEdit(draft: MeetingInput) {
    if (!editTarget) return;
    const id = editTarget.id;
    setPageError(null);
    try {
      const updated = await requestJson<CalendarEvent>(`/api/calendar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          schedule: draft.schedule,
          date: draft.date,
          time: draft.time,
          location: draft.location || null,
          mandatory: draft.mandatory,
        }),
      });
      setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updated, description: e.description } : e));
      setEditTarget(null);
      loadSummary();
      toast.success("Meeting updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update meeting.";
      setPageError(message);
      toast.error(message);
    }
  }

  // ── Summarize notes via AI ───────────────────────────────────────────────────
  async function handleSummarize(id: number) {
    const pendingDraft = notesDraft[id];
    if (pendingDraft !== undefined && pendingDraft !== savedValues.current[id]) {
      clearTimeout(timers.current[id]);
      await flushSave(id, pendingDraft);
    }
    setSummarizeError(s => ({ ...s, [id]: null }));
    setSummarizeState(s => ({ ...s, [id]: "running" }));
    try {
      const res = await requestJson<{ id: number; notesSummary: string | null; notesSummaryData: unknown; notesSummaryAt: string | null; notesSummaryRevision: number | null; notesContentRevision: number }>(
        "/api/ai/summarize-meeting",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        },
      );
      setEvents(prev => prev.map(e => e.id === id ? { ...e, notesSummary: res.notesSummary, notesSummaryData: res.notesSummaryData, notesSummaryAt: res.notesSummaryAt, notesSummaryRevision: res.notesSummaryRevision, notesContentRevision: Math.max(e.notesContentRevision ?? 0, res.notesContentRevision) } : e));
      setSummarizeState(s => ({ ...s, [id]: "idle" }));
      const items = parseMeetingSummary(res.notesSummaryData)?.actions.length ?? 0;
      toast.success(`Summary ready — ${items} action item${items === 1 ? "" : "s"}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^.*?: /, "") : "Failed to summarize.";
      setSummarizeState(s => ({ ...s, [id]: "error" }));
      setSummarizeError(s => ({ ...s, [id]: message }));
      toast.error(message);
    }
  }

  // ── Tick an action item (optimistic) ─────────────────────────────────────────
  async function handleToggleItem(id: number, item: MeetingActionItem) {
    const patch = (fn: (d: MeetingSummaryData) => MeetingSummaryData) =>
      setEvents(prev => prev.map(e => {
        if (e.id !== id) return e;
        const data = parseMeetingSummary(e.notesSummaryData);
        return data ? { ...e, notesSummaryData: fn(data) } : e;
      }));
    const flip = (done: boolean) => (d: MeetingSummaryData) => ({ ...d, actions: d.actions.map(a => a.id === item.id ? { ...a, done } : a) });
    patch(flip(!item.done));
    try {
      const data = await requestJson<MeetingSummaryData>(`/api/calendar/${id}/action-items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, done: !item.done }),
      });
      patch(() => data);
    } catch (err) {
      patch(flip(item.done));
      toast.error(err instanceof Error ? err.message.replace(/^.*?: /, "") : "Couldn’t update that item.");
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
      const message = err instanceof Error ? err.message : "Failed to delete meeting.";
      setDeleteError(message);
      toast.error(message);
    }
  }

  const selectedEvent = selectedId !== null ? events.find(e => e.id === selectedId) ?? null : null;

  // Next meeting = earliest chapter event that hasn't finished. Past = the ones
  // that have, newest first. Later upcoming meetings live on the Timeline.
  const today = todayStr();
  const now = useNow();
  const { nextMeeting, pastMeetings } = useMemo(() => {
    const upcoming = events.filter(e => !isEventOver(e, now)).sort(compareEvents);
    const past = events.filter(e => isEventOver(e, now)).sort((a, b) => compareEvents(b, a));
    return { nextMeeting: upcoming[0] ?? null, pastMeetings: past };
  }, [events, now]);

  // This term's books, for the digest.
  const term = useMemo(() => {
    const inTerm = (e: CalendarEvent) => !semester || (e.date >= semester.startDate && e.date <= semester.endDate);
    const held = pastMeetings.filter(inTerm);
    const rows = held.map(e => summary[e.id]).filter(taken);
    const present = rows.reduce((n, r) => n + r!.present, 0);
    const eligible = rows.reduce((n, r) => n + r!.eligible, 0);
    return {
      held,
      avg: eligible ? Math.round((present / eligible) * 100) : null,
      missing: held.filter(e => !hasNotes(e)),
    };
  }, [pastMeetings, summary, semester]);

  const missingAll = pastMeetings.filter(e => !hasNotes(e));
  const lowAll = pastMeetings.filter(e => { const r = summary[e.id]; return taken(r) && r!.present / r!.eligible < LOW_TURNOUT; });
  const shown = filter === "missing" ? missingAll : filter === "low" ? lowAll : pastMeetings;

  const digest: React.ReactNode = events.length === 0
    ? "No meetings on the calendar yet. Schedule the first one and this page becomes the chapter’s minute book: what was said, who was there, and who owes what."
    : <>
        {nextMeeting
          ? <>Chapter meets <b>{whenPhrase(nextMeeting)}{startTimeOf(nextMeeting) ? ` at ${startTimeOf(nextMeeting)}` : ""}</b>{nextMeeting.location ? ` in ${nextMeeting.location}` : ""}. </>
          : "Nothing is on deck. "}
        {term.held.length
          ? <>
              <b>{term.held.length} meeting{term.held.length === 1 ? "" : "s"}</b> on the books this term
              {term.avg != null && <>, turnout averaging <b>{term.avg}%</b></>}
              {term.missing.length
                ? term.missing.length <= 3
                  ? <> — but <b>{andList(term.missing.map(e => fmtDate(e.date)))}</b> still {term.missing.length === 1 ? "has" : "have"} no minutes.</>
                  : <> — but <b>{term.missing.length} of them</b> still have no minutes.</>
                : ", every one with minutes."}
            </>
          : "This is the first one — its minutes start the book."}
      </>;

  // New-meeting defaults: the chapter's usual time and room, on its usual
  // weekday, the first one that's free and inside the term.
  const addDefaults = useMemo((): MeetingDraft => {
    const last = [...events].sort((a, b) => compareEvents(b, a))[0];
    const used = new Set(events.map(e => e.date));
    const weekday = last ? localDate(last.date).getDay() : null;
    const clamp = (d: string) => semester && d < semester.startDate ? semester.startDate : d;
    let date = clamp(today);
    if (weekday != null) {
      const d = localDate(date);
      for (let i = 0; i < 60; i++) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (semester && iso > semester.endDate) break;
        if (d.getDay() === weekday && !used.has(iso) && iso >= today) { date = iso; break; }
        d.setDate(d.getDate() + 1);
      }
    }
    const prev = last ? initialSchedule(last.schedule, { date: last.date, time: last.time, isNew: false }) : null;
    const base = initialSchedule(null, { date, isNew: true });
    // A typed time ("7:00 PM") still says when the chapter usually starts.
    const typed = last?.time?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    const typedStart = typed ? `${String((Number(typed[1]) % 12) + (/pm/i.test(typed[3]) ? 12 : 0)).padStart(2, "0")}:${typed[2]}` : "";
    const when = prev?.mode === "timed" ? { ...base, startTime: prev.startTime, endTime: prev.endTime }
      : typedStart ? { ...base, startTime: typedStart } : base;
    return { title: "Chapter meeting", when, location: last?.location ?? "", mandatory: true };
  }, [events, semester, today]);

  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Chapter"
        onNavClick={() => {}}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Top bar (mobile/tablet only — hidden at lg+ where the sidebar is
            static and "Add meeting" lives in the briefing below). ─────────────── */}
        <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.06)] bg-[color:var(--paper-2)] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)] lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-[color:var(--ink)]">{v("Meetings")}</p>
          </div>
        </header>

        {/* ── Error banners ───────────────────────────────────────────────────── */}
        {pageError && (
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(var(--gold-rgb),0.2)] bg-[rgba(var(--gold-rgb),0.1)] px-5 py-2.5">
            <p className="text-[12px] text-[color:var(--gold)]">{pageError}</p>
            <button onClick={() => setPageError(null)} className="text-[color:var(--gold)] hover:text-[color:var(--ink)]" aria-label="Dismiss">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {deleteError && (
          <div className="flex items-center justify-between gap-3 border-b border-[rgba(var(--rose-rgb),0.2)] bg-[rgba(var(--rose-rgb),0.1)] px-5 py-2.5">
            <p className="text-[12px] text-[color:var(--rose)]">{deleteError}</p>
            <button onClick={() => setDeleteError(null)} className="text-[color:var(--rose)] hover:text-[color:var(--ink)]" aria-label="Dismiss">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Main ────────────────────────────────────────────────────────────── */}
        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-chapter" data-dashboard-theme="dusk">

            {/* Briefing */}
            <div className="briefing">
              <div>
                <p className="kicker">
                  <span className="today">
                    <span className="lg-only">{fmtDateFull(today)}</span>
                    <span className="pp-only">{DOWS[localDate(today).getDay()]} · {fmtDate(today)}</span>
                  </span>
                  <span className="lg-only">&ensp;·&ensp;</span>Chapter Meetings
                </p>
                <h1 className="greeting">The <em>minutes</em>.</h1>
                <div className="digest">
                  {!loading && (
                    <span className="ai-chip">
                      <span className="lg-only">AI</span>
                      <span className="pp-only"><PaperIcon name="spark" />Digest</span>
                    </span>
                  )}
                  <p>{loading ? "" : digest}</p>
                </div>
              </div>
              <div className="ch-acts">
                {canEvents && (
                  <button className="mt-add-btn" onClick={() => setShowAddModal(true)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Add meeting
                  </button>
                )}
                <button className="askbar pp-only" onClick={() => window.dispatchEvent(new CustomEvent("chapt:ask", { detail: { q: "" } }))}>
                  <PaperIcon name="spark" />Ask about past meetings<kbd>⌘K</kbd>
                </button>
              </div>
            </div>

            {loading && <LoadingSpinner size="md" label="Loading meetings" className="py-24" tone="dusk" />}

            {!loading && loadError && (
              <div className="flex flex-col items-center gap-2 py-24 text-center">
                <p className="text-[14px] text-[color:var(--rose)]">{loadError}</p>
              </div>
            )}

            {!loading && !loadError && (
              <div className="mt-layout">
                <div>
                  {/* ── On deck ───────────────────────────────────────────────── */}
                  <div className="sec-label">
                    <h2>On deck</h2>
                    <span className="rule" />
                    <span className="cnt">{nextMeeting ? relativeWhen(nextMeeting.date) : "Nothing scheduled"}</span>
                  </div>

                  {nextMeeting ? (
                    <OnDeckHero
                      event={nextMeeting}
                      summary={summary[nextMeeting.id]}
                      live={live && live.event.id === nextMeeting.id && live.state !== "closed" ? live : null}
                      pending={pending.filter(p => p.calendarEventId === nextMeeting.id)}
                      canTakeAttendance={canAttendance}
                      canEdit={canEvents}
                      onTakeAttendance={() => setAttendanceTarget(nextMeeting)}
                      onOpen={() => handleOpen(nextMeeting.id)}
                      onEdit={() => setEditTarget(nextMeeting)}
                      onReviewExcuses={() => router.push(orgPath("/timeline?review=1"))}
                      onGoToCheckIn={() => router.push(orgPath("/"))}
                    />
                  ) : (
                    <div className="ondeck empty">
                      <span className="pp-tile pp-only pp-t-sky" aria-hidden><PaperIcon name="gavel" /></span>
                      <div>
                        <h3 className="pp-only">No chapter meeting on the calendar.</h3>
                        <p>
                          <span className="lg-only">No upcoming chapter meeting. Add one to start a fresh agenda.</span>
                          <span className="pp-only">Add one and it lands here with a fresh page for minutes. Meetings are required by default, so attendance and excuses start counting.</span>
                        </p>
                        {canEvents && (
                          <div className="actions" style={{ marginTop: 16 }}>
                            <button className="btn-primary" onClick={() => setShowAddModal(true)}><PaperIcon name="plus" className="pp-ic pp-only" />Add meeting</button>
                          </div>
                        )}
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
                    <div className="ledger-list mt-ldg-empty">
                      <div className="r-locked" style={{ padding: "22px 18px" }}>
                        <span className="lg-only">No past meetings yet.</span>
                        <span className="pp-only">Past meetings land here, newest first, each with its minutes and who showed up.</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-tabs" role="tablist" aria-label="Filter past meetings">
                        {([["all", "All", pastMeetings.length], ["missing", "No minutes", missingAll.length], ["low", `Under ${LOW_TURNOUT * 100}%`, lowAll.length]] as const).map(([key, label, n]) => (
                          <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>
                            {label} <span className="ct">{n}</span>
                          </button>
                        ))}
                      </div>
                      <div className="ledger-list">
                        {shown.length === 0 && (
                          <div className="r-locked" style={{ padding: "22px 18px" }}>{filter === "missing" ? "Every past meeting has minutes." : `No meeting dipped under ${LOW_TURNOUT * 100}%.`}</div>
                        )}
                        {shown.map(ev => {
                          const dp = dateParts(ev.date);
                          const preview = notesPreview(ev);
                          const filed = hasNotes(ev);
                          const row = summary[ev.id];
                          const low = taken(row) && row!.present / row!.eligible < LOW_TURNOUT;
                          const summarized = !!(ev.notesSummary ?? "").trim();
                          return (
                            <button key={ev.id} type="button" className={`led-row${filed ? "" : " missing"}${freshId === ev.id ? " fresh" : ""}`} onClick={() => handleOpen(ev.id)}>
                              <div className="led-date">
                                <div className="dow">{dp.dow}</div>
                                <div className="dnum">{dp.dnum}</div>
                                <div className="mon">{dp.mon}</div>
                              </div>
                              <div className="led-main">
                                <div className="t">
                                  <span className="vdot" />{ev.title}
                                  {summarized && <span className="ai pp-only" title="Summarized"><PaperIcon name="spark" /></span>}
                                  {!ev.mandatory && <span className="opt">Optional</span>}
                                </div>
                                {filed && preview ? (
                                  <div className="sum">{preview}</div>
                                ) : !filed ? (
                                  <div className="sum empty">Minutes not filed — add notes before the next meeting.</div>
                                ) : null}
                              </div>
                              <div className="led-stats">
                                <span className={`tag ${filed ? "minutes" : "nominutes"}`}>{filed ? "Minutes" : "No minutes"}</span>
                                <div className="stat">
                                  <div className={`sv${taken(row) ? (low ? " lo" : "") : " none"}`}>
                                    {taken(row) ? `${row!.present}/${row!.eligible}` : "—"}
                                  </div>
                                  <div className="sk">present</div>
                                </div>
                                <svg className="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Full-screen meeting detail overlay ─────────────────────────────────── */}
      {selectedEvent && (
        <MeetingDetailOverlay
          key={selectedEvent.id}
          canEditNotes={canEvents}
          canManageEvents={canEvents}
          canTakeAttendance={canAttendance}
          selfId={currentUser?.id ?? null}
          event={selectedEvent}
          notesDraft={notesDraft[selectedEvent.id] ?? (selectedEvent.description ?? "")}
          saveState={saveState[selectedEvent.id] ?? "idle"}
          summarizeState={summarizeState[selectedEvent.id] ?? "idle"}
          summarizeError={summarizeError[selectedEvent.id] ?? null}
          attendanceRow={summary[selectedEvent.id]}
          attendanceRefresh={attendanceRefresh}
          onClose={handleClose}
          onNotesChange={val => handleNotesChange(selectedEvent.id, val)}
          onEdit={() => setEditTarget(selectedEvent)}
          onDelete={() => setDeleteTarget(selectedEvent)}
          onSummarize={() => handleSummarize(selectedEvent.id)}
          onToggleItem={item => handleToggleItem(selectedEvent.id, item)}
          onTakeAttendance={() => setAttendanceTarget(selectedEvent)}
          onOpenMember={setSpotlightId}
          onNotesSaved={value => setEvents(prev => prev.map(e => e.id === value.id ? { ...e, description: value.description, notesInitialized: true, notesUpdatedAt: value.notesUpdatedAt, notesContentRevision: Math.max(e.notesContentRevision ?? 0, value.notesContentRevision) } : e))}
        />
      )}

      <MemberSpotlight
        brotherId={spotlightId}
        onNavigate={setSpotlightId}
        onClose={() => setSpotlightId(null)}
        onPayDues={() => router.push(orgPath("/treasury"))}
        onLogServiceHours={() => router.push(orgPath("/service"))}
      />

      {/* Take attendance modal — same form Live Check-In's "Take attendance"
          and the Dashboard's pick-event flow open (app/components/dashboard/forms.tsx). */}
      {attendanceTarget && (
        <Modal title="Log Attendance" tone="dusk" onClose={() => setAttendanceTarget(null)}>
          <LogAttendanceForm event={attendanceTarget} bList={brotherList} onSubmit={handleLogAttendance} />
        </Modal>
      )}

      {/* Add modal */}
      {showAddModal && (
        <Modal ariaLabel="New chapter meeting" hideHeader tone="dusk" maxWidthClass="max-w-[640px]" onClose={() => setShowAddModal(false)}>
          <MeetingForm
            initial={addDefaults}
            editing={false}
            submitLabel="Add meeting"
            minDate={semester?.startDate}
            maxDate={semester?.endDate}
            onSubmit={handleAdd}
            onClose={() => setShowAddModal(false)}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal ariaLabel="Edit meeting" hideHeader tone="dusk" maxWidthClass="max-w-[640px]" onClose={() => setEditTarget(null)}>
          <MeetingForm
            initial={{
              title: editTarget.title,
              when: initialSchedule(editTarget.schedule, { date: editTarget.date, time: editTarget.time, isNew: false }),
              location: editTarget.location ?? "",
              mandatory: editTarget.mandatory,
            }}
            editing
            submitLabel="Save meeting"
            minDate={semester?.startDate}
            maxDate={semester?.endDate}
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
              Delete <span className="font-semibold text-[color:var(--ink)]">&ldquo;{deleteTarget.title}&rdquo; on {fmtDate(deleteTarget.date)}</span>?
              {" "}This will permanently remove the meeting, its minutes, attendance records, and excuse requests.
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
  live,
  pending,
  canTakeAttendance,
  canEdit,
  onTakeAttendance,
  onOpen,
  onEdit,
  onReviewExcuses,
  onGoToCheckIn,
}: {
  event: CalendarEvent;
  summary: AttendanceSummaryRow | undefined;
  live: LiveCheckIn;
  pending: PendingExcuse[];
  canTakeAttendance: boolean;
  canEdit: boolean;
  onTakeAttendance: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onReviewExcuses: () => void;
  onGoToCheckIn: () => void;
}) {
  const dp = dateParts(event.date);
  const dt = localDate(event.date);
  const isToday = daysFromToday(event.date) === 0;
  const time = formatEventTime(event.time, event.schedule);
  const wasTaken = taken(summary);
  const present = summary?.present ?? 0;
  const eligible = summary?.eligible ?? 0;
  const excused = summary?.excused ?? 0;
  const absent = Math.max(eligible - present, 0);
  const pct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);

  return (
    <div className={`ondeck${isToday ? " live" : ""}`}>
      <div className="od-cal pp-only" aria-hidden>
        <span className="top">{DOWS[dt.getDay()]}</span>
        <span className="n">{dt.getDate()}</span>
        <span className="m">{MONTHS[dt.getMonth()]}</span>
      </div>
      <div className="od-body">
        <div className="od-top">
          <span className="pill">{isToday ? <><i className="dot pp-only" />{whenPhrase(event) === "tonight" ? "Tonight" : "Today"}</> : "Next meeting"}</span>
          <span className="when">
            <span className="lg-only">{dp.dow} · {fmtDate(event.date)}{time ? ` · ${time}` : ""}</span>
            <span className="pp-only">{dp.dow} · {fmtDate(event.date)}{isToday ? "" : ` · ${relativeWhen(event.date).toLowerCase()}`}</span>
          </span>
        </div>
        <h3>{event.title}</h3>
        <p className="od-meta">
          <span className="lg-only od-lg">
            {event.location && <><span><b>{event.location}</b></span><span>·</span></>}
            {event.mandatory ? <span><b>Mandatory</b> for all brothers</span> : <span><b>Optional</b> — no roll taken</span>}
          </span>
          {time && <span className="pp-only"><PaperIcon name="clock" />{time}</span>}
          <span className="pp-only"><PaperIcon name="pin" />{event.location || "No location yet"}</span>
          <span className="pp-only"><PaperIcon name="people" />{event.mandatory ? "Required for everyone" : "Optional"}</span>
        </p>

        <div className={`od-progress${!event.mandatory || (!live && !wasTaken) ? " none" : ""}`}>
          {!event.mandatory ? (
            <>
              <div className="p-head"><span className="p-lbl">Attendance</span></div>
              <p className="p-msg">Optional meeting — no roll is taken, and it doesn’t touch anyone’s standing.</p>
            </>
          ) : live ? (
            <>
              <div className="p-head">
                <span className="p-lbl ok">Check-in open</span>
                <span className="p-count"><b>{live.presentCount}</b> / {live.eligibleCount} here so far</span>
              </div>
              <div className="meter"><i className="fill-present" style={{ width: `${pct(live.presentCount, live.eligibleCount)}%` }} /></div>
              <p className="p-msg">Anyone who hasn’t checked in when it closes is marked absent.</p>
            </>
          ) : wasTaken ? (
            <>
              <div className="p-head">
                <span className="p-lbl">Attendance marked</span>
                <span className="p-count"><b>{present}</b> / {eligible} present</span>
              </div>
              <div className="meter">
                <i className="fill-present" style={{ width: `${pct(present, eligible)}%` }} />
                <i className="fill-absent pp-only" style={{ width: `${pct(absent, eligible)}%` }} />
              </div>
              <div className="p-legend">
                <span className="li"><span className="d" style={{ background: "var(--vio)" }} />Present {present}</span>
                <span className="li"><span className="d" style={{ background: "var(--faint)" }} />{`Absent ${absent}`}</span>
                {excused > 0 && <span className="li ex"><span className="d" style={{ background: "var(--gold)" }} />Excused {excused}</span>}
              </div>
            </>
          ) : (
            <>
              <div className="p-head">
                <span className="p-lbl">Attendance not taken yet</span>
                {(summary?.expected ?? 0) > 0 && <span className="p-count">{summary!.expected} expected</span>}
              </div>
              <p className="p-msg pp-only">{isToday ? "Mark who’s there once the meeting starts." : "Opens on the day. Excuses filed before then are already counted."}</p>
            </>
          )}
        </div>

        {pending.length > 0 && (
          <button type="button" className="od-exc" onClick={onReviewExcuses}>
            <PaperIcon name="flag" className="pp-ic pp-only" />
            {pending.length} excuse{pending.length === 1 ? "" : "s"} waiting for review · {andList(pending.map(p => p.brotherName.split(" ")[0]))}
            <PaperIcon name="arrow-r" className="pp-ic pp-only" />
          </button>
        )}

        <div className="actions">
          {event.mandatory && live && canTakeAttendance ? (
            <button className="btn-primary" onClick={onGoToCheckIn}><PaperIcon name="people" className="pp-ic pp-only" />Go to check-in</button>
          ) : event.mandatory && canTakeAttendance ? (
            <button className="btn-primary" onClick={onTakeAttendance}>
              <svg className="lg-only" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              <PaperIcon name="check" className="pp-ic pp-only" />
              {wasTaken ? "Edit attendance" : "Take attendance"}
            </button>
          ) : null}
          <button className="btn-ghost" onClick={onOpen}>
            <svg className="lg-only" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h7" /></svg>
            <PaperIcon name="pencil" className="pp-ic pp-only" />
            {hasNotes(event) ? "Open minutes" : "Start the minutes"}
          </button>
          {canEdit && <button className="btn-soft pp-only" onClick={onEdit}>Edit</button>}
        </div>
      </div>
    </div>
  );
}
