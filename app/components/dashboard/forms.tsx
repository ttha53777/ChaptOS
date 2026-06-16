import React, { useState, useEffect } from "react";
import type { Brother, CalendarEvent, InstagramType, TaskStatus } from "../../data";
import { FieldLabel } from "./primitives";
import { inputCls } from "./styles";
import { orgFetch } from "../../lib/api";
import { parseProgrammingTitle } from "@/lib/programming";
import { INSTAGRAM_TYPES } from "@/lib/validation/instagram";
import "./add-deadline-form.css";

/** Status chips, in due-urgency order, each carrying its dusk dot color. */
const DEADLINE_STATUSES: { id: TaskStatus; cvar: string }[] = [
  { id: "Upcoming", cvar: "var(--s-upcoming)" },
  { id: "Due Soon", cvar: "var(--s-soon)" },
  { id: "Urgent",   cvar: "var(--s-urgent)" },
  { id: "Complete", cvar: "var(--s-complete)" },
];

export function AddDeadlineForm({ brotherNames, onSubmit, initial, igEnabled = false }: {
  brotherNames: string[];
  onSubmit: (d: { title: string; dueDate: string; owner: string; status: TaskStatus; isPost: boolean; postType: InstagramType }) => void;
  initial?: { title: string; dueDate: string; owner: string; status: TaskStatus };
  /** When the org's Instagram page is visible, offer to log this deadline as a post instead. */
  igEnabled?: boolean;
}) {
  const [title,   setTitle]   = useState(initial?.title   ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [owner,   setOwner]   = useState(initial?.owner   ?? brotherNames[0] ?? "");
  const [status,  setStatus]  = useState<TaskStatus>(initial?.status ?? "Upcoming");
  const [isPost,   setIsPost]   = useState(false);
  const [postType, setPostType] = useState<InstagramType>(INSTAGRAM_TYPES[0]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    onSubmit({ title: title.trim(), dueDate, owner, status, isPost: igEnabled && isPost, postType });
  }

  // Mounted inside <Modal tone="dusk">; `.adf-root` carries the dusk tokens only
  // (no page-wrapper layout) so the form sits flush in the warm-paper Modal body.
  return (
    <div className="adf-root">
      <form onSubmit={handleSubmit} className="adf">
        {/* Title — the one thing every deadline needs */}
        <div className="adf-field">
          <label className="adf-label" htmlFor="deadline-title">Title</label>
          <input
            id="deadline-title"
            className="adf-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Deadline title…"
            autoFocus
            required
          />
        </div>

        {/* When & who — due date grows, owner sits beside it */}
        <div className="adf-when">
          <div className="adf-field">
            <label className="adf-label" htmlFor="deadline-due">Due Date</label>
            <input id="deadline-due" type="date" className="adf-input" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
          </div>
          <div className="adf-field">
            <label className="adf-label" htmlFor="deadline-owner">Owner</label>
            <select id="deadline-owner" className="adf-select" value={owner} onChange={e => setOwner(e.target.value)}>
              {brotherNames.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Status — color-coded chips matching the dashboard task badges */}
        <div className="adf-field">
          <span className="adf-label">Status</span>
          <div className="adf-chips" role="radiogroup" aria-label="Status">
            {DEADLINE_STATUSES.map(s => {
              const selected = status === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setStatus(s.id)}
                  className={`adf-chip${selected ? " on" : ""}`}
                  style={{ ["--cdot" as string]: s.cvar }}
                >
                  <span className="dot" />
                  {s.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Instagram post — only when the org's Instagram page is visible. Checking
            this logs the deadline as an Instagram task so it lands on that page too. */}
        {igEnabled && (
          <div className="adf-field">
            <label className="adf-post-toggle">
              <input type="checkbox" checked={isPost} onChange={e => setIsPost(e.target.checked)} />
              <span>This is an Instagram post</span>
            </label>
            {isPost && (
              <div className="adf-field" style={{ marginTop: 4 }}>
                <label className="adf-label" htmlFor="deadline-post-type">Post Type</label>
                <select id="deadline-post-type" className="adf-select" value={postType} onChange={e => setPostType(e.target.value as InstagramType)}>
                  {INSTAGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <button type="submit" className="adf-submit">
          {initial ? "Save Changes" : isPost ? "Add Post" : "Add Deadline"}
        </button>
      </form>
    </div>
  );
}

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
      <div><FieldLabel>Event Name</FieldLabel><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Spring Kickback…" required /></div>
      <div><FieldLabel>Date</FieldLabel><input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>Door Revenue ($)</FieldLabel><input type="number" min="0" className={inputCls} value={doorRevenue} onChange={e => setDoorRevenue(e.target.value)} placeholder="0" required /></div>
        <div><FieldLabel>Attendance</FieldLabel><input type="number" min="0" className={inputCls} value={attendance} onChange={e => setAttendance(e.target.value)} placeholder="0" /></div>
      </div>
      <div><FieldLabel>Notes</FieldLabel><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" /></div>
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">Log Revenue</button>
    </form>
  );
}

export function AddIGTaskForm({ onSubmit, initial }: {
  onSubmit: (t: { title: string; dueDate: string; type: InstagramType; status: TaskStatus }) => void;
  initial?: { title: string; dueDate: string; type: InstagramType; status: TaskStatus };
}) {
  const [title,   setTitle]   = useState(initial?.title   ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [type,    setType]    = useState<InstagramType>(initial?.type ?? "Story");
  const [status,  setStatus]  = useState<TaskStatus>(initial?.status ?? "Upcoming");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    onSubmit({ title: title.trim(), dueDate, type, status });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><FieldLabel>Post Title</FieldLabel><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Post name…" required /></div>
      <div><FieldLabel>Due Date</FieldLabel><input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Type</FieldLabel>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value as InstagramType)}>
            {INSTAGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
            {(["Upcoming", "Due Soon", "Urgent"] as TaskStatus[]).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
        {initial ? "Save Changes" : "Add IG Task"}
      </button>
    </form>
  );
}

export function AddProgrammingTaskForm({ onSubmit, initial }: {
  onSubmit: (t: { title: string; dueDate: string | null; location: string | null; time?: string | null; collab?: string | null; type: string; status: TaskStatus }) => void;
  initial?: { title: string; dueDate: string | null; location: string; time?: string | null; collab?: string | null; type: string; status: TaskStatus };
}) {
  const parsedInitial = initial ? parseProgrammingTitle(initial.title) : null;
  const [title,    setTitle]    = useState(parsedInitial?.title ?? initial?.title ?? "");
  const [dueDate,  setDueDate]  = useState(initial?.dueDate  ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [time,     setTime]     = useState(initial?.time     ?? "");
  const [collab,   setCollab]   = useState(initial?.collab ?? parsedInitial?.collab ?? "");
  const [type,     setType]     = useState(initial?.type      ?? "Program");
  const [status,   setStatus]   = useState<TaskStatus>(initial?.status ?? "Upcoming");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      dueDate: dueDate || null,
      location: location.trim() || null,
      time: time.trim() || null,
      collab: collab.trim() || null,
      type,
      status,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><FieldLabel>Event Title</FieldLabel><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Event name…" required /></div>
      <div><FieldLabel>Collab <span className="font-normal text-slate-500">(optional)</span></FieldLabel><input className={inputCls} value={collab} onChange={e => setCollab(e.target.value)} placeholder="KDF, DSP…" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>Event Date <span className="font-normal text-slate-500">(optional)</span></FieldLabel><input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        <div><FieldLabel>Time <span className="font-normal text-slate-500">(optional)</span></FieldLabel><input className={inputCls} value={time} onChange={e => setTime(e.target.value)} placeholder="7:00 PM" /></div>
      </div>
      <div><FieldLabel>Where <span className="font-normal text-slate-500">(optional)</span></FieldLabel><input className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="Student Union, Room 204…" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Type</FieldLabel>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
            {["Program", "Social", "Fundraiser", "Community Service"].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
            {(["Upcoming", "Due Soon", "Urgent"] as TaskStatus[]).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
        {initial ? "Save Changes" : "Add Event"}
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

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-1 text-[13px] font-semibold text-white">{event.title}</p>
      <p className="mb-4 text-[12px] text-slate-400">{event.date}{event.location ? ` · ${event.location}` : ""}</p>
      {loading ? (
        <p className="mb-4 text-[12px] text-slate-500">Loading excuses…</p>
      ) : (
        <div className="mb-4 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-white/[0.07] bg-[#0a0d14] p-2">
          {eligible.map(b => (
            <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.05] transition-colors">
              <input type="checkbox" checked={attended.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4 rounded border-white/20 bg-transparent text-indigo-500 focus:ring-indigo-500/30" />
              <span className="flex-1 text-[13px] font-medium text-white">{b.name}</span>
              <span className="text-[11px] tabular-nums text-slate-500">{b.attendance}%</span>
            </label>
          ))}
          {excused.map(b => (
            <div key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-2 opacity-50">
              <input type="checkbox" disabled className="h-4 w-4 rounded border-white/20 bg-transparent" />
              <span className="flex-1 text-[13px] font-medium text-slate-400">{b.name}</span>
              <span className="text-[10px] font-semibold text-amber-400">Excused</span>
            </div>
          ))}
        </div>
      )}
      <div className="mb-4 flex gap-2 text-[11px] text-slate-500">
        <span className="font-medium text-white">{attended.size}</span> attending ·
        <span className="font-medium text-white">{eligible.length - attended.size}</span> absent ·
        <span className="font-medium text-amber-400">{excused.length}</span> excused
      </div>
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50">
        {submitting ? "Saving…" : "Log Attendance"}
      </button>
    </form>
  );
}

export function ExcuseForm({ event, bList, isAdmin, selfBrotherId, onDone }: {
  event: CalendarEvent;
  bList: Brother[];
  isAdmin: boolean;
  selfBrotherId: number | null;
  onDone: (result: { excuseStatus: "approved" | "pending" }) => void;
}) {
  const adminDefault = bList[0]?.id != null ? String(bList[0].id) : "";
  const [brotherId, setBrotherId] = useState<string>(isAdmin ? adminDefault : "");
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
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
        <p className="text-[13px] font-semibold text-white">{event.title}</p>
        <p className="text-[11px] text-slate-500">{event.date}{event.location ? ` · ${event.location}` : ""}</p>
      </div>
      {isAdmin && (
        <div>
          <FieldLabel>Brother</FieldLabel>
          <select value={brotherId} onChange={e => setBrotherId(e.target.value)} className={inputCls} required>
            <option value="">Select…</option>
            {bList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <FieldLabel>Reason</FieldLabel>
        <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={3} placeholder="Why are you (or this brother) missing this event?" className={inputCls} maxLength={1000} />
      </div>
      {!isAdmin && (
        <p className="text-[11px] text-slate-500">Submissions are reviewed by chapter admins.</p>
      )}
      {error && <p className="text-[12px] text-red-400">{error}</p>}
      <button type="submit" disabled={submitting} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50">
        {submitting ? "Submitting…" : isAdmin ? "Approve Excuse" : "Submit for Review"}
      </button>
    </form>
  );
}
