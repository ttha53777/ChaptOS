import React, { useState } from "react";
import type { Brother, TaskStatus } from "../../data";
import { FieldLabel } from "./primitives";
import { inputCls } from "./styles";

export function AddDeadlineForm({ brotherNames, onSubmit, initial }: {
  brotherNames: string[];
  onSubmit: (d: { title: string; dueDate: string; owner: string; status: TaskStatus }) => void;
  initial?: { title: string; dueDate: string; owner: string; status: TaskStatus };
}) {
  const [title,   setTitle]   = useState(initial?.title   ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [owner,   setOwner]   = useState(initial?.owner   ?? brotherNames[0] ?? "");
  const [status,  setStatus]  = useState<TaskStatus>(initial?.status ?? "Upcoming");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    onSubmit({ title: title.trim(), dueDate, owner, status });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><FieldLabel>Title</FieldLabel><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Deadline title…" required /></div>
      <div><FieldLabel>Due Date</FieldLabel><input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
      <div>
        <FieldLabel>Owner</FieldLabel>
        <select className={inputCls} value={owner} onChange={e => setOwner(e.target.value)}>
          {brotherNames.map(n => <option key={n}>{n}</option>)}
        </select>
      </div>
      <div>
        <FieldLabel>Status</FieldLabel>
        <select className={inputCls} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
          {(["Upcoming", "Due Soon", "Urgent", "Complete"] as TaskStatus[]).map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
        {initial ? "Save Changes" : "Add Deadline"}
      </button>
    </form>
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

export function AddIGTaskForm({ brotherNames, onSubmit, initial }: {
  brotherNames: string[];
  onSubmit: (t: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) => void;
  initial?: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus };
}) {
  const [title,   setTitle]   = useState(initial?.title   ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [owner,   setOwner]   = useState(initial?.owner   ?? brotherNames[0] ?? "");
  const [type,    setType]    = useState(initial?.type    ?? "Feed Post");
  const [status,  setStatus]  = useState<TaskStatus>(initial?.status ?? "Upcoming");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    onSubmit({ title: title.trim(), dueDate, owner, type, status });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><FieldLabel>Post Title</FieldLabel><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Post name…" required /></div>
      <div><FieldLabel>Due Date</FieldLabel><input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} required /></div>
      <div>
        <FieldLabel>Owner</FieldLabel>
        <select className={inputCls} value={owner} onChange={e => setOwner(e.target.value)}>
          {brotherNames.map(n => <option key={n}>{n}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Type</FieldLabel>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
            {["Feed Post", "Reel", "Story + Feed", "Carousel", "Story"].map(t => <option key={t}>{t}</option>)}
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

export function LogAttendanceForm({ bList, onSubmit }: {
  bList: Brother[];
  onSubmit: (attended: Set<number>) => void;
}) {
  const [attended, setAttended] = useState<Set<number>>(new Set(bList.map(b => b.id)));

  function toggle(id: number) {
    setAttended(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(attended);
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-4 text-[12px] text-slate-400">Check brothers who attended. Attended +2%, absent −3%.</p>
      <div className="mb-4 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-white/[0.07] bg-[#0a0d14] p-2">
        {bList.map(b => (
          <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.05] transition-colors">
            <input type="checkbox" checked={attended.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4 rounded border-white/20 bg-transparent text-indigo-500 focus:ring-indigo-500/30" />
            <span className="flex-1 text-[13px] font-medium text-white">{b.name}</span>
            <span className="text-[11px] tabular-nums text-slate-500">{b.attendance}%</span>
          </label>
        ))}
      </div>
      <div className="mb-4 flex gap-2 text-[11px] text-slate-500">
        <span className="font-medium text-white">{attended.size}</span> attending ·
        <span className="font-medium text-white">{bList.length - attended.size}</span> absent
      </div>
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">Log Attendance</button>
    </form>
  );
}
