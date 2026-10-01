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

export function LogAttendanceForm({ event, bList, onSubmit }: {
  event: CalendarEvent;
  bList: Brother[];
  onSubmit: (attendedIds: number[], eventId: number) => Promise<void> | void;
}) {
  const [excusedIds, setExcusedIds] = useState<Set<number>>(new Set());
  const [attended,   setAttended]   = useState<Set<number>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [query,      setQuery]      = useState("");
  // Stable ref so the effect doesn't re-run just because the array object changed
  const bListRef = React.useRef(bList);
  bListRef.current = bList;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    orgFetch(`/api/attendance/${event.id}`, { signal: controller.signal })
      .then(r => r.json())
      .then((data: { excused: { brotherId: number }[]; attended: { brotherId: number }[] }) => {
        const excusedIds = new Set(data.excused.map((e: { brotherId: number }) => e.brotherId));
        setExcusedIds(excusedIds);
        // Pre-fill from existing log if available; otherwise default all eligible to attended
        if (data.attended && data.attended.length > 0) {
          setAttended(new Set(data.attended.map((e: { brotherId: number }) => e.brotherId)));
        } else {
          setAttended(new Set(bListRef.current.filter(b => !excusedIds.has(b.id)).map(b => b.id)));
        }
      })
      .catch(err => { if (err.name !== "AbortError") console.error("Failed to load excuses", err); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [event.id]); // bList intentionally excluded — captured via ref

  function toggle(id: number) {
    setAttended(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function markAll(value: boolean) {
    // Eligible (non-excused) only — excused brothers are never in the present set.
    setAttended(value ? new Set(bList.filter(b => !excusedIds.has(b.id)).map(b => b.id)) : new Set());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(Array.from(attended), event.id);
    } finally {
      setSubmitting(false);
    }
  }

  const eligible = bList.filter(b => !excusedIds.has(b.id));
  const excused  = bList.filter(b => excusedIds.has(b.id));
  const busy = loading || submitting;
  const q = query.trim().toLowerCase();
  const visibleEligible = q ? eligible.filter(b => b.name.toLowerCase().includes(q)) : eligible;
  const visibleExcused  = q ? excused.filter(b => b.name.toLowerCase().includes(q)) : excused;

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-1 text-[13px] font-semibold text-[color:var(--ink)]">{event.title}</p>
      <p className="mb-4 text-[12px] text-[color:var(--muted)]">{event.date}{event.location ? ` · ${event.location}` : ""}</p>
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
          <button type="button" onClick={() => markAll(true)} className="text-[11px] font-medium text-[color:var(--vio)] hover:text-[color:var(--ink)]">All present</button>
          <button type="button" onClick={() => markAll(false)} className="text-[11px] font-medium text-[color:var(--muted)] hover:text-[color:var(--ink)]">Clear</button>
        </div>
      )}
      {loading ? (
        <p className="mb-4 text-[12px] text-[color:var(--faint)]">Loading excuses…</p>
      ) : (
        <div className="mb-4 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-[rgba(var(--ink-rgb),0.08)] bg-[color:var(--paper)] p-2">
          {q && visibleEligible.length === 0 && visibleExcused.length === 0 && (
            <p className="px-2 py-2 text-[12px] text-[color:var(--faint)]">No brothers match “{query}”.</p>
          )}
          {visibleEligible.map(b => (
            <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-[rgba(var(--ink-rgb),0.05)] transition-colors">
              <input type="checkbox" checked={attended.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4 rounded border-[rgba(var(--ink-rgb),0.2)] bg-transparent text-[color:var(--vio)] focus:ring-[color:var(--vio)]/30" />
              <span className="flex-1 text-[13px] font-medium text-[color:var(--ink)]">{b.name}</span>
              <span className="text-[11px] tabular-nums text-[color:var(--faint)]">{b.attendance}%</span>
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
        <span className="font-medium text-[color:var(--ink)]">{attended.size}</span> attending ·
        <span className="font-medium text-[color:var(--ink)]">{eligible.length - attended.size}</span> absent ·
        <span className="font-medium text-[color:var(--gold)]">{excused.length}</span> excused
      </div>
      <button type="submit" disabled={busy} className={btnDuskPrimaryCls}>
        {submitting ? "Saving…" : "Log Attendance"}
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
