"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Brother, BrotherStatus, TaskStatus, ActivityEntry, PartyEvent,
  brothers, deadlines, instagramTasks, partyEvents,
  treasuryTrend, TREASURY_BALANCE, TREASURY_PROJECTED, THRESHOLDS,
  seedActivity, KPI_SPARKLINES,
  getBrotherStatus, calcHealthScore, avg, fmt$, fmtDate,
} from "./data";

// ─── Style maps ───────────────────────────────────────────────────────────────

const BROTHER_STYLES: Record<BrotherStatus, { badge: string; row: string }> = {
  "Good":    { badge: "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25", row: "border-l-emerald-400" },
  "Watch":   { badge: "bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/25",       row: "border-l-amber-400"   },
  "At Risk": { badge: "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/25",             row: "border-l-red-500"     },
};

const TASK_STYLES: Record<TaskStatus, string> = {
  "Urgent":   "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/25",
  "Due Soon": "bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/25",
  "Upcoming": "bg-slate-500/15 text-slate-400 ring-1 ring-inset ring-slate-500/20",
  "Complete": "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25",
};

// ─── Atoms ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BrotherStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${BROTHER_STYLES[status].badge}`}>
      {status}
    </span>
  );
}

function TaskBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${TASK_STYLES[status]}`}>
      {status}
    </span>
  );
}

function Card({ children, className = "", id, onClick }: { children: React.ReactNode; className?: string; id?: string; onClick?: () => void }) {
  return (
    <div id={id} onClick={onClick} className={`rounded-xl border border-white/[0.07] bg-[#161b27] ${className}`}>
      {children}
    </div>
  );
}

function SvgIcon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ─── Icon paths ───────────────────────────────────────────────────────────────

const NAV_ICONS: Record<string, string> = {
  Dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  Brothers:  "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  Deadlines: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  Instagram: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  Treasury:  "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  Parties:   "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
  Settings:  "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

const KPI_ICONS: Record<string, string> = {
  attendance: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  dues:       "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  gpa:        "M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z",
  service:    "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  treasury:   "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  door:       "M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z",
};

// ─── Section IDs ─────────────────────────────────────────────────────────────

const SECTION_IDS: Record<string, string> = {
  Dashboard: "sec-dashboard",
  Brothers:  "sec-brothers",
  Deadlines: "sec-deadlines",
  Instagram: "sec-instagram",
  Treasury:  "sec-treasury",
  Parties:   "sec-parties",
  Settings:  "sec-settings",
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV = ["Dashboard", "Brothers", "Deadlines", "Instagram", "Treasury", "Parties", "Settings"];

function Sidebar({ open, onClose, activeSection, onNavClick }: {
  open: boolean;
  onClose: () => void;
  activeSection: string;
  onNavClick: (label: string) => void;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-[#0d1117] transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-14 items-center gap-3 border-b border-white/[0.06] px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-bold text-white">ΛΦΕ</div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold leading-tight text-white">Lambda Phi Epsilon</p>
            <p className="text-[10px] leading-tight text-white/35">Spring 2026</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Dashboard navigation">
          <div className="space-y-0.5">
            {NAV.map(label => {
              const isActive = activeSection === label;
              return (
                <button
                  key={label}
                  onClick={() => { onNavClick(label); onClose(); }}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "text-white/40 hover:bg-white/[0.05] hover:text-white/70"
                  }`}
                >
                  <SvgIcon d={NAV_ICONS[label] ?? ""} className="h-4 w-4 shrink-0 opacity-75" />
                  {label}
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="text-[10px] text-white/20">Chapter Ops · v1.0</p>
        </div>
      </aside>
    </>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#161b27] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.08] hover:text-white transition-colors">
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Form field primitives ────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[12px] font-medium text-slate-400">{children}</label>;
}

const inputCls = "w-full rounded-lg border border-white/[0.1] bg-[#0d1117] px-3 py-2 text-[13px] text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/15";

// ─── Add Deadline form ────────────────────────────────────────────────────────

function AddDeadlineForm({ brotherNames, onSubmit }: {
  brotherNames: string[];
  onSubmit: (d: { title: string; dueDate: string; owner: string; status: TaskStatus }) => void;
}) {
  const [title,   setTitle]   = useState("");
  const [dueDate, setDueDate] = useState("");
  const [owner,   setOwner]   = useState(brotherNames[0] ?? "");
  const [status,  setStatus]  = useState<TaskStatus>("Upcoming");

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
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">Add Deadline</button>
    </form>
  );
}

// ─── Add Revenue form ─────────────────────────────────────────────────────────

function AddRevenueForm({ onSubmit }: {
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

// ─── Add IG Task form ─────────────────────────────────────────────────────────

function AddIGTaskForm({ brotherNames, onSubmit }: {
  brotherNames: string[];
  onSubmit: (t: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) => void;
}) {
  const [title,   setTitle]   = useState("");
  const [dueDate, setDueDate] = useState("");
  const [owner,   setOwner]   = useState(brotherNames[0] ?? "");
  const [type,    setType]    = useState("Feed Post");
  const [status,  setStatus]  = useState<TaskStatus>("Upcoming");

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
      <button type="submit" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">Add IG Task</button>
    </form>
  );
}

// ─── Log Attendance form ──────────────────────────────────────────────────────

function LogAttendanceForm({ bList, onSubmit }: {
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
      <div className="mb-4 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-white/[0.07] bg-[#0d1117] p-2">
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

// ─── Chapter Health Score ─────────────────────────────────────────────────────

function HealthScoreWidget({ score, label, breakdown, delta, onExpand }: {
  score: number;
  label: "Healthy" | "Needs Attention" | "Critical";
  breakdown: Record<string, number>;
  delta: number | null;
  onExpand?: () => void;
}) {
  const ringColor = score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  const circleBg  = score >= 80 ? "bg-emerald-500/15" : score >= 60 ? "bg-amber-500/15" : "bg-red-500/15";
  const accentBar = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  const sub       = score >= 80 ? "All systems operational" : score >= 60 ? "Some areas need attention" : "Immediate action required";

  return (
    <Card className="overflow-hidden">
      <div className={`h-[3px] ${accentBar}`} />
        <div className="flex flex-wrap items-center gap-5 px-5 py-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${circleBg}`}>
          <span className={`text-[22px] font-bold tabular-nums leading-none ${ringColor}`}>{score}</span>
        </div>
        <div className="min-w-[140px] flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[15px] font-bold ${ringColor}`}>{label}</span>
            {delta !== null && (
              <span className={`text-[11px] font-semibold ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {delta >= 0 ? "↑" : "↓"}{Math.abs(delta)} pts
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">{sub}</p>
          <p className="mt-0.5 text-[10px] text-slate-600">Chapter health score · 0–100</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2">
          {Object.entries(breakdown).map(([k, v]) => (
            <div key={k} className="min-w-[90px] flex-1">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-500">{k}</span>
                <span className="text-[10px] tabular-nums text-slate-400">{v}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${v}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {onExpand && (
          <button onClick={onExpand} className="shrink-0 flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors self-center">
            Details
            <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, trend, iconKey, sparkData, accent = "text-white", iconBg = "bg-indigo-500/10", iconColor = "text-indigo-400", strokeColor = "#6366f1", onClick }: {
  label: string; value: string; trend: string; iconKey: string; sparkData: number[];
  accent?: string; iconBg?: string; iconColor?: string; strokeColor?: string;
  onClick?: () => void;
}) {
  const chartData = sparkData.map((v, i) => ({ i, v }));
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <SvgIcon d={KPI_ICONS[iconKey] ?? ""} className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">{label}</p>
          <p className={`mt-0.5 text-[22px] font-bold leading-none tracking-tight ${accent}`}>{value}</p>
          <p className="mt-1 truncate text-[11px] leading-snug text-slate-400">{trend}</p>
        </div>
      </div>
      <div className="mt-2 -mx-1">
        <ResponsiveContainer width="100%" height={28}>
          <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Line type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {onClick && (
        <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <span className="text-[10px] text-slate-600">View details</span>
          <svg className="h-3 w-3 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="rounded-xl border border-white/[0.07] bg-[#161b27] flex flex-col p-4 w-full text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.18] cursor-pointer group hover:bg-[#1c2235]">
        {inner}
      </button>
    );
  }
  return (
    <Card className="flex flex-col p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.18] cursor-default">
      {inner}
    </Card>
  );
}

// ─── Chart Widget ─────────────────────────────────────────────────────────────

function ChartWidget({ title, stat, caption, children }: {
  title: string; stat: string; caption: string; children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between px-4 pt-4 pb-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-0.5 text-[17px] font-bold tracking-tight text-white">{stat}</p>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">{caption}</p>
      </div>
      <div className="px-1 pb-3">{children}</div>
    </Card>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ entries, onExpand }: { entries: ActivityEntry[]; onExpand?: () => void }) {
  const dot: Record<ActivityEntry["type"], string> = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    info:    "bg-blue-400",
  };

  return (
    <Card className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={onExpand}>
      <div className="h-[3px] bg-emerald-500/50" />
      <div className="border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-white">Activity Feed</h2>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
            {onExpand && (
              <button onClick={(e) => { e.stopPropagation(); onExpand(); }} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-300 transition-colors">
                All
                <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[12px] text-slate-500">No recent activity</p>
        </div>
      ) : (
        <div className="max-h-[220px] overflow-y-auto divide-y divide-white/[0.04]">
          {entries.map(e => (
            <div key={e.id} className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.type]}`} />
              <p className="flex-1 text-[12px] leading-snug text-slate-300">{e.message}</p>
              <span className="shrink-0 text-[10px] text-slate-500">{e.timestamp}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── AttBar ───────────────────────────────────────────────────────────────────

function AttBar({ pct }: { pct: number }) {
  const bar  = pct >= THRESHOLDS.attendanceWatch ? "bg-emerald-400" : pct >= THRESHOLDS.attendanceAtRisk ? "bg-amber-400" : "bg-red-400";
  const text = pct >= THRESHOLDS.attendanceWatch ? "text-white" : pct >= THRESHOLDS.attendanceAtRisk ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`tabular-nums text-[13px] font-medium ${text}`}>{pct}%</span>
    </div>
  );
}

// ─── SortTh ───────────────────────────────────────────────────────────────────

function SortTh({ label, active, dir, onClick }: {
  label: string; colKey: keyof Brother; active: boolean; dir: "asc" | "desc"; onClick: () => void;
}) {
  return (
    <th onClick={onClick} className="group cursor-pointer select-none px-3 py-2.5 text-left">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 transition-colors group-hover:text-slate-300">
        {label}
        <span className={`transition-opacity ${active ? "opacity-100 text-slate-400" : "opacity-0 group-hover:opacity-40"}`}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </span>
    </th>
  );
}

// ─── Chart tooltip style (shared) ─────────────────────────────────────────────

const tooltipStyle = {
  background: "#1a2035",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 8,
  fontSize: 11,
  color: "#cbd5e1",
};

// ─── Activity ID counter (module-level, reset-safe) ───────────────────────────

let _nextId = seedActivity.length + 1;

// ─── KPI Drawer ───────────────────────────────────────────────────────────────

type KPIDrawerKey = "attendance" | "dues" | "gpa" | "service" | "treasury" | "door";

const DRAWER_CONFIGS: Record<KPIDrawerKey, { title: string; accent: string; iconKey: string; iconBg: string; iconColor: string }> = {
  attendance: { title: "Avg Attendance",   accent: "text-blue-400",    iconKey: "attendance", iconBg: "bg-blue-500/10",    iconColor: "text-blue-400"    },
  dues:       { title: "Outstanding Dues", accent: "text-amber-400",   iconKey: "dues",       iconBg: "bg-amber-500/10",   iconColor: "text-amber-400"   },
  gpa:        { title: "Chapter GPA",      accent: "text-violet-400",  iconKey: "gpa",        iconBg: "bg-violet-500/10",  iconColor: "text-violet-400"  },
  service:    { title: "Service Hours",    accent: "text-emerald-400", iconKey: "service",    iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400" },
  treasury:   { title: "Treasury Balance", accent: "text-indigo-400",  iconKey: "treasury",   iconBg: "bg-indigo-500/10",  iconColor: "text-indigo-400"  },
  door:       { title: "Door Revenue",     accent: "text-pink-400",    iconKey: "door",       iconBg: "bg-pink-500/10",    iconColor: "text-pink-400"    },
};

function KPIDetailDrawer({
  activeKey, onClose,
  brotherList, partyList,
  payDues, addServiceHour,
  avgAttendance, outstandingDues, chapterGPA,
  totalServiceHrs, onTrackSvc,
  totalDoorRev, maxRevenue, bestEvent,
  onOpenModal,
}: {
  activeKey: KPIDrawerKey | null;
  onClose: () => void;
  brotherList: Brother[];
  partyList: PartyEvent[];
  payDues: (b: Brother) => void;
  addServiceHour: (b: Brother) => void;
  avgAttendance: number;
  outstandingDues: number;
  chapterGPA: number;
  totalServiceHrs: number;
  onTrackSvc: number;
  totalDoorRev: number;
  maxRevenue: number;
  bestEvent: PartyEvent;
  onOpenModal: (key: "attendance") => void;
}) {
  const isOpen = activeKey !== null;
  const cfg = activeKey ? DRAWER_CONFIGS[activeKey] : null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  function renderContent() {
    if (!activeKey) return null;

    switch (activeKey) {
      case "attendance": {
        const sorted = [...brotherList].sort((a, b) => a.attendance - b.attendance);
        const belowWatch = brotherList.filter(b => b.attendance < THRESHOLDS.attendanceWatch);
        const atRisk = brotherList.filter(b => b.attendance < THRESHOLDS.attendanceAtRisk);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-blue-400 tabular-nums">{avgAttendance.toFixed(1)}%</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Chapter avg</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-amber-400 tabular-nums">{belowWatch.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Below 80%</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-red-400 tabular-nums">{atRisk.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">At risk</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All Brothers — Lowest First</p>
            <div className="space-y-1.5 mb-5">
              {sorted.map(b => {
                const bar = b.attendance >= THRESHOLDS.attendanceWatch ? "bg-emerald-400" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "bg-amber-400" : "bg-red-400";
                const col = b.attendance >= THRESHOLDS.attendanceWatch ? "text-white" : b.attendance >= THRESHOLDS.attendanceAtRisk ? "text-amber-400" : "text-red-400";
                return (
                  <div key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
                    <span className="w-24 shrink-0 truncate text-[12px] font-medium text-slate-300">{b.name.split(" ")[0]}</span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${b.attendance}%` }} />
                    </div>
                    <span className={`w-9 shrink-0 text-right tabular-nums text-[12px] font-semibold ${col}`}>{b.attendance}%</span>
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5 mb-3">
              <p className="text-[11px] text-indigo-300">
                {atRisk.length > 0
                  ? <><span className="font-semibold">{atRisk.length} brother{atRisk.length > 1 ? "s" : ""} need{atRisk.length === 1 ? "s" : ""} immediate follow-up.</span>{" "}Attendance goal is 80%+.</>
                  : "No brothers are at attendance risk. Chapter goal is 80%+."
                }
              </p>
            </div>
            <button onClick={() => { onOpenModal("attendance"); onClose(); }} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors">
              Log Chapter Meeting
            </button>
          </>
        );
      }

      case "dues": {
        const oweList = brotherList.filter(b => b.duesOwed > 0);
        const paidList = brotherList.filter(b => b.duesOwed === 0);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-amber-400 tabular-nums">{fmt$(outstandingDues)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total owed</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-red-400 tabular-nums">{oweList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Brothers owe</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-emerald-400 tabular-nums">{paidList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Paid up</p>
              </div>
            </div>
            {oweList.length > 0 && (
              <>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Outstanding Balances</p>
                <div className="space-y-2 mb-5">
                  {oweList.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/[0.07] px-3 py-2.5 border border-amber-500/20">
                      <div>
                        <p className="text-[13px] font-semibold text-white">{b.name}</p>
                        <p className="text-[11px] text-slate-500">{b.role.split(" · ")[0]}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[14px] font-bold text-amber-400 tabular-nums">{fmt$(b.duesOwed)}</span>
                        <button onClick={() => payDues(b)} className="rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 hover:bg-emerald-500/25 transition-colors">Pay</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {paidList.length > 0 && (
              <>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Paid Up ({paidList.length})</p>
                <div className="space-y-1 mb-4">
                  {paidList.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 hover:bg-white/[0.02] transition-colors">
                      <p className="text-[12px] text-slate-400">{b.name}</p>
                      <span className="text-[11px] text-emerald-400 font-medium">✓ Clear</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {outstandingDues === 0 && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-3 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All brothers are paid up.</p>
              </div>
            )}
          </>
        );
      }

      case "gpa": {
        const sorted = [...brotherList].sort((a, b) => a.gpa - b.gpa);
        const belowWatch = brotherList.filter(b => b.gpa < THRESHOLDS.gpaWatch);
        const atRisk = brotherList.filter(b => b.gpa < THRESHOLDS.gpaAtRisk);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-violet-400 tabular-nums">{chapterGPA.toFixed(2)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Chapter avg</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-amber-400 tabular-nums">{belowWatch.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Below 3.0</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-red-400 tabular-nums">{atRisk.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">At risk</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All Brothers — Lowest First</p>
            <div className="space-y-1.5 mb-5">
              {sorted.map(b => {
                const col = b.gpa < THRESHOLDS.gpaAtRisk ? "text-red-400" : b.gpa < THRESHOLDS.gpaWatch ? "text-amber-400" : "text-white";
                const bar = b.gpa < THRESHOLDS.gpaAtRisk ? "bg-red-400" : b.gpa < THRESHOLDS.gpaWatch ? "bg-amber-400" : "bg-violet-400";
                const barPct = Math.round(Math.max(5, ((b.gpa - 2.0) / 2.0) * 100));
                return (
                  <div key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
                    <span className="w-24 shrink-0 truncate text-[12px] font-medium text-slate-300">{b.name.split(" ")[0]}</span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <span className={`w-9 shrink-0 text-right tabular-nums text-[12px] font-semibold ${col}`}>{b.gpa.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
            {atRisk.length > 0 ? (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                <p className="text-[11px] text-red-300">
                  <span className="font-semibold">{atRisk.length} brother{atRisk.length > 1 ? "s" : ""} below 2.7 GPA</span> — consider academic check-in or intervention.
                </p>
              </div>
            ) : belowWatch.length > 0 ? (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                <p className="text-[11px] text-amber-300">
                  <span className="font-semibold">{belowWatch.length} brother{belowWatch.length > 1 ? "s" : ""} below 3.0</span> — monitor and encourage academic support.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All brothers meeting academic standards.</p>
              </div>
            )}
          </>
        );
      }

      case "service": {
        const sorted = [...brotherList].sort((a, b) => a.serviceHours - b.serviceHours);
        const belowGoal = brotherList.filter(b => b.serviceHours < THRESHOLDS.serviceHoursGoal);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-emerald-400 tabular-nums">{totalServiceHrs}h</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total hours</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-white tabular-nums">{onTrackSvc}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">On track</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-amber-400 tabular-nums">{belowGoal.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Below goal</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All Brothers — Fewest Hours First</p>
            <div className="space-y-1.5 mb-5">
              {sorted.map(b => {
                const isOnTrack = b.serviceHours >= THRESHOLDS.serviceHoursGoal;
                const barPct = Math.min(100, Math.round((b.serviceHours / THRESHOLDS.serviceHoursGoal) * 100));
                const bar = isOnTrack ? "bg-emerald-400" : "bg-amber-400";
                const col = isOnTrack ? "text-white" : "text-amber-400";
                const remaining = Math.max(0, THRESHOLDS.serviceHoursGoal - b.serviceHours);
                return (
                  <div key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03] transition-colors group">
                    <span className="w-20 shrink-0 truncate text-[12px] font-medium text-slate-300">{b.name.split(" ")[0]}</span>
                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <span className={`w-8 shrink-0 text-right tabular-nums text-[12px] font-semibold ${col}`}>{b.serviceHours}h</span>
                    {isOnTrack
                      ? <span className="text-[10px] text-emerald-500 w-10 shrink-0 text-right">✓</span>
                      : <span className="text-[10px] text-slate-600 w-10 shrink-0 text-right">-{remaining}h</span>
                    }
                    <button onClick={() => addServiceHour(b)} className="opacity-0 group-hover:opacity-100 shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-400 transition-all">+1h</button>
                  </div>
                );
              })}
            </div>
            {belowGoal.length > 0 ? (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
                <p className="text-[11px] text-amber-300">
                  <span className="font-semibold">{belowGoal.length} brother{belowGoal.length > 1 ? "s" : ""} still need{belowGoal.length === 1 ? "s" : ""} service hours</span> before the semester ends. Goal: {THRESHOLDS.serviceHoursGoal}h each.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All brothers have met the service hours goal!</p>
              </div>
            )}
          </>
        );
      }

      case "treasury": {
        const firstMonth = treasuryTrend[0];
        const lastMonth  = treasuryTrend[treasuryTrend.length - 1];
        const growth = lastMonth.balance - firstMonth.balance;
        const growthPct = Math.round((growth / firstMonth.balance) * 100);
        return (
          <>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-indigo-400 tabular-nums">{fmt$(TREASURY_BALANCE)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Current balance</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-emerald-400 tabular-nums">{fmt$(TREASURY_PROJECTED)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Projected end</p>
              </div>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Treasury Trend</p>
            <div className="mb-5">
              <ResponsiveContainer width="100%" height={110}>
                <AreaChart data={treasuryTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="drawerTGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v / 1000}k`} />
                  <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Balance"]} contentStyle={tooltipStyle} cursor={{ stroke: "#818cf8", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2} fill="url(#drawerTGrad)" dot={{ r: 3, fill: "#818cf8", stroke: "#131720", strokeWidth: 2 }} activeDot={{ r: 4, fill: "#818cf8", stroke: "#131720", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Monthly Breakdown</p>
            <div className="space-y-1.5 mb-5">
              {treasuryTrend.map((t, i) => {
                const prev = i > 0 ? treasuryTrend[i - 1].balance : t.balance;
                const delta = t.balance - prev;
                return (
                  <div key={t.month} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                    <span className="text-[12px] font-medium text-slate-300 w-8 shrink-0">{t.month}</span>
                    <div className="flex-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.round((t.balance / TREASURY_PROJECTED) * 100)}%` }} />
                    </div>
                    <span className="tabular-nums text-[12px] font-semibold text-white w-14 shrink-0 text-right">{fmt$(t.balance)}</span>
                    {i > 0 && (
                      <span className={`tabular-nums text-[10px] w-14 shrink-0 text-right ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {delta >= 0 ? "+" : ""}{fmt$(delta)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5">
              <p className="text-[11px] text-indigo-300">
                Treasury grew by <span className="font-semibold">{fmt$(growth)} ({growthPct}%)</span> this semester. Projected end balance: <span className="font-semibold">{fmt$(TREASURY_PROJECTED)}</span>.
              </p>
            </div>
          </>
        );
      }

      case "door": {
        const sortedEvents = [...partyList].sort((a, b) => b.doorRevenue - a.doorRevenue);
        const avgRevenue = partyList.length > 0 ? Math.round(totalDoorRev / partyList.length) : 0;
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-pink-400 tabular-nums">{fmt$(totalDoorRev)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total revenue</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-white tabular-nums">{partyList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Events</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-slate-300 tabular-nums">{fmt$(avgRevenue)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Avg/event</p>
              </div>
            </div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Revenue by Event — Best First</p>
            <div className="space-y-2.5 mb-5">
              {sortedEvents.map(e => {
                const barPct = maxRevenue > 0 ? Math.round((e.doorRevenue / maxRevenue) * 100) : 0;
                const isTop = e.id === bestEvent.id;
                return (
                  <div key={e.id} className={`rounded-lg px-3 py-2.5 ${isTop ? "bg-pink-500/[0.08] border border-pink-500/20" : "bg-white/[0.03] border border-white/[0.05]"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${isTop ? "text-pink-300" : "text-slate-300"}`}>
                        {isTop && <span className="text-[10px] bg-pink-500/20 text-pink-400 rounded px-1 py-0.5">Best</span>}
                        {e.name}
                      </p>
                      <span className="tabular-nums text-[13px] font-bold text-white shrink-0 ml-2">{fmt$(e.doorRevenue)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.07] mb-1.5">
                      <div className={`h-full rounded-full ${isTop ? "bg-pink-400" : "bg-white/[0.25]"}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-slate-500">{e.date}</span>
                      <span className="text-[10px] text-slate-500">{e.attendance} attendees</span>
                      {e.notes && <span className="text-[10px] text-slate-600 truncate">{e.notes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 px-3 py-2.5">
              <p className="text-[11px] text-pink-300">
                Best event: <span className="font-semibold">{bestEvent.name}</span> at <span className="font-semibold">{fmt$(bestEvent.doorRevenue)}</span>. Avg per event: <span className="font-semibold">{fmt$(avgRevenue)}</span>.
              </p>
            </div>
          </>
        );
      }

      default:
        return null;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#131720] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[400px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        {cfg && (
          <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
                <SvgIcon d={KPI_ICONS[cfg.iconKey] ?? ""} className={`h-4 w-4 ${cfg.iconColor}`} />
              </div>
              <h2 className={`flex-1 text-[15px] font-semibold ${cfg.accent}`}>{cfg.title}</h2>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white transition-colors">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {renderContent()}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Widget Drawer ────────────────────────────────────────────────────────────

type WidgetDrawerKey = "health" | "attention" | "deadlines" | "instagram" | "activity" | "parties";

function WidgetDetailDrawer({
  activeKey, onClose,
  alerts, urgentCount,
  deadlineList, igTaskList, activityFeed, partyList,
  health,
  maxRevenue, bestEvent, totalDoorRev,
  onOpenModal,
}: {
  activeKey: WidgetDrawerKey | null;
  onClose: () => void;
  alerts: { message: string; level: "high" | "medium" | "low" }[];
  urgentCount: number;
  deadlineList: { id: number; title: string; dueDate: string; owner: string; status: TaskStatus }[];
  igTaskList: { id: number; title: string; dueDate: string; owner: string; status: TaskStatus; type: string }[];
  activityFeed: ActivityEntry[];
  partyList: PartyEvent[];
  health: { score: number; label: "Healthy" | "Needs Attention" | "Critical"; breakdown: Record<string, number> };
  maxRevenue: number;
  bestEvent: PartyEvent;
  totalDoorRev: number;
  onOpenModal: (key: "deadline" | "revenue" | "ig" | "attendance") => void;
}) {
  const isOpen = activeKey !== null;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const WIDGET_CONFIGS: Record<WidgetDrawerKey, { title: string; accent: string; bar: string }> = {
    health:     { title: "Chapter Health Score", accent: "text-white",      bar: "bg-indigo-500"    },
    attention:  { title: "Needs Attention",       accent: "text-red-400",    bar: "bg-red-500/70"    },
    deadlines:  { title: "Deadlines",             accent: "text-white",      bar: "bg-indigo-500/60" },
    instagram:  { title: "Instagram",             accent: "text-white",      bar: "bg-pink-500/60"   },
    activity:   { title: "Activity Feed",         accent: "text-white",      bar: "bg-emerald-500/50"},
    parties:    { title: "Party Events",          accent: "text-white",      bar: "bg-indigo-500/60" },
  };

  const cfg = activeKey ? WIDGET_CONFIGS[activeKey] : null;

  const dot: Record<ActivityEntry["type"], string> = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    info:    "bg-blue-400",
  };

  function renderContent() {
    if (!activeKey) return null;

    switch (activeKey) {
      case "health": {
        const ringColor = health.score >= 80 ? "text-emerald-400" : health.score >= 60 ? "text-amber-400" : "text-red-400";
        const circleBg  = health.score >= 80 ? "bg-emerald-500/15" : health.score >= 60 ? "bg-amber-500/15" : "bg-red-500/15";
        const METRIC_DESC: Record<string, string> = {
          Attendance: "30% weight — avg chapter attendance percentage",
          GPA:        "25% weight — scaled from 2.0–4.0 range",
          Dues:       "20% weight — % of brothers fully paid up",
          Service:    "15% weight — % of brothers at service hour goal",
          Deadlines:  "10% weight — −15 pts per urgent deadline",
        };
        return (
          <>
            <div className="flex flex-col items-center py-6 mb-6 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className={`flex h-20 w-20 items-center justify-center rounded-full ${circleBg} mb-3`}>
                <span className={`text-[32px] font-bold tabular-nums leading-none ${ringColor}`}>{health.score}</span>
              </div>
              <span className={`text-[16px] font-bold ${ringColor}`}>{health.label}</span>
              <p className="mt-1 text-[11px] text-slate-500">out of 100 · weighted composite</p>
            </div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Score Breakdown</p>
            <div className="space-y-4 mb-6">
              {Object.entries(health.breakdown).map(([k, v]) => {
                const barColor = v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : "bg-red-400";
                const textColor = v >= 80 ? "text-emerald-400" : v >= 60 ? "text-amber-400" : "text-red-400";
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-semibold text-white">{k}</span>
                      <span className={`tabular-nums text-[13px] font-bold ${textColor}`}>{v}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07] mb-1">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${v}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-600">{METRIC_DESC[k] ?? ""}</p>
                  </div>
                );
              })}
            </div>
            <div className={`rounded-lg px-3 py-2.5 border ${
              health.score >= 80
                ? "bg-emerald-500/10 border-emerald-500/20"
                : health.score >= 60
                ? "bg-amber-500/10 border-amber-500/20"
                : "bg-red-500/10 border-red-500/20"
            }`}>
              <p className={`text-[11px] ${health.score >= 80 ? "text-emerald-300" : health.score >= 60 ? "text-amber-300" : "text-red-300"}`}>
                {health.score >= 80
                  ? "Chapter is performing well across all metrics."
                  : health.score >= 60
                  ? "Some areas need attention — address urgent deadlines and at-risk brothers."
                  : "Immediate action required — multiple metrics are critically low."
                }
              </p>
            </div>
          </>
        );
      }

      case "attention": {
        const high   = alerts.filter(a => a.level === "high");
        const medium = alerts.filter(a => a.level === "medium");
        const low    = alerts.filter(a => a.level === "low");
        const groups = [
          { label: "Critical", items: high,   left: "border-l-red-500",    bg: "bg-red-500/10",    badge: "bg-red-600 text-white"         },
          { label: "Warning",  items: medium, left: "border-l-amber-400",  bg: "bg-amber-500/10",  badge: "bg-amber-500/20 text-amber-400" },
          { label: "Low",      items: low,    left: "border-l-white/20",   bg: "bg-white/[0.03]",  badge: "bg-white/[0.08] text-slate-400" },
        ] as const;
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {([["Critical", high.length, "text-red-400"], ["Warning", medium.length, "text-amber-400"], ["Low", low.length, "text-slate-400"]] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className={`text-[18px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {alerts.length === 0 ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-6 text-center">
                <p className="text-[12px] text-emerald-400 font-medium">All clear — no issues detected</p>
              </div>
            ) : (
              groups.map(({ label, items, left, bg, badge }) => items.length > 0 && (
                <div key={label} className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((alert, i) => (
                      <div key={i} className={`flex items-start rounded-md border-l-[2.5px] px-2.5 py-1.5 ${left} ${bg}`}>
                        <p className="text-[12px] leading-snug text-slate-300">{alert.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        );
      }

      case "deadlines": {
        const byStatus = {
          Urgent:   deadlineList.filter(d => d.status === "Urgent"),
          "Due Soon": deadlineList.filter(d => d.status === "Due Soon"),
          Upcoming: deadlineList.filter(d => d.status === "Upcoming"),
          Complete: deadlineList.filter(d => d.status === "Complete"),
        };
        const statusStyles: Record<TaskStatus, { left: string; bg: string }> = {
          "Urgent":   { left: "border-l-red-500",   bg: "bg-red-500/10"    },
          "Due Soon": { left: "border-l-amber-400", bg: "bg-amber-500/10"  },
          "Upcoming": { left: "border-l-white/20",  bg: "bg-white/[0.03]"  },
          "Complete": { left: "border-l-emerald-400", bg: "bg-emerald-500/10"},
        };
        return (
          <>
            <div className="grid grid-cols-4 gap-1.5 mb-5">
              {([["Urgent", byStatus.Urgent.length, "text-red-400"], ["Due Soon", byStatus["Due Soon"].length, "text-amber-400"], ["Upcoming", byStatus.Upcoming.length, "text-slate-300"], ["Complete", byStatus.Complete.length, "text-emerald-400"]] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-2 py-2 text-center">
                  <p className={`text-[16px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>
            {deadlineList.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-slate-500">No deadlines — click + Add to create one</p>
            ) : (
              (["Urgent", "Due Soon", "Upcoming", "Complete"] as TaskStatus[]).map(status => {
                const items = byStatus[status as keyof typeof byStatus];
                if (!items || items.length === 0) return null;
                const { left, bg } = statusStyles[status];
                return (
                  <div key={status} className="mb-5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{status} ({items.length})</p>
                    <div className="space-y-1.5">
                      {items.map(d => (
                        <div key={d.id} className={`rounded-md border-l-[2.5px] px-3 py-2 ${left} ${bg}`}>
                          <p className="text-[12px] font-medium text-white">{d.title}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{fmtDate(d.dueDate)} · {d.owner.split(" ")[0]}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            <button onClick={() => { onOpenModal("deadline"); onClose(); }} className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors">
              + Add Deadline
            </button>
          </>
        );
      }

      case "instagram": {
        const urgent   = igTaskList.filter(t => t.status === "Urgent");
        const dueSoon  = igTaskList.filter(t => t.status === "Due Soon");
        const upcoming = igTaskList.filter(t => t.status === "Upcoming");
        const complete = igTaskList.filter(t => t.status === "Complete");
        const typeColors: Record<string, string> = {
          "Feed Post":    "bg-pink-500/15 text-pink-400",
          "Reel":         "bg-purple-500/15 text-purple-400",
          "Story + Feed": "bg-indigo-500/15 text-indigo-400",
          "Carousel":     "bg-blue-500/15 text-blue-400",
          "Story":        "bg-slate-500/15 text-slate-400",
        };
        return (
          <>
            <div className="grid grid-cols-4 gap-1.5 mb-5">
              {([["Urgent", urgent.length, "text-red-400"], ["Due Soon", dueSoon.length, "text-amber-400"], ["Upcoming", upcoming.length, "text-slate-300"], ["Complete", complete.length, "text-emerald-400"]] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-2 py-2 text-center">
                  <p className={`text-[16px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>
            {igTaskList.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-slate-500">No IG tasks scheduled</p>
            ) : (
              <div className="space-y-2 mb-5">
                {[...igTaskList].sort((a, b) => {
                  const order = { Urgent: 0, "Due Soon": 1, Upcoming: 2, Complete: 3 };
                  return (order[a.status] ?? 99) - (order[b.status] ?? 99);
                }).map(t => (
                  <div key={t.id} className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[12px] font-semibold text-white flex-1">{t.title}</p>
                      <TaskBadge status={t.status} />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColors[t.type] ?? "bg-slate-500/15 text-slate-400"}`}>{t.type}</span>
                      <span className="text-[10px] text-slate-500">{fmtDate(t.dueDate)}</span>
                      <span className="text-[10px] text-slate-500">{t.owner.split(" ")[0]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { onOpenModal("ig"); onClose(); }} className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors">
              + Add IG Task
            </button>
          </>
        );
      }

      case "activity": {
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {([
                ["Success", activityFeed.filter(e => e.type === "success").length, "text-emerald-400"],
                ["Warning", activityFeed.filter(e => e.type === "warning").length, "text-amber-400"],
                ["Info",    activityFeed.filter(e => e.type === "info").length,    "text-blue-400"],
              ] as const).map(([label, count, color]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className={`text-[18px] font-bold tabular-nums ${color}`}>{count}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Full History ({activityFeed.length} entries)</p>
            {activityFeed.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-slate-500">No activity yet</p>
            ) : (
              <div className="space-y-0 divide-y divide-white/[0.04] rounded-lg border border-white/[0.06] overflow-hidden">
                {activityFeed.map(e => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.type]}`} />
                    <p className="flex-1 text-[12px] leading-snug text-slate-300">{e.message}</p>
                    <span className="shrink-0 text-[10px] text-slate-500">{e.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }

      case "parties": {
        const sorted = [...partyList].sort((a, b) => b.doorRevenue - a.doorRevenue);
        const avgRevenue = partyList.length > 0 ? Math.round(totalDoorRev / partyList.length) : 0;
        const totalAttendees = partyList.reduce((s, e) => s + e.attendance, 0);
        return (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[17px] font-bold text-indigo-400 tabular-nums">{fmt$(totalDoorRev)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total revenue</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-white tabular-nums">{partyList.length}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Events</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-slate-300 tabular-nums">{totalAttendees}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Attendees</p>
              </div>
            </div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Events — Best First</p>
            <div className="space-y-2.5 mb-5">
              {sorted.map(e => {
                const barPct = maxRevenue > 0 ? Math.round((e.doorRevenue / maxRevenue) * 100) : 0;
                const isTop = e.id === bestEvent.id;
                return (
                  <div key={e.id} className={`rounded-lg px-3 py-2.5 ${isTop ? "bg-indigo-500/[0.08] border border-indigo-500/20" : "bg-white/[0.03] border border-white/[0.05]"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={`text-[12px] font-semibold flex items-center gap-1.5 ${isTop ? "text-indigo-300" : "text-slate-300"}`}>
                        {isTop && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 rounded px-1 py-0.5">Best</span>}
                        {e.name}
                      </p>
                      <span className="tabular-nums text-[13px] font-bold text-white shrink-0 ml-2">{fmt$(e.doorRevenue)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.07] mb-1.5">
                      <div className={`h-full rounded-full ${isTop ? "bg-indigo-400" : "bg-white/[0.25]"}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] text-slate-500">{e.date}</span>
                      <span className="text-[10px] text-slate-500">{e.attendance} attendees</span>
                      <span className="text-[10px] text-slate-500">{fmt$(Math.round(e.doorRevenue / Math.max(1, e.attendance)))} / head</span>
                      {e.notes && <span className="text-[10px] text-slate-600 truncate">{e.notes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => { onOpenModal("revenue"); onClose(); }} className="w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors">
              + Log Revenue
            </button>
          </>
        );
      }

      default:
        return null;
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-[#131720] border-l border-white/[0.07] shadow-2xl transition-transform duration-300 ease-in-out sm:w-[400px] ${isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"}`}
      >
        {cfg && (
          <>
            <div className={`h-[3px] ${cfg.bar}`} />
            <div className="flex h-13 shrink-0 items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
              <h2 className={`flex-1 text-[15px] font-semibold ${cfg.accent}`}>{cfg.title}</h2>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white transition-colors">
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {renderContent()}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState("All");
  const [sortKey,        setSortKey]        = useState<keyof Brother | null>(null);
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("asc");
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [activeModal,    setActiveModal]    = useState<"deadline" | "revenue" | "ig" | "attendance" | null>(null);
  const [activeDrawer,   setActiveDrawer]   = useState<KPIDrawerKey | null>(null);
  const [widgetDrawer,   setWidgetDrawer]   = useState<WidgetDrawerKey | null>(null);
  const [editingAttId,   setEditingAttId]   = useState<number | null>(null);
  const [editAttVal,     setEditAttVal]     = useState("");
  const [healthDelta,    setHealthDelta]    = useState<number | null>(null);
  const [activeSection,  setActiveSection]  = useState("Dashboard");
  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [brotherList,  setBrotherList]  = useState<Brother[]>(brothers);
  const [deadlineList, setDeadlineList] = useState(deadlines);
  const [igTaskList,   setIgTaskList]   = useState(instagramTasks);
  const [partyList,    setPartyList]    = useState(partyEvents);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>(seedActivity);

  // ── Activity logger ────────────────────────────────────────────────────────
  const addActivity = useCallback((message: string, type: ActivityEntry["type"]) => {
    setActivityFeed(prev => [{ id: _nextId++, message, timestamp: "just now", type }, ...prev]);
  }, []);

  // ── Health score ───────────────────────────────────────────────────────────
  const prevScoreRef = useRef<number | null>(null);
  const health = useMemo(() => calcHealthScore(brotherList, deadlineList), [brotherList, deadlineList]);

  useEffect(() => {
    if (prevScoreRef.current !== null && prevScoreRef.current !== health.score) {
      const delta = health.score - prevScoreRef.current;
      setHealthDelta(delta);
      if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current);
      deltaTimerRef.current = setTimeout(() => setHealthDelta(null), 3000);
    }
    prevScoreRef.current = health.score;
  }, [health.score]);

  // ── Scroll spy ────────────────────────────────────────────────────────────
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    function updateActive() {
      const el = mainRef.current;
      if (!el) return;
      const mainRect = el.getBoundingClientRect();
      const detectY = mainRect.top + el.clientHeight * 0.25;
      let current = "Dashboard";
      for (const [label, id] of Object.entries(SECTION_IDS)) {
        const section = document.getElementById(id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= detectY) current = label;
      }
      setActiveSection(current);
    }

    mainEl.addEventListener("scroll", updateActive, { passive: true });
    updateActive();
    return () => mainEl.removeEventListener("scroll", updateActive);
  }, []);

  // ── Scroll-to helpers ──────────────────────────────────────────────────────
  function scrollToSection(label: string) {
    const id = SECTION_IDS[label];
    if (!id) return;
    const el = document.getElementById(id);
    if (!el || !mainRef.current) return;
    const mainRect = mainRef.current.getBoundingClientRect();
    const elRect   = el.getBoundingClientRect();
    const offset   = mainRef.current.scrollTop + (elRect.top - mainRect.top) - 16;
    mainRef.current.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    setActiveSection(label);
  }

  // ── Reset demo data ────────────────────────────────────────────────────────
  function resetDemoData() {
    setBrotherList(brothers);
    setDeadlineList(deadlines);
    setIgTaskList(instagramTasks);
    setPartyList(partyEvents);
    setActivityFeed(seedActivity);
    addActivity("Demo data reset to defaults", "info");
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const avgAttendance   = useMemo(() => avg(brotherList.map(b => b.attendance)), [brotherList]);
  const outstandingDues = useMemo(() => brotherList.reduce((s, b) => s + b.duesOwed, 0), [brotherList]);
  const chapterGPA      = useMemo(() => avg(brotherList.map(b => b.gpa)), [brotherList]);
  const totalServiceHrs = useMemo(() => brotherList.reduce((s, b) => s + b.serviceHours, 0), [brotherList]);
  const totalDoorRev    = useMemo(() => partyList.reduce((s, e) => s + e.doorRevenue, 0), [partyList]);
  const onTrackSvc      = useMemo(() => brotherList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length, [brotherList]);
  const maxRevenue      = useMemo(() => Math.max(...partyList.map(e => e.doorRevenue)), [partyList]);
  const bestEvent       = useMemo(() => partyList.reduce((a, b) => b.doorRevenue > a.doorRevenue ? b : a), [partyList]);

  const statusCounts = useMemo(() => ({
    Good:      brotherList.filter(b => getBrotherStatus(b) === "Good").length,
    Watch:     brotherList.filter(b => getBrotherStatus(b) === "Watch").length,
    "At Risk": brotherList.filter(b => getBrotherStatus(b) === "At Risk").length,
  }), [brotherList]);

  // ── Filtered/sorted brothers ───────────────────────────────────────────────
  const filteredBrothers = useMemo((): Brother[] => {
    let result = brotherList.filter(b => {
      const q = search.toLowerCase();
      return (b.name.toLowerCase().includes(q) || b.role.toLowerCase().includes(q)) &&
             (statusFilter === "All" || getBrotherStatus(b) === statusFilter);
    });
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = a[sortKey] as number, bv = b[sortKey] as number;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return result;
  }, [brotherList, search, statusFilter, sortKey, sortDir]);

  function toggleSort(key: keyof Brother) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const out: { message: string; level: "high" | "medium" | "low" }[] = [];
    brotherList.forEach(b => {
      if (getBrotherStatus(b) === "At Risk")
        out.push({ message: `${b.name} — ${b.attendance}% att, GPA ${b.gpa}`, level: "high" });
    });
    deadlineList.filter(d => d.status === "Urgent").forEach(d =>
      out.push({ message: `"${d.title}" due ${fmtDate(d.dueDate)}`, level: "high" })
    );
    igTaskList.filter(t => t.status === "Urgent").forEach(t =>
      out.push({ message: `IG: "${t.title}" due ${fmtDate(t.dueDate)}`, level: "high" })
    );
    brotherList.filter(b => b.duesOwed > 0).forEach(b =>
      out.push({ message: `${b.name} owes ${fmt$(b.duesOwed)}`, level: "medium" })
    );
    deadlineList.filter(d => d.status === "Due Soon").forEach(d =>
      out.push({ message: `"${d.title}" due ${fmtDate(d.dueDate)}`, level: "medium" })
    );
    brotherList
      .filter(b => b.serviceHours < THRESHOLDS.serviceHoursGoal && getBrotherStatus(b) !== "At Risk")
      .forEach(b => out.push({ message: `${b.name} — ${b.serviceHours}h / ${THRESHOLDS.serviceHoursGoal}h service`, level: "low" }));
    return out;
  }, [brotherList, deadlineList, igTaskList]);

  const urgentCount = alerts.filter(a => a.level === "high").length;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const partyChartData = useMemo(() => partyList.map(e => ({
    name: e.name.length > 12 ? e.name.slice(0, 11) + "…" : e.name,
    revenue: e.doorRevenue,
  })), [partyList]);

  const statusChartData = useMemo(() => [
    { name: "Good",    count: statusCounts.Good,       fill: "#34d399" },
    { name: "Watch",   count: statusCounts.Watch,      fill: "#fbbf24" },
    { name: "At Risk", count: statusCounts["At Risk"], fill: "#f87171" },
  ], [statusCounts]);

  const svcChartData = useMemo(() => [...brotherList]
    .sort((a, b) => b.serviceHours - a.serviceHours)
    .map(b => ({ name: b.name.split(" ")[0], hours: b.serviceHours })),
  [brotherList]);

  const brotherNames = useMemo(() => brotherList.map(b => b.name), [brotherList]);

  // ── Inline attendance edit ─────────────────────────────────────────────────
  function startAttEdit(b: Brother) {
    setEditingAttId(b.id);
    setEditAttVal(String(b.attendance));
  }

  function saveAttEdit(b: Brother) {
    const val = Math.min(100, Math.max(0, Math.round(Number(editAttVal))));
    if (!isNaN(val) && val !== b.attendance) {
      setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, attendance: val } : x));
      addActivity(`${b.name} attendance updated to ${val}%`, "info");
    }
    setEditingAttId(null);
  }

  // ── Quick Action handlers ──────────────────────────────────────────────────
  function handleAddDeadline(d: { title: string; dueDate: string; owner: string; status: TaskStatus }) {
    const newId = Math.max(...deadlineList.map(x => x.id), 0) + 1;
    setDeadlineList(prev => [...prev, { id: newId, ...d }]);
    addActivity(`New deadline added: "${d.title}"`, "info");
    setActiveModal(null);
  }

  function handleAddRevenue(e: { name: string; date: string; doorRevenue: number; attendance: number; notes: string }) {
    const newId = Math.max(...partyList.map(x => x.id), 0) + 1;
    setPartyList(prev => [...prev, { id: newId, ...e }]);
    addActivity(`Revenue logged: ${e.name} — ${fmt$(e.doorRevenue)}`, "success");
    setActiveModal(null);
  }

  function handleAddIGTask(t: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    const newId = Math.max(...igTaskList.map(x => x.id), 0) + 1;
    setIgTaskList(prev => [...prev, { id: newId, ...t }]);
    addActivity(`IG task added: "${t.title}"`, "info");
    setActiveModal(null);
  }

  function handleLogAttendance(attended: Set<number>) {
    setBrotherList(prev => prev.map(b => {
      const didAttend = attended.has(b.id);
      const newAtt = Math.min(100, Math.max(0, Math.round(b.attendance + (didAttend ? 2 : -3))));
      return { ...b, attendance: newAtt };
    }));
    addActivity(`Attendance logged — ${attended.size} of ${brotherList.length} present`, "info");
    setActiveModal(null);
  }

  function closeModal() { setActiveModal(null); }

  function payDues(b: Brother) {
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, duesOwed: 0 } : x));
    addActivity(`${b.name} marked dues paid`, "success");
  }

  function addServiceHour(b: Brother) {
    const newHrs = b.serviceHours + 1;
    setBrotherList(prev => prev.map(x => x.id === b.id ? { ...x, serviceHours: newHrs } : x));
    addActivity(`${b.name} — service hours updated to ${newHrs}h`, "info");
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[#0d1117]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection={activeSection}
        onNavClick={scrollToSection}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#0d1117] px-3 sm:gap-3 sm:px-5">
          <button onClick={() => setSidebarOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-white">Operations Dashboard</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">Lambda Phi Epsilon · Fall 2026</p>
          </div>

          {/* Quick Actions */}
          <div className="hidden items-center gap-1.5 lg:flex">
            {([
              ["deadline",   "+ Deadline"],
              ["revenue",    "+ Revenue" ],
              ["ig",         "+ IG Task" ],
              ["attendance", "Log Att."  ],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveModal(key)}
                className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-300">
                {label}
              </button>
            ))}
          </div>

          {/* Mobile: single add button */}
          <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 lg:hidden" onClick={() => setActiveModal("deadline")}>
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <p className="hidden text-[11px] text-slate-500 xl:block shrink-0">May 11, 2026</p>

          <div className="relative hidden sm:block">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input type="text" placeholder="Search brothers…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-36 rounded-lg border border-white/[0.1] bg-white/[0.04] py-1.5 pl-8 pr-3 text-[13px] text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-indigo-500/15 sm:w-44" />
          </div>

          <button onClick={() => window.print()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-slate-300 transition-all hover:border-white/[0.2] hover:bg-white/[0.08] focus:outline-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-slate-400">
              <path fillRule="evenodd" d="M11.5 4.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM4.25 8.5a3.25 3.25 0 0 0-3.25 3.25v.5A1.75 1.75 0 0 0 2.75 14h10.5A1.75 1.75 0 0 0 15 12.25v-.5A3.25 3.25 0 0 0 11.75 8.5h-7.5Z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
        </header>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-5">

            {/* ── Health Score ────────────────────────────────────────────── */}
            <section id="sec-dashboard" aria-label="Dashboard overview">
              <HealthScoreWidget score={health.score} label={health.label} breakdown={health.breakdown} delta={healthDelta} onExpand={() => setWidgetDrawer("health")} />
            </section>

            {/* ── KPI Cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <KPICard label="Avg Attendance" value={`${avgAttendance.toFixed(1)}%`}
                trend={`${brotherList.filter(b => b.attendance < THRESHOLDS.attendanceWatch).length} below threshold`}
                iconKey="attendance" sparkData={KPI_SPARKLINES.attendance}
                iconBg="bg-blue-500/10" iconColor="text-blue-400" strokeColor="#60a5fa"
                onClick={() => setActiveDrawer("attendance")} />
              <KPICard label="Outstanding Dues" value={fmt$(outstandingDues)}
                trend={`${brotherList.filter(b => b.duesOwed > 0).length} brothers owe`}
                iconKey="dues" sparkData={KPI_SPARKLINES.dues}
                accent={outstandingDues > 0 ? "text-amber-400" : "text-white"}
                iconBg="bg-amber-500/10" iconColor="text-amber-400" strokeColor="#fbbf24"
                onClick={() => setActiveDrawer("dues")} />
              <KPICard label="Chapter GPA" value={chapterGPA.toFixed(2)}
                trend={`${brotherList.filter(b => b.gpa < THRESHOLDS.gpaWatch).length} below 3.0`}
                iconKey="gpa" sparkData={KPI_SPARKLINES.gpa}
                iconBg="bg-violet-500/10" iconColor="text-violet-400" strokeColor="#a78bfa"
                onClick={() => setActiveDrawer("gpa")} />
              <KPICard label="Service Hours" value={`${totalServiceHrs}h`}
                trend={`${onTrackSvc} of ${brotherList.length} on track`}
                iconKey="service" sparkData={KPI_SPARKLINES.service}
                iconBg="bg-emerald-500/10" iconColor="text-emerald-400" strokeColor="#34d399"
                onClick={() => setActiveDrawer("service")} />
              <KPICard label="Treasury" value={fmt$(TREASURY_BALANCE)}
                trend={`projected ${fmt$(TREASURY_PROJECTED)}`}
                iconKey="treasury" sparkData={KPI_SPARKLINES.treasury}
                iconBg="bg-indigo-500/10" iconColor="text-indigo-400" strokeColor="#818cf8"
                onClick={() => setActiveDrawer("treasury")} />
              <KPICard label="Door Revenue" value={fmt$(totalDoorRev)}
                trend={`best ${fmt$(bestEvent.doorRevenue)}`}
                iconKey="door" sparkData={KPI_SPARKLINES.door}
                iconBg="bg-pink-500/10" iconColor="text-pink-400" strokeColor="#f472b6"
                onClick={() => setActiveDrawer("door")} />
            </div>

            {/* ── Charts ─────────────────────────────────────────────────── */}
            <div id="sec-treasury" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ChartWidget title="Treasury Trend" stat={fmt$(TREASURY_BALANCE)} caption="Jan – May 2026">
                <ResponsiveContainer width="100%" height={96}>
                  <AreaChart data={treasuryTrend} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                    <defs>
                      <linearGradient id="tGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#818cf8" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v / 1000}k`} />
                    <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Balance"]} contentStyle={tooltipStyle} cursor={{ stroke: "#818cf8", strokeWidth: 1, strokeDasharray: "4 4" }} />
                    <Area type="monotone" dataKey="balance" stroke="#818cf8" strokeWidth={2} fill="url(#tGrad)" dot={false} activeDot={{ r: 4, fill: "#818cf8", stroke: "#161b27", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartWidget>

              <ChartWidget title="Door Revenue" stat={fmt$(totalDoorRev)} caption={`${partyList.length} events`}>
                <ResponsiveContainer width="100%" height={96}>
                  <BarChart data={partyChartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip formatter={(v) => [fmt$(Number(v ?? 0)), "Revenue"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="revenue" fill="#818cf8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWidget>

              <ChartWidget title="Status Mix" stat={`${statusCounts.Good} / ${brotherList.length} Good`} caption={`${brotherList.length} brothers`}>
                <ResponsiveContainer width="100%" height={96}>
                  <BarChart data={statusChartData} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, "Brothers"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {statusChartData.map((entry, idx) => <Cell key={`sc-${idx}`} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartWidget>

              <ChartWidget title="Service Hours" stat={`${onTrackSvc} / ${brotherList.length} on track`} caption={`Goal: ${THRESHOLDS.serviceHoursGoal}h`}>
                <ResponsiveContainer width="100%" height={96}>
                  <BarChart data={svcChartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [`${v}h`, "Service"]} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="hours" fill="#34d399" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartWidget>
            </div>

            {/* ── Main grid: table + right panel ─────────────────────────── */}
            <div id="sec-brothers" className="grid grid-cols-1 gap-4 xl:grid-cols-3">

              {/* Brother Tracking Table */}
              <Card className="overflow-hidden xl:col-span-2">
                <div className="border-b border-white/[0.07] px-5 py-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-[14px] font-semibold text-white">Brother Tracking</h2>
                      <p className="text-[11px] text-slate-500">Click attendance to edit · Pay dues inline · +1h service</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(["All", "Good", "Watch", "At Risk"] as const).map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${statusFilter === f ? "bg-white/[0.12] text-white" : "border border-white/[0.1] text-slate-400 hover:border-white/[0.2] hover:text-slate-200"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                        <th className="py-2.5 pl-5 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Brother</th>
                        <th className="hidden px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500 sm:table-cell">Role</th>
                        {([["attendance","Att."],["duesOwed","Dues"],["gpa","GPA"],["serviceHours","Svc"]] as [keyof Brother, string][]).map(([k, label]) => (
                          <SortTh key={k} label={label} colKey={k} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} />
                        ))}
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {filteredBrothers.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">No brothers match your filters.</td></tr>
                      ) : filteredBrothers.map(b => {
                        const status = getBrotherStatus(b);
                        const isEditingAtt = editingAttId === b.id;
                        return (
                          <tr key={b.id} className="transition-colors hover:bg-white/[0.03]">
                            <td className={`border-l-2 py-3 pl-4 pr-3 ${BROTHER_STYLES[status].row}`}>
                              <p className="text-[13px] font-semibold text-white">{b.name}</p>
                            </td>
                            <td className="hidden max-w-[160px] px-3 py-3 sm:table-cell">
                              <p className="truncate text-[12px] text-slate-400">{b.role}</p>
                            </td>
                            {/* Attendance — inline editable */}
                            <td className="px-3 py-3">
                              {isEditingAtt ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number" min="0" max="100"
                                    value={editAttVal}
                                    onChange={e => setEditAttVal(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") saveAttEdit(b); if (e.key === "Escape") setEditingAttId(null); }}
                                    autoFocus
                                    className="w-14 rounded-md border border-indigo-500/50 bg-[#0d1117] px-2 py-1 text-[12px] text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  />
                                  <button onClick={() => saveAttEdit(b)} className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-500">✓</button>
                                  <button onClick={() => setEditingAttId(null)} className="text-[11px] text-slate-500 hover:text-slate-300">✕</button>
                                </div>
                              ) : (
                                <button onClick={() => startAttEdit(b)} className="group flex items-center gap-1.5 rounded p-0.5 hover:bg-white/[0.05] transition-colors">
                                  <AttBar pct={b.attendance} />
                                  <svg className="h-3 w-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              )}
                            </td>
                            {/* Dues — Pay button */}
                            <td className="px-3 py-3">
                              {b.duesOwed > 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="tabular-nums text-[13px] font-medium text-amber-400">{fmt$(b.duesOwed)}</span>
                                  <button onClick={() => payDues(b)} className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/25 hover:bg-emerald-500/25 transition-colors">Pay</button>
                                </div>
                              ) : (
                                <span className="tabular-nums text-[13px] font-medium text-slate-600">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`tabular-nums text-[13px] font-semibold ${b.gpa < THRESHOLDS.gpaAtRisk ? "text-red-400" : b.gpa < THRESHOLDS.gpaWatch ? "text-amber-400" : "text-white"}`}>
                                {b.gpa.toFixed(1)}
                              </span>
                            </td>
                            {/* Service hours — +1h button */}
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`tabular-nums text-[13px] font-medium ${b.serviceHours < THRESHOLDS.serviceHoursGoal ? "text-amber-400" : "text-white"}`}>
                                  {b.serviceHours}h
                                </span>
                                <button onClick={() => addServiceHour(b)} className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-inset ring-white/[0.1] hover:bg-indigo-500/15 hover:text-indigo-400 hover:ring-indigo-500/25 transition-colors">
                                  +1h
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-3"><StatusBadge status={status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-2.5">
                  <p className="text-[11px] text-slate-500">
                    {filteredBrothers.length} / {brotherList.length} brothers ·{" "}
                    <span className="font-medium text-emerald-400">{statusCounts.Good} good</span> ·{" "}
                    <span className="font-medium text-amber-400">{statusCounts.Watch} watch</span> ·{" "}
                    <span className="font-medium text-red-400">{statusCounts["At Risk"]} at risk</span>
                  </p>
                </div>
              </Card>

              {/* Right panel */}
              <div className="space-y-4 self-start sticky top-5 max-h-[calc(100vh-6rem)] overflow-y-auto">
                {/* Needs Attention */}
                <Card className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("attention")}>
                  <div className="h-[3px] bg-red-500/70" />
                  <div className="px-4 py-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-[13px] font-semibold text-white">Needs Attention</h2>
                      <div className="flex items-center gap-2">
                        {urgentCount > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">{urgentCount} critical</span>}
                        <button onClick={() => setWidgetDrawer("attention")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-red-500/15 hover:text-red-400 transition-colors">
                          All
                          <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </div>
                    </div>
                    {alerts.length === 0 ? (
                      <p className="py-4 text-center text-[12px] text-slate-500">All clear — no issues detected</p>
                    ) : (
                      <div className="space-y-1.5">
                        {alerts.slice(0, 8).map((alert, i) => {
                          const left = alert.level === "high" ? "border-l-red-500" : alert.level === "medium" ? "border-l-amber-400" : "border-l-white/20";
                          const bg   = alert.level === "high" ? "bg-red-500/10"    : alert.level === "medium" ? "bg-amber-500/10"    : "bg-white/[0.03]";
                          return (
                            <div key={i} className={`flex items-start rounded-md border-l-[2.5px] px-2.5 py-1.5 ${left} ${bg}`}>
                              <p className="text-[12px] leading-snug text-slate-300">{alert.message}</p>
                            </div>
                          );
                        })}
                        {alerts.length > 8 && <p className="pt-1 text-center text-[11px] text-slate-500">+{alerts.length - 8} more</p>}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Deadlines */}
                <Card id="sec-deadlines" className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("deadlines")}>
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <h2 className="text-[13px] font-semibold text-white">Deadlines</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{deadlineList.length} tasks</span>
                      <button onClick={() => setWidgetDrawer("deadlines")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-300 transition-colors">
                        All
                        <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setActiveModal("deadline"); }} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {deadlineList.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12px] text-slate-500">No deadlines — click + Add to create one</p>
                    ) : deadlineList.map(d => (
                      <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-white">{d.title}</p>
                          <p className="text-[11px] text-slate-500">{fmtDate(d.dueDate)} · {d.owner.split(" ")[0]}</p>
                        </div>
                        <TaskBadge status={d.status} />
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Instagram */}
                <Card id="sec-instagram" className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("instagram")}>
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <h2 className="text-[13px] font-semibold text-white">Instagram</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{igTaskList.length} posts</span>
                      <button onClick={() => setWidgetDrawer("instagram")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-pink-500/15 hover:text-pink-400 transition-colors">
                        All
                        <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setActiveModal("ig"); }} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.05]">
                    {igTaskList.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[12px] text-slate-500">No IG tasks scheduled</p>
                    ) : igTaskList.map(t => (
                      <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-white">{t.title}</p>
                          <p className="text-[11px] text-slate-500">{fmtDate(t.dueDate)} · {t.type}</p>
                        </div>
                        <TaskBadge status={t.status} />
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            {/* ── Bottom row: Activity Feed + Party Events ────────────────── */}
            <div id="sec-parties" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ActivityFeed entries={activityFeed} onExpand={() => setWidgetDrawer("activity")} />

              <Card className="overflow-hidden cursor-pointer hover:border-white/[0.14] transition-colors" onClick={() => setWidgetDrawer("parties")}>
                <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
                  <div>
                    <h2 className="text-[13px] font-semibold text-white">Party Events</h2>
                    <p className="text-[11px] text-slate-500">Door revenue by event</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[16px] font-bold text-white">{fmt$(totalDoorRev)}</p>
                    <button onClick={() => setWidgetDrawer("parties")} className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-300 transition-colors">
                      All
                      <svg className="h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                    <button onClick={() => setActiveModal("revenue")} className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/25 transition-colors">+ Add</button>
                  </div>
                </div>
                <div className="space-y-3 px-5 py-4">
                  {partyList.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-slate-500">No events logged — click + Add to log revenue</p>
                  ) : partyList.map(e => {
                    const barPct = Math.round((e.doorRevenue / maxRevenue) * 100);
                    const isTop  = e.id === bestEvent.id;
                    return (
                      <div key={e.id} className="flex items-center gap-3">
                        <div className="w-24 shrink-0">
                          <p className={`truncate text-[12px] font-medium ${isTop ? "text-indigo-400" : "text-slate-300"}`}>{e.name}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                            <div className={`h-full rounded-full transition-all duration-500 ${isTop ? "bg-indigo-400" : "bg-white/[0.18]"}`} style={{ width: `${barPct}%` }} />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="hidden text-[10px] text-slate-500 sm:block">{e.attendance}</span>
                          <span className="w-12 tabular-nums text-right text-[12px] font-semibold text-white">{fmt$(e.doorRevenue)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* ── Settings ───────────────────────────────────────────────── */}
            <section id="sec-settings" aria-label="Settings">
              <Card className="overflow-hidden">
                <div className="border-b border-white/[0.07] px-5 py-4">
                  <h2 className="text-[14px] font-semibold text-white">Settings</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">Frontend demo controls · data is in-memory only</p>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {/* Demo Controls */}
                  <div className="px-5 py-4">
                    <p className="mb-3 text-[12px] font-semibold text-slate-300">Demo Controls</p>
                    <p className="mb-3 text-[11px] text-slate-500">
                      All data lives in React state and resets on page refresh. Use the button below to restore
                      the original mock data without refreshing.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={resetDemoData}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 focus:outline-none"
                      >
                        <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Reset demo data
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
                  {/* Quick Actions */}
                  <div className="px-5 py-4">
                    <p className="mb-3 text-[12px] font-semibold text-slate-300">Quick Actions</p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["deadline",   "+ Add Deadline"  ],
                        ["revenue",    "+ Log Revenue"   ],
                        ["ig",         "+ Add IG Task"   ],
                        ["attendance", "Log Attendance"  ],
                      ] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setActiveModal(key)}
                          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400">
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Thresholds */}
                  <div className="px-5 py-4">
                    <p className="mb-3 text-[12px] font-semibold text-slate-300">Active Thresholds</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-3">
                      {[
                        ["Attendance At Risk", `< ${THRESHOLDS.attendanceAtRisk}%`],
                        ["Attendance Watch",   `< ${THRESHOLDS.attendanceWatch}%`],
                        ["GPA At Risk",        `< ${THRESHOLDS.gpaAtRisk}`       ],
                        ["GPA Watch",          `< ${THRESHOLDS.gpaWatch}`        ],
                        ["Service Goal",       `${THRESHOLDS.serviceHoursGoal}h` ],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500">{k}</span>
                          <span className="text-[11px] font-semibold tabular-nums text-slate-300">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="border-t border-white/[0.06] pt-4 text-center">
              <p className="text-[10px] text-slate-700">Lambda Phi Epsilon · Spring 2026 · Prototype — all values are placeholder data</p>
            </div>

          </div>
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {activeModal === "deadline" && (
        <Modal title="Add Deadline" onClose={closeModal}>
          <AddDeadlineForm brotherNames={brotherNames} onSubmit={handleAddDeadline} />
        </Modal>
      )}
      {activeModal === "revenue" && (
        <Modal title="Log Revenue" onClose={closeModal}>
          <AddRevenueForm onSubmit={handleAddRevenue} />
        </Modal>
      )}
      {activeModal === "ig" && (
        <Modal title="Add Instagram Task" onClose={closeModal}>
          <AddIGTaskForm brotherNames={brotherNames} onSubmit={handleAddIGTask} />
        </Modal>
      )}
      {activeModal === "attendance" && (
        <Modal title="Log Chapter Meeting" onClose={closeModal}>
          <LogAttendanceForm bList={brotherList} onSubmit={handleLogAttendance} />
        </Modal>
      )}

      {/* ── Widget Detail Drawer ────────────────────────────────────────────── */}
      <WidgetDetailDrawer
        activeKey={widgetDrawer}
        onClose={() => setWidgetDrawer(null)}
        alerts={alerts}
        urgentCount={urgentCount}
        deadlineList={deadlineList}
        igTaskList={igTaskList}
        activityFeed={activityFeed}
        partyList={partyList}
        health={health}
        maxRevenue={maxRevenue}
        bestEvent={bestEvent}
        totalDoorRev={totalDoorRev}
        onOpenModal={setActiveModal}
      />

      {/* ── KPI Detail Drawer ───────────────────────────────────────────────── */}
      <KPIDetailDrawer
        activeKey={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        brotherList={brotherList}
        partyList={partyList}
        payDues={payDues}
        addServiceHour={addServiceHour}
        avgAttendance={avgAttendance}
        outstandingDues={outstandingDues}
        chapterGPA={chapterGPA}
        totalServiceHrs={totalServiceHrs}
        onTrackSvc={onTrackSvc}
        totalDoorRev={totalDoorRev}
        maxRevenue={maxRevenue}
        bestEvent={bestEvent}
        onOpenModal={setActiveModal}
      />
    </div>
  );
}
