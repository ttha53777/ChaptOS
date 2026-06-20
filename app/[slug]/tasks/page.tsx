"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { Modal, FieldLabel, ConfirmDialog } from "../../components/dashboard/primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "../../components/dashboard/styles";
import { useChapter } from "../../context/ChapterContext";
import { Task, fmtDate } from "../../data";
import { requestJson } from "../../lib/api";
import { taskUrgency, type TaskUrgency, URGENCY_ORDER } from "@/lib/tasks/urgency";
import "../../components/dashboard/dashboard-ledger.css";
import "./tasks-ledger.css";

// A role summary for the assignee picker, from /api/roles (listRoles).
type RoleOption = { id: number; name: string; color: string | null };

type AssigneeFilter = "all" | "mine";

const URGENCY_LABEL: Record<TaskUrgency, string> = {
  overdue: "Overdue", urgent: "Urgent", "due-soon": "Due soon", upcoming: "Upcoming", none: "No date",
};
// Tone drives the group label color AND the row's left status spine (s-*).
const URGENCY_TONE: Record<TaskUrgency, string> = {
  overdue: "rose", urgent: "rose", "due-soon": "gold", upcoming: "", none: "",
};

const FORM_EMPTY = { title: "", dueDate: "", notes: "", brotherIds: [] as number[], roleIds: [] as number[] };
type FormState = typeof FORM_EMPTY;

// ── Date helpers ──────────────────────────────────────────────────────────────
function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** Whole calendar days between today and an ISO due date (due - today). */
function daysUntil(dueISO: string, today: Date): number {
  const [y, m, d] = dueISO.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
}
/** Relative-time label + tone for an OPEN task. Done tasks use whenLabel below. */
function relWhen(dueDate: string | null, today: Date): { txt: string; cls: string } {
  if (!dueDate) return { txt: "No date", cls: "" };
  const n = daysUntil(dueDate, today);
  if (n < 0) return { txt: `${Math.abs(n)}d late`, cls: "late" };
  if (n === 0) return { txt: "Due today", cls: "late" };
  if (n === 1) return { txt: "Due tomorrow", cls: "soon" };
  if (n <= 7) return { txt: `Due in ${n}d`, cls: "soon" };
  return { txt: `Due ${fmtDate(dueDate)}`, cls: "" };
}
/** A done task is no longer "late" — show a neutral completed label. */
function whenLabel(t: Task, today: Date): { txt: string; cls: string } {
  if (t.status === "done") return { txt: t.dueDate ? `Done · was due ${fmtDate(t.dueDate)}` : "Done", cls: "" };
  return relWhen(t.dueDate, today);
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function TasksPage() {
  const { taskList, setTaskList, brotherList, currentUser, can } = useChapter();
  const params = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const canManage = can("MANAGE_TASKS");
  const selfId = currentUser?.id ?? null;
  // Role ids the current user holds — used to resolve "Mine" (assigned directly
  // or via a held role) on the client, mirroring the server's isAssignee.
  const myRoleIds = useMemo(() => new Set((currentUser?.roles ?? []).map(r => r.id)), [currentUser]);

  // Today as a stable Date for all urgency / relative-time math this render.
  const today = useMemo(() => startOfToday(), []);
  const todayLabel = useMemo(
    () => today.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    [today],
  );

  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modal, setModal] = useState<{ kind: "add" } | { kind: "edit"; id: number } | null>(null);
  const [form, setForm] = useState<FormState>(FORM_EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null);

  // Load the org's roles for the assignee picker.
  useEffect(() => {
    requestJson<RoleOption[]>("/api/roles").then(setRoles).catch(() => setRoles([]));
  }, []);

  const isMine = useCallback((t: Task) => t.assignments.some(a =>
    (a.brotherId != null && a.brotherId === selfId) || (a.roleId != null && myRoleIds.has(a.roleId)),
  ), [selfId, myRoleIds]);

  const openAdd = useCallback(() => { setForm(FORM_EMPTY); setModal({ kind: "add" }); }, []);
  const openEdit = useCallback((t: Task) => {
    setForm({
      title: t.title,
      dueDate: t.dueDate ?? "",
      notes: t.notes ?? "",
      brotherIds: t.assignments.filter(a => a.brotherId != null).map(a => a.brotherId!),
      roleIds: t.assignments.filter(a => a.roleId != null).map(a => a.roleId!),
    });
    setModal({ kind: "edit", id: t.id });
  }, []);

  // Honor ?new=1 (open the create modal) and ?task=<id> (open edit) from links on
  // the dashboard / timeline.
  useEffect(() => {
    if (params.get("new") === "1") { openAdd(); return; }
    const taskParam = params.get("task");
    if (taskParam) {
      const t = taskList.find(x => x.id === Number(taskParam));
      if (t) openEdit(t);
    }
    // run once on mount; taskList is stable enough for the initial deep-link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtering + grouping ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = taskList;
    if (assigneeFilter === "mine") rows = rows.filter(isMine);
    if (!showDone) rows = rows.filter(t => t.status !== "done");
    return rows;
  }, [taskList, assigneeFilter, showDone, isMine]);

  const openTasks = filtered.filter(t => t.status !== "done");
  const doneTasks = filtered.filter(t => t.status === "done");

  // Group open tasks by computed urgency, most pressing first.
  const groups = useMemo(() => {
    return URGENCY_ORDER
      .map(u => ({ urgency: u, items: openTasks.filter(t => taskUrgency(t.dueDate, today) === u) }))
      .filter(g => g.items.length > 0);
  }, [openTasks, today]);

  const counts = useMemo(() => {
    const open = taskList.filter(t => t.status !== "done");
    const overdueTasks = open.filter(t => taskUrgency(t.dueDate, today) === "overdue");
    const dueSoon = open.filter(t => ["urgent", "due-soon"].includes(taskUrgency(t.dueDate, today))).length;
    // Oldest overdue, for the glance note.
    const oldestLate = overdueTasks.reduce(
      (max, t) => Math.max(max, t.dueDate ? Math.abs(daysUntil(t.dueDate, today)) : 0), 0);
    const owners = new Set<string>();
    for (const t of open) for (const a of t.assignments) {
      if (a.roleId != null) owners.add(`r${a.roleId}`);
      else if (a.brotherId != null) owners.add(`b${a.brotherId}`);
    }
    return { overdue: overdueTasks.length, dueSoon, open: open.length, done: taskList.length - open.length, oldestLate, owners: owners.size };
  }, [taskList, today]);

  // Honest, computed digest (not an AI call) — names the most pressing reality.
  const digest = useMemo(() => {
    if (counts.open === 0) {
      return counts.done > 0
        ? <>Nothing open right now — <b>{counts.done} done</b> this semester. The worklist is clear.</>
        : <>No tasks on the board yet. Hand the first one out to get the chapter moving.</>;
    }
    const parts: React.ReactNode[] = [];
    if (counts.overdue > 0) parts.push(<><b>{counts.overdue} {counts.overdue === 1 ? "task is" : "tasks are"} overdue</b></>);
    if (counts.dueSoon > 0) parts.push(<>{counts.overdue > 0 ? "and " : ""}{counts.dueSoon} {counts.dueSoon === 1 ? "is" : "are"} due this week</>);
    if (parts.length === 0) parts.push(<><b>{counts.open} open</b>, nothing overdue or due this week</>);
    return <>{parts.map((p, i) => <React.Fragment key={i}>{i > 0 ? " " : ""}{p}</React.Fragment>)} — across {counts.owners} {counts.owners === 1 ? "owner" : "owners"}.</>;
  }, [counts]);

  // ── Mutations (optimistic, mirroring the parties/dashboard pattern) ─────────
  async function submitForm() {
    if (!form.title.trim()) { setError("A task needs a title."); return; }
    if (form.brotherIds.length + form.roleIds.length === 0) { setError("Assign at least one member or role."); return; }
    setError(null);
    const payload = {
      title: form.title.trim(),
      dueDate: form.dueDate || undefined,
      notes: form.notes.trim() || undefined,
      assigneeBrotherIds: form.brotherIds,
      assigneeRoleIds: form.roleIds,
    };

    try {
      if (modal?.kind === "edit") {
        const saved = await requestJson<Task>(`/api/tasks/${modal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, dueDate: form.dueDate || null, notes: form.notes.trim() || null }),
        });
        setTaskList(prev => prev.map(x => x.id === saved.id ? saved : x));
      } else {
        const saved = await requestJson<Task>("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setTaskList(prev => [...prev, saved]);
      }
      setModal(null);
    } catch {
      setError("Could not save the task. Please try again.");
    }
  }

  async function setStatus(t: Task, status: "open" | "done") {
    const previous = taskList;
    setTaskList(prev => prev.map(x => x.id === t.id ? { ...x, status } : x));
    try {
      const saved = await requestJson<Task>(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setTaskList(prev => prev.map(x => x.id === saved.id ? saved : x));
    } catch {
      setTaskList(previous);
      setError("Could not update the task.");
    }
  }

  async function doDelete(id: number) {
    const previous = taskList;
    setTaskList(prev => prev.filter(x => x.id !== id));
    setConfirmDelete(null);
    try {
      await requestJson<void>(`/api/tasks/${id}`, { method: "DELETE" });
    } catch {
      setTaskList(previous);
      setError("Could not delete the task.");
    }
  }

  function toggleId(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  }

  // An assignee can flip status even without MANAGE_TASKS.
  const canCompleteTask = (t: Task) => canManage || isMine(t);

  // Glance measures. note tone keys off the same semantics as the spines.
  const measures = [
    { k: "Overdue", v: counts.overdue, tone: "rose", note: counts.overdue > 0 ? `oldest is ${counts.oldestLate}d late` : "all clear", noteTone: counts.overdue > 0 ? "bad" : "" },
    { k: "Due soon", v: counts.dueSoon, tone: "gold", note: "within 7 days", noteTone: counts.dueSoon > 0 ? "warn" : "" },
    { k: "Open", v: counts.open, tone: "", note: `across ${counts.owners} ${counts.owners === 1 ? "owner" : "owners"}`, noteTone: "" },
    { k: "Done", v: counts.done, tone: "sage", note: "this semester", noteTone: "" },
  ] as const;

  const hasAny = taskList.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0d0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Tasks" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile toolbar */}
        <header className="toolbar-frosted dash-toolbar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 sm:px-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.07] lg:hidden"
            aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="truncate text-[13px] font-semibold text-[#ece7dd]">Tasks</span>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-tasks" data-dashboard-theme="dusk">
            {/* ── Briefing ── */}
            <header className="tk-briefing">
              <div>
                <div className="tk-kicker">Tasks · <span className="today">Today {todayLabel}</span></div>
                <h1 className="tk-title">Things to get <em>done</em>.</h1>
                <div className="tk-digest">
                  <span className="tk-digest-chip">CHAPTER</span>
                  <p>{digest}</p>
                </div>
              </div>
              {canManage && (
                <button className="tk-add" onClick={openAdd}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                  New task
                </button>
              )}
            </header>

            {/* ── Glance strip ── */}
            <div className="tk-glance">
              {measures.map(m => (
                <div key={m.k} className="tk-measure">
                  <div className="k">{m.k}</div>
                  <div className={`v ${m.tone}`}>{m.v}</div>
                  <div className={`note ${m.noteTone}`}>{m.note}</div>
                </div>
              ))}
            </div>

            {/* ── Controls ── */}
            <div className="tk-controls">
              <div className="tk-seg">
                <button className={assigneeFilter === "all" ? "on" : ""} onClick={() => setAssigneeFilter("all")}>All tasks</button>
                <button className={assigneeFilter === "mine" ? "on" : ""} onClick={() => setAssigneeFilter("mine")}>Assigned to me</button>
              </div>
              <button
                type="button"
                className={`tk-check${showDone ? " on" : ""}`}
                aria-pressed={showDone}
                onClick={() => setShowDone(v => !v)}
              >
                <span className="box">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                Show done
              </button>
            </div>

            {error && <div className="tk-error" role="alert">{error}</div>}

            {/* ── Body ── */}
            {!hasAny ? (
              <div className="tk-empty">
                <div className="glyph">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </div>
                <h3>No tasks yet.</h3>
                <p>Hand out tasks and deadlines to members or roles, and track what gets done. Dated tasks also show up on the chapter timeline.</p>
                {canManage && (
                  <button className="tk-add" onClick={openAdd}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                    Create the first task
                  </button>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="tk-empty">
                <div className="glyph">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                </div>
                <h3>{assigneeFilter === "mine" ? "You're all caught up." : "Nothing to show."}</h3>
                <p>
                  {assigneeFilter === "mine"
                    ? "No open tasks are assigned to you or your roles right now."
                    : <>Everything is done — flip on <button className="tk-link" onClick={() => setShowDone(true)}>Show done</button> to review it.</>}
                </p>
              </div>
            ) : (
              <div className="tk-groups">
                {groups.map(g => (
                  <section key={g.urgency}>
                    <p className={`tk-group-label ${URGENCY_TONE[g.urgency]}`}>
                      <span className="dot" />{URGENCY_LABEL[g.urgency]} <span className="ct">({g.items.length})</span>
                    </p>
                    <div className="tk-list">
                      {g.items.map(t => (
                        <TaskRow key={t.id} task={t} today={today} spine={`s-${g.urgency}`} canManage={canManage} canComplete={canCompleteTask(t)}
                          onComplete={() => setStatus(t, "done")} onEdit={() => openEdit(t)}
                          onDelete={() => setConfirmDelete({ id: t.id, title: t.title })} />
                      ))}
                    </div>
                  </section>
                ))}

                {showDone && doneTasks.length > 0 && (
                  <section>
                    <p className="tk-group-label sage"><span className="dot" />Done <span className="ct">({doneTasks.length})</span></p>
                    <div className="tk-list">
                      {doneTasks.map(t => (
                        <TaskRow key={t.id} task={t} today={today} spine="" canManage={canManage} canComplete={canCompleteTask(t)}
                          onReopen={() => setStatus(t, "open")} onEdit={() => openEdit(t)}
                          onDelete={() => setConfirmDelete({ id: t.id, title: t.title })} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {modal && (
        <Modal title={modal.kind === "edit" ? "Edit task" : "New task"} tone="dusk" onClose={() => setModal(null)}>
          <div className="tk-form">
            <div>
              <FieldLabel htmlFor="tk-title" tone="dusk">Title</FieldLabel>
              <input id="tk-title" className={inputDuskCls} value={form.title} autoFocus
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs doing…" />
            </div>
            <div>
              <FieldLabel htmlFor="tk-due" tone="dusk">Due date <span className="tk-opt">(optional — a dated task shows on the timeline)</span></FieldLabel>
              <input id="tk-due" type="date" className={inputDuskCls} value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <FieldLabel tone="dusk">Assign to members</FieldLabel>
              <div className="tk-picker">
                {brotherList.length === 0 && <span className="tk-opt">No members yet.</span>}
                {brotherList.map(b => (
                  <button key={b.id} type="button"
                    className={`tk-pick-chip${form.brotherIds.includes(b.id) ? " on" : ""}`}
                    onClick={() => setForm(f => ({ ...f, brotherIds: toggleId(f.brotherIds, b.id) }))}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel tone="dusk">Assign to roles <span className="tk-opt">(expands to current holders)</span></FieldLabel>
              <div className="tk-picker">
                {roles.length === 0 && <span className="tk-opt">No roles defined.</span>}
                {roles.map(r => (
                  <button key={r.id} type="button"
                    className={`tk-pick-chip role${form.roleIds.includes(r.id) ? " on" : ""}`}
                    style={r.color ? { ["--chip" as string]: r.color } : undefined}
                    onClick={() => setForm(f => ({ ...f, roleIds: toggleId(f.roleIds, r.id) }))}>
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="tk-notes" tone="dusk">Notes <span className="tk-opt">(optional)</span></FieldLabel>
              <textarea id="tk-notes" className={inputDuskCls} rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {error && <p className="tk-form-error">{error}</p>}
            <button className={btnDuskPrimaryCls} onClick={submitForm}>
              {modal.kind === "edit" ? "Save changes" : "Create task"}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete task"
          message={`Delete "${confirmDelete.title}"? This can't be undone.`}
          tone="slate"
          onConfirm={() => doDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function TaskRow({ task, today, spine, canManage, canComplete, onComplete, onReopen, onEdit, onDelete }: {
  task: Task;
  today: Date;
  spine: string;
  canManage: boolean;
  canComplete: boolean;
  onComplete?: () => void;
  onReopen?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  const when = whenLabel(task, today);
  // Clicking the circle completes (open) or reopens (done) — only if permitted.
  const toggle = done ? onReopen : onComplete;
  const canToggle = canComplete && !!toggle;

  return (
    <div className={`tk-row${done ? " done" : ` ${spine}`}`}>
      <button
        className="tk-circle"
        disabled={!canToggle}
        title={done ? "Reopen" : "Mark done"}
        aria-label={done ? "Reopen task" : "Mark task done"}
        onClick={() => canToggle && toggle?.()}
      >
        <svg viewBox="0 0 24 24" fill="none"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </button>

      <div className="tk-row-main">
        <p className="tk-row-title">{task.title}</p>
        <div className="tk-row-meta">
          <span className={`tk-when ${when.cls}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" /></svg>
            {when.txt}
          </span>
          {task.assignments.length > 0 && (
            <>
              <span className="tk-sep">·</span>
              <span className="tk-chips">
                {task.assignments.map(a => a.role ? (
                  <span key={`r${a.id}`} className="tk-chip role" style={a.role.color ? { ["--rc" as string]: a.role.color } : undefined}>
                    <span className="pip" />{a.role.name}
                  </span>
                ) : a.brother ? (
                  <span key={`b${a.id}`} className="tk-chip">
                    <span className="av">{initials(a.brother.name)}</span>{a.brother.name}
                  </span>
                ) : null)}
              </span>
            </>
          )}
          {task.notes && (
            <>
              <span className="tk-sep">·</span>
              <span className="tk-note-snip">{task.notes}</span>
            </>
          )}
        </div>
      </div>

      {canManage && (
        <div className="tk-row-acts">
          <button className="tk-act" title="Edit" onClick={onEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.2 5.2l3.6 3.6M16.7 3.7a2.5 2.5 0 113.6 3.6L7 20.5l-4 1 1-4z" /></svg>
          </button>
          <button className="tk-act danger" title="Delete" onClick={onDelete}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0l-.7 12.1A2 2 0 0114.4 21H9.6a2 2 0 01-2-1.9L7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
