"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { Modal, FieldLabel, ConfirmDialog } from "../../components/dashboard/primitives";
import { inputDuskCls, btnDuskPrimaryCls } from "../../components/dashboard/styles";
import { useChapter } from "../../context/ChapterContext";
import { Task, fmtDate, taskAssigneeLabel } from "../../data";
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
const URGENCY_TONE: Record<TaskUrgency, string> = {
  overdue: "rose", urgent: "rose", "due-soon": "gold", upcoming: "", none: "",
};

const FORM_EMPTY = { title: "", dueDate: "", notes: "", brotherIds: [] as number[], roleIds: [] as number[] };
type FormState = typeof FORM_EMPTY;

export default function TasksPage() {
  const { taskList, setTaskList, brotherList, currentUser, can } = useChapter();
  const params = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const canManage = can("MANAGE_TASKS");
  const selfId = currentUser?.id ?? null;
  // Role ids the current user holds — used to resolve "Mine" (assigned directly
  // or via a held role) on the client, mirroring the server's isAssignee.
  const myRoleIds = useMemo(() => new Set((currentUser?.roles ?? []).map(r => r.id)), [currentUser]);

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
      .map(u => ({ urgency: u, items: openTasks.filter(t => taskUrgency(t.dueDate) === u) }))
      .filter(g => g.items.length > 0);
  }, [openTasks]);

  const counts = useMemo(() => {
    const open = taskList.filter(t => t.status !== "done");
    const overdue = open.filter(t => taskUrgency(t.dueDate) === "overdue").length;
    const dueSoon = open.filter(t => ["urgent", "due-soon"].includes(taskUrgency(t.dueDate))).length;
    return { overdue, dueSoon, open: open.length, done: taskList.length - open.length };
  }, [taskList]);

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
        <header className="tk-head">
          <div>
            <h1 className="tk-title">Tasks</h1>
            <p className="tk-sub">Hand out tasks and deadlines to members or roles, and track what gets done.</p>
          </div>
          {canManage && (
            <button className="tk-add" onClick={openAdd}>+ New task</button>
          )}
        </header>

        <div className="tk-stats">
          {([["Overdue", counts.overdue, "rose"], ["Due soon", counts.dueSoon, "gold"], ["Open", counts.open, ""], ["Done", counts.done, "ok"]] as const).map(([label, n, tone]) => (
            <div key={label} className="tk-stat"><p className={`n ${tone}`}>{n}</p><p className="l">{label}</p></div>
          ))}
        </div>

        <div className="tk-filters">
          <div className="tk-seg">
            <button className={assigneeFilter === "all" ? "on" : ""} onClick={() => setAssigneeFilter("all")}>All tasks</button>
            <button className={assigneeFilter === "mine" ? "on" : ""} onClick={() => setAssigneeFilter("mine")}>Assigned to me</button>
          </div>
          <label className="tk-check">
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
            Show done
          </label>
        </div>

        {error && <div className="tk-error" role="alert">{error}</div>}

        {filtered.length === 0 ? (
          <div className="tk-empty">
            {assigneeFilter === "mine" ? "Nothing assigned to you right now." : "No tasks yet."}
            {canManage && assigneeFilter === "all" && <> Click <button className="tk-link" onClick={openAdd}>New task</button> to add one.</>}
          </div>
        ) : (
          <div className="tk-groups">
            {groups.map(g => (
              <section key={g.urgency} className="tk-group">
                <p className={`tk-group-label ${URGENCY_TONE[g.urgency]}`}>{URGENCY_LABEL[g.urgency]} <span className="ct">({g.items.length})</span></p>
                <div className="tk-list">
                  {g.items.map(t => (
                    <TaskRow key={t.id} task={t} canManage={canManage} canComplete={canCompleteTask(t)}
                      onComplete={() => setStatus(t, "done")} onEdit={() => openEdit(t)}
                      onDelete={() => setConfirmDelete({ id: t.id, title: t.title })} />
                  ))}
                </div>
              </section>
            ))}

            {showDone && doneTasks.length > 0 && (
              <section className="tk-group">
                <p className="tk-group-label ok">Done <span className="ct">({doneTasks.length})</span></p>
                <div className="tk-list">
                  {doneTasks.map(t => (
                    <TaskRow key={t.id} task={t} canManage={canManage} canComplete={canCompleteTask(t)}
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
                    className={`tk-chip${form.brotherIds.includes(b.id) ? " on" : ""}`}
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
                    className={`tk-chip role${form.roleIds.includes(r.id) ? " on" : ""}`}
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

function TaskRow({ task, canManage, canComplete, onComplete, onReopen, onEdit, onDelete }: {
  task: Task;
  canManage: boolean;
  canComplete: boolean;
  onComplete?: () => void;
  onReopen?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  return (
    <div className={`tk-row${done ? " done" : ""}`}>
      <div className="tk-row-main">
        <p className="tk-row-title">{task.title}</p>
        <p className="tk-row-meta">
          {task.dueDate ? fmtDate(task.dueDate) : "No date"} · {taskAssigneeLabel(task, 3)}
          {task.notes ? ` · ${task.notes}` : ""}
        </p>
      </div>
      <div className="tk-row-acts">
        {!done && canComplete && onComplete && (
          <button className="tk-act ok" title="Mark done" onClick={onComplete}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </button>
        )}
        {done && canComplete && onReopen && (
          <button className="tk-act" title="Reopen" onClick={onReopen}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        )}
        {canManage && (
          <>
            <button className="tk-act" title="Edit" onClick={onEdit}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <button className="tk-act danger" title="Delete" onClick={onDelete}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
