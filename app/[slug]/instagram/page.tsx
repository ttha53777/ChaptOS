"use client";

import { useState, useMemo } from "react";
import { Sidebar } from "../../components/Sidebar";
import { Modal } from "../../components/dashboard/primitives";
import { AddIGTaskForm } from "../../components/dashboard/forms";
import { InstagramTask, TaskStatus, fmtDate } from "../../data";
import { useChapter } from "../../context/ChapterContext";
import { requestJson } from "../../lib/api";
import { daysFromToday, todayStr } from "../../lib/dates";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const STATUS_META: Record<TaskStatus, { label: string; accent: string; dot: string }> = {
  Urgent:    { label: "Urgent",   accent: "bg-red-500",     dot: "bg-red-400"     },
  "Due Soon":{ label: "Due Soon", accent: "bg-amber-500",   dot: "bg-amber-400"   },
  Upcoming:  { label: "Upcoming", accent: "bg-slate-500",   dot: "bg-slate-400"   },
  Complete:  { label: "Complete", accent: "bg-emerald-500", dot: "bg-emerald-400" },
};

const TYPE_META: Record<string, string> = {
  "Feed Post":   "bg-pink-500/15 text-pink-400",
  "Reel":        "bg-purple-500/15 text-purple-400",
  "Story + Feed":"bg-indigo-500/15 text-indigo-400",
  "Carousel":    "bg-blue-500/15 text-blue-400",
  "Story":       "bg-slate-500/15 text-slate-400",
};

const STATUS_ORDER: TaskStatus[] = ["Urgent", "Due Soon", "Upcoming", "Complete"];

const TODAY_STR = todayStr();

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onEdit,
  onDelete,
  onComplete,
}: {
  task: InstagramTask;
  onEdit: (t: InstagramTask) => void;
  onDelete: (t: InstagramTask) => void;
  onComplete: (t: InstagramTask) => void;
}) {
  const s    = STATUS_META[task.status];
  const diff = daysFromToday(task.dueDate);
  const isComplete = task.status === "Complete";

  const daysChip = isComplete ? null
    : diff === 0  ? { label: "Today",    cls: "bg-indigo-500/15 text-indigo-400" }
    : diff === 1  ? { label: "Tomorrow", cls: "bg-amber-500/15 text-amber-400" }
    : diff <= 2   ? { label: `In ${diff}d`, cls: "bg-red-500/15 text-red-400" }
    : diff <= 7   ? { label: `In ${diff}d`, cls: "bg-amber-500/15 text-amber-400" }
    : diff > 0    ? { label: `In ${diff}d`, cls: "bg-white/[0.04] text-slate-500" }
    : { label: `${Math.abs(diff)}d ago`, cls: "bg-white/[0.03] text-slate-600" };

  return (
    <div className={`group flex min-h-[68px] overflow-hidden rounded-xl border border-white/[0.07] bg-[#10121a] transition-all duration-150 hover:border-white/[0.12] hover:shadow-md ${isComplete ? "opacity-60" : ""}`}>
      {/* Left accent bar */}
      <div className={`w-[3px] shrink-0 self-stretch ${s.accent} opacity-80`} />

      <div className="flex flex-1 items-center gap-4 px-4 py-3">
        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-semibold leading-snug text-white ${isComplete ? "line-through decoration-white/30" : ""}`}>
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${TYPE_META[task.type] ?? "bg-white/[0.05] text-slate-400"}`}>
              {task.type}
            </span>
            <span className="text-[11px] text-slate-500">
              {task.owner.split(" ")[0]} · {fmtDate(task.dueDate)}
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="flex shrink-0 items-center gap-2">
          {daysChip && (
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums ${daysChip.cls}`}>
              {daysChip.label}
            </span>
          )}
          {/* Action icons — visible on mobile; fade-in on hover for desktop */}
          <div className="flex items-center gap-1 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100">
            {!isComplete && (
              <button
                onClick={() => onComplete(task)}
                title="Mark complete"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
            <button
              onClick={() => onEdit(task)}
              title="Edit"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(task)}
              title="Delete"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ListView ─────────────────────────────────────────────────────────────────

function ListView({
  tasks,
  onEdit,
  onDelete,
  onComplete,
}: {
  tasks: InstagramTask[];
  onEdit: (t: InstagramTask) => void;
  onDelete: (t: InstagramTask) => void;
  onComplete: (t: InstagramTask) => void;
}) {
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<TaskStatus>>(new Set(["Complete"]));

  function toggleBucket(s: TaskStatus) {
    setCollapsedBuckets(prev => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-slate-500">No posts match this filter</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {STATUS_ORDER.map(status => {
        const bucket = tasks.filter(t => t.status === status);
        if (bucket.length === 0) return null;
        const s = STATUS_META[status];
        const collapsed = collapsedBuckets.has(status);

        return (
          <div key={status}>
            <button
              onClick={() => toggleBucket(status)}
              className="mb-3 flex w-full items-center gap-3 text-left"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
              <span className="text-[13px] font-bold text-white">{s.label}</span>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums ring-1 ring-inset bg-white/[0.06] text-slate-400 ring-white/[0.1]">
                {bucket.length}
              </span>
              <div className="flex-1 border-t border-white/[0.06]" />
              <svg
                className={`h-4 w-4 shrink-0 text-slate-600 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!collapsed && (
              <div className="space-y-2">
                {bucket.map(t => (
                  <TaskCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onComplete={onComplete} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── CalendarView ─────────────────────────────────────────────────────────────

function CalendarView({
  tasks,
  onEdit,
}: {
  tasks: InstagramTask[];
  onEdit: (t: InstagramTask) => void;
}) {
  const [month, setMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  function prevMonth() {
    setMonth(prev => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 });
  }
  function nextMonth() {
    setMonth(prev => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 });
  }
  function goToToday() {
    const n = new Date(); setMonth({ year: n.getFullYear(), month: n.getMonth() });
  }

  const firstDay = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

  const tasksByDay = useMemo(() => {
    const map: Record<string, InstagramTask[]> = {};
    for (const t of tasks) {
      const [yr, mo] = t.dueDate.split("-").map(Number);
      if (yr === month.year && mo === month.month + 1) {
        if (!map[t.dueDate]) map[t.dueDate] = [];
        map[t.dueDate].push(t);
      }
    }
    return map;
  }, [tasks, month]);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const _n = new Date();
  const isCurrentMonth = month.year === _n.getFullYear() && month.month === _n.getMonth();

  return (
    <div>
      {/* Month nav */}
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-bold text-white">
            {MONTH_NAMES[month.month]} {month.year}
          </span>
          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-400 transition-colors hover:bg-indigo-500/20"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="min-h-[90px] rounded-xl" />;
          }

          const dateStr = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === TODAY_STR;
          const dayTasks = tasksByDay[dateStr] ?? [];
          const isExpanded = expandedDay === dateStr;
          const shown = isExpanded ? dayTasks : dayTasks.slice(0, 2);
          const overflow = dayTasks.length - 2;

          return (
            <div
              key={dateStr}
              className={`min-h-[90px] rounded-xl border p-2 transition-colors ${
                isToday
                  ? "border-indigo-500/40 bg-indigo-500/[0.06]"
                  : "border-white/[0.05] bg-white/[0.01] hover:border-white/[0.08]"
              }`}
            >
              <p className={`mb-1.5 text-[11px] font-bold tabular-nums ${isToday ? "text-indigo-400" : "text-slate-500"}`}>
                {day}
              </p>
              <div className="space-y-1">
                {shown.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onEdit(t)}
                    className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_META[t.status].dot}`} />
                    <span className="truncate text-[10px] text-slate-300">{t.title}</span>
                  </button>
                ))}
                {!isExpanded && overflow > 0 && (
                  <button
                    onClick={() => setExpandedDay(dateStr)}
                    className="w-full rounded-lg px-1.5 py-0.5 text-left text-[10px] font-semibold text-indigo-500 transition-colors hover:text-indigo-400"
                  >
                    +{overflow} more
                  </button>
                )}
                {isExpanded && dayTasks.length > 2 && (
                  <button
                    onClick={() => setExpandedDay(null)}
                    className="w-full rounded-lg px-1.5 py-0.5 text-left text-[10px] font-semibold text-slate-600 transition-colors hover:text-slate-400"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

let _nextId = Date.now();

export default function InstagramPage() {
  const { currentUser, igTaskList, setIgTaskList, brotherList, isLoading } = useChapter();
  const brotherNames = useMemo(() => brotherList.map(b => b.name), [brotherList]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeView,  setActiveView]  = useState<"list" | "calendar">("list");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingTask, setEditingTask] = useState<InstagramTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InstagramTask | null>(null);

  function openEdit(task: InstagramTask) {
    setEditingTask(task);
    setModal("edit");
  }

  function handleCreate(draft: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    const tempId = _nextId++;
    const optimistic: InstagramTask = { id: tempId, ...draft };
    setIgTaskList(prev => [...prev, optimistic]);
    setModal(null);
    requestJson<InstagramTask>("/api/instagram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(saved => setIgTaskList(prev => prev.map(t => t.id === tempId ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(prev => prev.filter(t => t.id !== tempId)); });
  }

  function handleEdit(draft: { title: string; dueDate: string; owner: string; type: string; status: TaskStatus }) {
    if (!editingTask) return;
    const prev = editingTask;
    const updated: InstagramTask = { ...prev, ...draft };
    setIgTaskList(list => list.map(t => t.id === prev.id ? updated : t));
    setModal(null);
    setEditingTask(null);
    requestJson<InstagramTask>(`/api/instagram/${prev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(saved => setIgTaskList(list => list.map(t => t.id === prev.id ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(list => list.map(t => t.id === prev.id ? prev : t)); });
  }

  function handleComplete(task: InstagramTask) {
    const updated: InstagramTask = { ...task, status: "Complete" };
    setIgTaskList(prev => prev.map(t => t.id === task.id ? updated : t));
    requestJson<InstagramTask>(`/api/instagram/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Complete" }),
    })
      .then(saved => setIgTaskList(prev => prev.map(t => t.id === task.id ? saved : t)))
      .catch(err => { console.error(err); setIgTaskList(prev => prev.map(t => t.id === task.id ? task : t)); });
  }

  function handleDelete(task: InstagramTask) {
    setIgTaskList(prev => prev.filter(t => t.id !== task.id));
    setDeleteTarget(null);
    requestJson<void>(`/api/instagram/${task.id}`, { method: "DELETE" })
      .catch(err => { console.error(err); setIgTaskList(prev => [...prev, task]); });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090f]">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeSection="Instagram"
        onNavClick={() => {}}
      />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <header className="toolbar-frosted relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6">

          {/* Mobile menu */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Title */}
          <div className="relative min-w-0 shrink-0">
            <p className="text-[14px] font-semibold leading-tight text-white">Instagram</p>
            <p className="hidden text-[11px] leading-tight text-slate-400 sm:block">{currentUser?.org?.name ?? "ChaptOS"} · Instagram Calendar</p>
          </div>

          {/* View toggle */}
          <div className="relative ml-4 flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
            {(["list", "calendar"] as const).map(view => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize transition-all duration-150 ${
                  activeView === view
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {view}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* CTA + avatar */}
          <div className="relative flex shrink-0 items-center gap-2">
            <button
              onClick={() => { setEditingTask(null); setModal("create"); }}
              className="flex h-8 items-center gap-1.5 rounded-full border border-indigo-500/20 bg-white/[0.04] px-4 text-[12px] font-semibold text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_-18px_rgba(99,102,241,0.45)] transition-all hover:border-indigo-400/35 hover:bg-indigo-500/[0.08] hover:text-white"
            >
              <svg className="h-3.5 w-3.5 shrink-0 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Post</span>
            </button>
          </div>
        </header>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-[#10121a] px-5 py-4 animate-pulse">
                    <div className="h-8 w-8 shrink-0 rounded-lg bg-white/[0.05]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-48 rounded bg-white/[0.05]" />
                      <div className="h-2.5 w-32 rounded bg-white/[0.05]" />
                    </div>
                    <div className="h-5 w-16 rounded-full bg-white/[0.05]" />
                  </div>
                ))}
              </div>
            ) : activeView === "list" ? (
              <ListView
                tasks={igTaskList}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onComplete={handleComplete}
              />
            ) : (
              <CalendarView
                tasks={igTaskList}
                onEdit={openEdit}
              />
            )}
          </div>
        </div>
      </div>

      {/* Create modal */}
      {modal === "create" && (
        <Modal title="Add Post" onClose={() => setModal(null)}>
          <AddIGTaskForm brotherNames={brotherNames} onSubmit={handleCreate} />
        </Modal>
      )}

      {/* Edit modal */}
      {modal === "edit" && editingTask && (
        <Modal title="Edit Post" onClose={() => { setModal(null); setEditingTask(null); }}>
          <AddIGTaskForm
            brotherNames={brotherNames}
            initial={editingTask}
            onSubmit={handleEdit}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal title="Delete Post" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-[13px] text-slate-300">
              Delete <span className="font-semibold text-white">&ldquo;{deleteTarget.title}&rdquo;</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-500"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border border-white/[0.08] px-4 py-2.5 text-[13px] text-slate-400 transition-colors hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
