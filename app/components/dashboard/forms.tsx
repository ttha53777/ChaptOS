import React, { useState, useEffect } from "react";
import type { Brother, CalendarEvent, InstagramType } from "../../data";
import { FieldLabel } from "./primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "./styles";
import { orgFetch } from "../../lib/api";
import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";

export function AddRevenueForm({ onSubmit }: {
  onSubmit: (e: { name: string; date: string; doorRevenue: number; attendance: number; notes: string }) => void;
}) {
  const [name,        setName]        = useState("");
  const [date,        setDate]        = useState("");
  const [doorRevenue, setDoorRevenue] = useState("");
  const [attendance,  setAttendance]  = useState("");
  const [notes,       setNotes]       = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date || !doorRevenue) return;
    onSubmit({ name: name.trim(), date, doorRevenue: Number(doorRevenue), attendance: Number(attendance) || 0, notes: notes.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><FieldLabel tone="dusk">Event Name</FieldLabel><input className={inputDuskCls} value={name} onChange={e => setName(e.target.value)} placeholder="Spring Kickback…" required /></div>
      <div><FieldLabel tone="dusk">Date</FieldLabel><input type="date" className={inputDuskCls} value={date} onChange={e => setDate(e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel tone="dusk">Door Revenue ($)</FieldLabel><input type="number" min="0" className={inputDuskCls} value={doorRevenue} onChange={e => setDoorRevenue(e.target.value)} placeholder="0" required /></div>
        <div><FieldLabel tone="dusk">Attendance</FieldLabel><input type="number" min="0" className={inputDuskCls} value={attendance} onChange={e => setAttendance(e.target.value)} placeholder="0" /></div>
      </div>
      <div><FieldLabel tone="dusk">Notes</FieldLabel><input className={inputDuskCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" /></div>
      <button type="submit" className={btnDuskPrimaryCls}>Log Revenue</button>
    </form>
  );
}

export function AddIGTaskForm({ onSubmit, initial }: {
  onSubmit: (t: { title: string; dueDate: string; type: InstagramType }) => void;
  initial?: { title: string; dueDate: string; type: InstagramType };
}) {
  const [title,   setTitle]   = useState(initial?.title   ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [type,    setType]    = useState<InstagramType>(initial?.type ?? "Story");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    onSubmit({ title: title.trim(), dueDate, type });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><FieldLabel tone="dusk">Post Title</FieldLabel><input className={inputDuskCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Post name…" required /></div>
      <div><FieldLabel tone="dusk">Due Date</FieldLabel><input type="date" className={inputDuskCls} value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
      <div>
        <FieldLabel tone="dusk">Type</FieldLabel>
        <select className={inputDuskCls} value={type} onChange={e => setType(e.target.value as InstagramType)}>
          {INSTAGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <button type="submit" className={btnDuskPrimaryCls}>
        {initial ? "Save Changes" : "Add IG Task"}
      </button>
    </form>
  );
}

/** One row the officer flipped on the attendance sheet. */
export type AttendanceChange = { brotherId: number; attended: boolean };

type AttendanceSheet = {
  excused:      { brotherId: number }[];
  attended:     { brotherId: number; at?: string }[];
  unexcused:    { brotherId: number }[];
  checkInOpen?: boolean;
};

/** While a check-in window is open the sheet re-reads the room this often. */
const SHEET_POLL_MS = 5_000;

export function LogAttendanceForm({ event, bList, onSubmit }: {
  event: CalendarEvent;
  bList: Brother[];
  onSubmit: (changes: AttendanceChange[], eventId: number, presentCount: number) => Promise<void> | void;
}) {
  const [excusedIds, setExcusedIds] = useState<Set<number>>(new Set());
  // What the server says right now (refreshed while a window is open), and
  // when each present row landed. The sheet saves only its differences from
  // this, so a member who checks in while it is open is never overwritten.
  const [server,     setServer]     = useState<Map<number, boolean>>(new Map());
  const [checkedAt,  setCheckedAt]  = useState<Map<number, string>>(new Map());
  const [live,       setLive]       = useState(false);
  // Rows the officer set by hand. Everything else follows the server.
  const [edits,      setEdits]      = useState<Map<number, boolean>>(new Map());
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [query,      setQuery]      = useState("");

  const load = React.useCallback((signal?: AbortSignal) =>
    orgFetch(`/api/attendance/${event.id}`, { signal })
      .then(r => r.json())
      .then((data: AttendanceSheet) => {
        setExcusedIds(new Set(data.excused.map(e => e.brotherId)));
        setServer(new Map([
          ...data.unexcused.map(r => [r.brotherId, false] as const),
          ...data.attended.map(r => [r.brotherId, true] as const),
        ]));
        setCheckedAt(new Map(data.attended.flatMap(r => r.at ? [[r.brotherId, r.at] as const] : [])));
        setLive(!!data.checkInOpen);
      }), [event.id]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setEdits(new Map());
    load(controller.signal)
      .catch(err => { if (err.name !== "AbortError") console.error("Failed to load attendance", err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [load]);

  // Check-ins tick on while the officer has the sheet open.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => { if (!document.hidden) load().catch(() => { /* next tick retries */ }); }, SHEET_POLL_MS);
    return () => clearInterval(id);
  }, [live, load]);

  // With no window and no rows at all (logging after the meeting), start with
  // everyone present: for a full room, unticking who missed is fastest. During
  // a window an unticked row just means "not checked in yet" — closing the
  // window writes those absences.
  const defaultPresent = !live && server.size === 0;
  const valueOf = (id: number) => edits.get(id) ?? server.get(id) ?? defaultPresent;

  function setRows(ids: number[], value: boolean) {
    setEdits(prev => {
      const next = new Map(prev);
      // A row set back to what the server already has stops being an edit, so
      // it follows the room again.
      for (const id of ids) {
        const base = server.get(id) ?? (live ? false : defaultPresent);
        if (value === base) next.delete(id); else next.set(id, value);
      }
      return next;
    });
  }

  const eligible = bList.filter(b => !excusedIds.has(b.id));
  const excused  = bList.filter(b => excusedIds.has(b.id));

  // Only rows whose value differs from the server. Outside a window a member
  // with no row yet is always included, so the roll records them either way.
  const changes: AttendanceChange[] = eligible.flatMap(b => {
    const v = valueOf(b.id), base = server.get(b.id);
    const changed = base === undefined ? (live ? v : true) : v !== base;
    return changed ? [{ brotherId: b.id, attended: v }] : [];
  });
  const presentCount = eligible.filter(b => valueOf(b.id)).length;
  const changedIds = new Set(changes.map(c => c.brotherId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(changes, event.id, presentCount);
    } finally {
      setSubmitting(false);
    }
  }

  const busy = loading || submitting;
  const q = query.trim().toLowerCase();
  const visibleEligible = q ? eligible.filter(b => b.name.toLowerCase().includes(q)) : eligible;
  const visibleExcused  = q ? excused.filter(b => b.name.toLowerCase().includes(q)) : excused;
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  function rowNote(b: Brother) {
    if (edits.has(b.id) && changedIds.has(b.id)) return <span className="rounded-full bg-[color:var(--vio)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--vio)]">Your change</span>;
    if (live) {
      const at = server.get(b.id) ? checkedAt.get(b.id) : undefined;
      if (at) return <span className="rounded-full bg-[color:var(--ok)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ok)]">Here · {timeOf(at)}</span>;
      if (!server.has(b.id)) return <span className="text-[11px] text-[color:var(--faint)]">Not checked in yet</span>;
    }
    return <span className="text-[11px] tabular-nums text-[color:var(--faint)]">{b.attendance}%</span>;
  }

  const saveLabel = submitting ? "Saving…"
    : !live ? "Log Attendance"
    : changes.length === 0 ? "No changes"
    : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`;

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-1 text-[13px] font-semibold text-[color:var(--ink)]">{event.title}</p>
      <p className="mb-4 text-[12px] text-[color:var(--muted)]">
        {event.date}{event.location ? ` · ${event.location}` : ""}
        {live && <span className="mt-0.5 block font-medium text-[color:var(--ok)]">Check-in is open — ticks appear as members tap in</span>}
      </p>
      {!loading && eligible.length > 0 && (
        <div className="mb-2 flex items-center gap-3">
          {eligible.length > 6 && (
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search brothers…"
              className={`${inputDuskCls} flex-1`}
            />
          )}
          {/* Eligible (non-excused) only — excused brothers are never in the present set. */}
          <button type="button" onClick={() => setRows(eligible.map(b => b.id), true)} className="text-[11px] font-medium text-[color:var(--vio)] hover:text-[color:var(--ink)]">All present</button>
          <button type="button" onClick={() => setRows(eligible.map(b => b.id), false)} className="text-[11px] font-medium text-[color:var(--muted)] hover:text-[color:var(--ink)]">Clear</button>
        </div>
      )}
      {loading ? (
        <p className="mb-4 text-[12px] text-[color:var(--faint)]">Loading attendance…</p>
      ) : (
        <div className="mb-4 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-[rgba(var(--ink-rgb),0.08)] bg-[color:var(--paper)] p-2">
          {q && visibleEligible.length === 0 && visibleExcused.length === 0 && (
            <p className="px-2 py-2 text-[12px] text-[color:var(--faint)]">No brothers match “{query}”.</p>
          )}
          {visibleEligible.map(b => (
            <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-[rgba(var(--ink-rgb),0.05)] transition-colors">
              <input type="checkbox" checked={valueOf(b.id)} onChange={() => setRows([b.id], !valueOf(b.id))} className="h-4 w-4 rounded border-[rgba(var(--ink-rgb),0.2)] bg-transparent text-[color:var(--vio)] focus:ring-[color:var(--vio)]/30" />
              <span className="flex-1 text-[13px] font-medium text-[color:var(--ink)]">{b.name}</span>
              {rowNote(b)}
            </label>
          ))}
          {visibleExcused.map(b => (
            <div key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-2 opacity-50">
              <input type="checkbox" disabled className="h-4 w-4 rounded border-[rgba(var(--ink-rgb),0.2)] bg-transparent" />
              <span className="flex-1 text-[13px] font-medium text-[color:var(--muted)]">{b.name}</span>
              <span className="text-[10px] font-semibold text-[color:var(--gold)]">Excused</span>
            </div>
          ))}
        </div>
      )}
      <div className="mb-4 flex gap-2 text-[11px] text-[color:var(--faint)]">
        <span className="font-medium text-[color:var(--ink)]">{presentCount}</span> {live ? "here" : "attending"} ·
        <span className="font-medium text-[color:var(--ink)]">{eligible.length - presentCount}</span> {live ? "not checked in" : "absent"} ·
        <span className="font-medium text-[color:var(--gold)]">{excused.length}</span> excused
      </div>
      <button type="submit" disabled={busy || (live && changes.length === 0)} className={btnDuskPrimaryCls}>
        {saveLabel}
      </button>
    </form>
  );
}

// Common excuse reasons — clicking one fills the textarea (still fully editable).
const EXCUSE_PRESETS = ["Sick", "Class conflict", "Work", "Family", "Travel"];

export function ExcuseForm({ event, bList, isAdmin, selfBrotherId, onDone }: {
  event: CalendarEvent;
  bList: Brother[];
  isAdmin: boolean;
  selfBrotherId: number | null;
  onDone: (result: { excuseStatus: "approved" | "pending" }) => void;
}) {
  // Default to an empty selection (not the first brother) so an admin must
  // consciously pick who the excuse is for — avoids approving for the wrong person.
  const [brotherId, setBrotherId] = useState<string>("");
  const [reason,    setReason]    = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = reason.trim();
    if (!trimmed) { setError("Please enter a reason."); return; }
    if (isAdmin && !brotherId) { setError("Pick a brother."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        calendarEventId: event.id,
        brotherId: isAdmin ? Number(brotherId) : selfBrotherId ?? undefined,
        reason: trimmed,
      };
      const res = await orgFetch("/api/excuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(typeof err?.error === "string" ? err.error : "Failed to submit excuse.");
        return;
      }
      const data = await res.json().catch(() => ({})) as { excuseStatus?: "approved" | "pending" };
      onDone({ excuseStatus: data.excuseStatus ?? (isAdmin ? "approved" : "pending") });
    } catch (e) {
      console.error("ExcuseForm submit failed:", e);
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-[rgba(var(--ink-rgb),0.08)] bg-[rgba(var(--ink-rgb),0.02)] px-3 py-2">
        <p className="text-[13px] font-semibold text-[color:var(--ink)]">{event.title}</p>
        <p className="text-[11px] text-[color:var(--faint)]">{event.date}{event.location ? ` · ${event.location}` : ""}</p>
      </div>
      {isAdmin && (
        <div>
          <FieldLabel tone="dusk">Brother</FieldLabel>
          <select value={brotherId} onChange={e => setBrotherId(e.target.value)} className={inputDuskCls} required>
            <option value="">Select…</option>
            {bList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <FieldLabel tone="dusk">Reason</FieldLabel>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {EXCUSE_PRESETS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setReason(p)}
              className="rounded-full border border-[rgba(var(--ink-rgb),0.14)] px-2.5 py-1 text-[11px] text-[color:var(--ink-soft)] hover:border-[color:var(--vio)]/50 hover:text-[color:var(--ink)] transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={3} placeholder="Why are you (or this brother) missing this event?" className={inputDuskCls} maxLength={1000} />
        <p className="mt-1 text-right text-[10px] text-[color:var(--faint)]">{reason.length}/1000</p>
      </div>
      {!isAdmin && (
        <p className="text-[11px] text-[color:var(--faint)]">Submissions are reviewed by chapter admins.</p>
      )}
      {error && <p className="text-[12px] text-[color:var(--rose)]">{error}</p>}
      <button type="submit" disabled={submitting} className={btnDuskPrimaryCls}>
        {submitting ? "Submitting…" : isAdmin ? "Approve Excuse" : "Submit for Review"}
      </button>
    </form>
  );
}
