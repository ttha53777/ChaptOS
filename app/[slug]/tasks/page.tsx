"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "../../components/Sidebar";
import { Modal, ConfirmDialog } from "../../components/dashboard/primitives";
import { TaskForm, type RoleOption, type TaskFormValue } from "../../components/dashboard/TaskForm";
import { PollForm, type PollFormValue } from "../../components/dashboard/PollForm";
import { useChapter } from "../../context/ChapterContext";
import { useActiveSemester } from "../../hooks/useActiveSemester";
import { Task, Poll, fmtDate } from "../../data";
import { requestJson } from "../../lib/api";
import { taskUrgency, type TaskUrgency, URGENCY_ORDER } from "@/lib/tasks/urgency";
import "../../components/dashboard/dashboard-ledger.css";
import "./tasks-ledger.css";

type AssigneeFilter = "all" | "mine";

const URGENCY_LABEL: Record<TaskUrgency, string> = {
  overdue: "Overdue", urgent: "Urgent", "due-soon": "Due soon", upcoming: "Upcoming", none: "No date",
};
// Tone drives the group label color AND the row's left status spine (s-*).
const URGENCY_TONE: Record<TaskUrgency, string> = {
  overdue: "rose", urgent: "rose", "due-soon": "gold", upcoming: "", none: "",
};

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
  const { taskList, setTaskList, pollList, setPollList, brotherList, currentUser, can } = useChapter();
  const params = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const canManage = can("MANAGE_TASKS");
  const canManagePolls = can("MANAGE_POLLS");
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

  const activeSemester = useActiveSemester();
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The modal carries the task being edited (for the form's initial values), or
  // { kind: "add" } for a fresh create.
  const [modal, setModal] = useState<{ kind: "add" } | { kind: "edit"; task: Task } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null);

  // Poll modal + delete-confirm, mirroring the task pair above.
  const [pollModal, setPollModal] = useState<{ kind: "add" } | { kind: "edit"; poll: Poll } | null>(null);
  const [pollFormError, setPollFormError] = useState<string | null>(null);
  const [confirmDeletePoll, setConfirmDeletePoll] = useState<{ id: number; title: string } | null>(null);

  // Poll-detail (voting) modal. Tracked by id, not a snapshot, so the modal stays
  // in sync as vote()/setPollStatus() replace the poll object in pollList.
  const [pollViewId, setPollViewId] = useState<number | null>(null);
  const pollView = pollViewId == null ? null : pollList.find(p => p.id === pollViewId) ?? null;

  // Load the org's roles for the assignee picker.
  useEffect(() => {
    requestJson<RoleOption[]>("/api/roles").then(setRoles).catch(() => setRoles([]));
  }, []);

  const isMine = useCallback((t: Task) => t.assignments.some(a =>
    (a.brotherId != null && a.brotherId === selfId) || (a.roleId != null && myRoleIds.has(a.roleId)),
  ), [selfId, myRoleIds]);

  const openAdd = useCallback(() => { setFormError(null); setModal({ kind: "add" }); }, []);
  const openEdit = useCallback((t: Task) => { setFormError(null); setModal({ kind: "edit", task: t }); }, []);
  const openAddPoll = useCallback(() => { setPollFormError(null); setPollModal({ kind: "add" }); }, []);
  const openEditPoll = useCallback((p: Poll) => { setPollFormError(null); setPollModal({ kind: "edit", poll: p }); }, []);
  const openPollView = useCallback((p: Poll) => { setError(null); setPollViewId(p.id); }, []);

  // Whether the current user may vote on a poll (assigned directly or via a held role).
  const canVote = useCallback((p: Poll) => p.assignments.some(a =>
    (a.brotherId != null && a.brotherId === selfId) || (a.roleId != null && myRoleIds.has(a.roleId)),
  ), [selfId, myRoleIds]);

  // Honor ?new=1 / ?task=<id> (tasks) and ?newPoll=1 / ?poll=<id> (polls) from
  // links on the dashboard / timeline.
  useEffect(() => {
    if (params.get("newPoll") === "1") { openAddPoll(); return; }
    const pollParam = params.get("poll");
    if (pollParam) {
      const p = pollList.find(x => x.id === Number(pollParam));
      if (p) { openEditPoll(p); return; }
    }
    if (params.get("new") === "1") { openAdd(); return; }
    const taskParam = params.get("task");
    if (taskParam) {
      const t = taskList.find(x => x.id === Number(taskParam));
      if (t) openEdit(t);
    }
    // run once on mount; lists are stable enough for the initial deep-link
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

  // Computed poll digest — open polls, total votes, and how many you still owe.
  const pollDigest = useMemo(() => {
    if (pollList.length === 0) {
      return <>No polls yet. Ask the chapter a question to get a read on the room.</>;
    }
    const open = pollList.filter(p => p.status === "open");
    const awaitingMine = open.filter(p => canVote(p) && p.myVoteOptionId == null).length;
    const totalVotes = pollList.reduce((n, p) => n + p.totalVotes, 0);
    if (open.length === 0) {
      return <>All polls are <b>closed</b> — {totalVotes} {totalVotes === 1 ? "vote" : "votes"} cast in total.</>;
    }
    return (
      <>
        <b>{open.length} open {open.length === 1 ? "poll" : "polls"}</b>
        {awaitingMine > 0 ? <> — {awaitingMine} {awaitingMine === 1 ? "is" : "are"} waiting on your vote</> : <> — you're all caught up</>}.
      </>
    );
  }, [pollList, canVote]);

  // Polls pinned above the task list. Filters mirror the task filters: "mine"
  // keeps polls you can vote on; "Show done" reveals closed polls. Sort puts
  // polls awaiting your vote first, then other open polls by close date, then
  // closed polls last.
  const pinnedPolls = useMemo(() => {
    let rows = pollList;
    if (assigneeFilter === "mine") rows = rows.filter(canVote);
    if (!showDone) rows = rows.filter(p => p.status !== "closed");
    const awaitsMine = (p: Poll) => p.status === "open" && canVote(p) && p.myVoteOptionId == null;
    const closeKey = (p: Poll) => p.closeDate ? daysUntil(p.closeDate, today) : Number.POSITIVE_INFINITY;
    return [...rows].sort((a, b) => {
      // Closed polls always sink to the bottom.
      if ((a.status === "closed") !== (b.status === "closed")) return a.status === "closed" ? 1 : -1;
      // Then polls awaiting the current user's vote float to the top.
      if (awaitsMine(a) !== awaitsMine(b)) return awaitsMine(a) ? -1 : 1;
      // Then by soonest close date.
      return closeKey(a) - closeKey(b);
    });
  }, [pollList, assigneeFilter, showDone, canVote, today]);

  // ── Mutations (optimistic, mirroring the parties/dashboard pattern) ─────────
  // TaskForm validates title + at least-one-assignee; here we just persist.
  async function submitForm(value: TaskFormValue) {
    setFormError(null);
    const base = {
      title: value.title,
      assigneeBrotherIds: value.assigneeBrotherIds,
      assigneeRoleIds: value.assigneeRoleIds,
    };

    try {
      if (modal?.kind === "edit") {
        // On edit, empties clear the field (null), not "leave unchanged" (undefined).
        const saved = await requestJson<Task>(`/api/tasks/${modal.task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, dueDate: value.dueDate || null, notes: value.notes || null }),
        });
        setTaskList(prev => prev.map(x => x.id === saved.id ? saved : x));
      } else {
        const saved = await requestJson<Task>("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, dueDate: value.dueDate || undefined, notes: value.notes || undefined }),
        });
        setTaskList(prev => [...prev, saved]);
      }
      setModal(null);
    } catch {
      setFormError("Could not save the task. Please try again.");
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

  // ── Poll mutations (optimistic, mirroring the task handlers above) ───────────
  async function submitPollForm(value: PollFormValue) {
    setPollFormError(null);
    const base = {
      question: value.question,
      assigneeBrotherIds: value.assigneeBrotherIds,
      assigneeRoleIds: value.assigneeRoleIds,
    };
    try {
      if (pollModal?.kind === "edit") {
        // Options only sent when still editable (the form locks them once voting
        // starts); sending the unchanged set would be rejected server-side.
        const editable = pollModal.poll.totalVotes === 0;
        const saved = await requestJson<Poll>(`/api/polls/${pollModal.poll.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...base,
            closeDate: value.closeDate || null,
            ...(editable ? { options: value.options } : {}),
          }),
        });
        setPollList(prev => prev.map(x => x.id === saved.id ? saved : x));
      } else {
        const saved = await requestJson<Poll>("/api/polls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, options: value.options, closeDate: value.closeDate || undefined }),
        });
        setPollList(prev => [...prev, saved]);
      }
      setPollModal(null);
    } catch {
      setPollFormError("Could not save the poll. Please try again.");
    }
  }

  async function vote(poll: Poll, optionId: number) {
    // Optimistic: move this voter's pick, adjusting per-option counts + total.
    const previous = pollList;
    setPollList(prev => prev.map(p => {
      if (p.id !== poll.id) return p;
      const had = p.myVoteOptionId;
      if (had === optionId) return p; // no-op re-click
      const options = p.options.map(o => {
        if (o.id === optionId) return { ...o, voteCount: o.voteCount + 1 };
        if (o.id === had)      return { ...o, voteCount: Math.max(0, o.voteCount - 1) };
        return o;
      });
      return { ...p, options, myVoteOptionId: optionId, totalVotes: had == null ? p.totalVotes + 1 : p.totalVotes };
    }));
    try {
      const saved = await requestJson<Poll>(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      setPollList(prev => prev.map(p => p.id === saved.id ? saved : p));
    } catch {
      setPollList(previous);
      setError("Could not record your vote.");
    }
  }

  async function setPollStatus(poll: Poll, status: "open" | "closed") {
    const previous = pollList;
    setPollList(prev => prev.map(p => p.id === poll.id ? { ...p, status } : p));
    try {
      const saved = await requestJson<Poll>(`/api/polls/${poll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setPollList(prev => prev.map(p => p.id === saved.id ? saved : p));
    } catch {
      setPollList(previous);
      setError("Could not update the poll.");
    }
  }

  async function doDeletePoll(id: number) {
    const previous = pollList;
    setPollList(prev => prev.filter(x => x.id !== id));
    setConfirmDeletePoll(null);
    try {
      await requestJson<void>(`/api/polls/${id}`, { method: "DELETE" });
    } catch {
      setPollList(previous);
      setError("Could not delete the poll.");
    }
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

  const hasAny = taskList.length > 0 || pollList.length > 0;

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
                {pollList.length > 0 && (
                  <div className="tk-digest">
                    <span className="tk-digest-chip">POLLS</span>
                    <p>{pollDigest}</p>
                  </div>
                )}
              </div>
              {(canManage || canManagePolls) && (
                <div className="tk-briefing-acts">
                  {canManagePolls && (
                    <button className="tk-add ghost" onClick={openAddPoll}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                      New poll
                    </button>
                  )}
                  {canManage && (
                    <button className="tk-add" onClick={openAdd}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                      New task
                    </button>
                  )}
                </div>
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
                <h3>Nothing here yet.</h3>
                <p>Hand out tasks and deadlines to members or roles, or ask the chapter a question with a poll. Dated tasks and polls also show up on the chapter timeline.</p>
                <div className="tk-briefing-acts">
                  {canManagePolls && (
                    <button className="tk-add ghost" onClick={openAddPoll}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                      New poll
                    </button>
                  )}
                  {canManage && (
                    <button className="tk-add" onClick={openAdd}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                      New task
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="tk-groups">
                {/* Pinned polls — they read as rows in the same list, opening a vote modal on click. */}
                {pinnedPolls.length > 0 && (
                  <section>
                    <p className="tk-group-label gold"><span className="dot" />Polls <span className="ct">({pinnedPolls.length})</span></p>
                    <div className="tk-list">
                      {pinnedPolls.map(p => (
                        <PollRow key={p.id} poll={p} today={today} canManage={canManagePolls} canVote={canVote(p)}
                          onOpen={() => openPollView(p)}
                          onEdit={() => openEditPoll(p)}
                          onClose={() => setPollStatus(p, "closed")} onReopen={() => setPollStatus(p, "open")}
                          onDelete={() => setConfirmDeletePoll({ id: p.id, title: p.question })} />
                      ))}
                    </div>
                  </section>
                )}

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

                {/* No tasks (but polls exist, or filtered out) — quiet note under the polls. */}
                {groups.length === 0 && !(showDone && doneTasks.length > 0) && (
                  <div className="tk-empty">
                    <div className="glyph">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                    </div>
                    <h3>{assigneeFilter === "mine" ? "You're all caught up." : "No open tasks."}</h3>
                    <p>
                      {assigneeFilter === "mine"
                        ? "No open tasks are assigned to you or your roles right now."
                        : taskList.length === 0
                          ? <>No tasks on the board yet.{canManage ? <> <button className="tk-link" onClick={openAdd}>Add one</button> to get the chapter moving.</> : null}</>
                          : <>Everything is done — flip on <button className="tk-link" onClick={() => setShowDone(true)}>Show done</button> to review it.</>}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {modal && (
        <Modal title={modal.kind === "edit" ? "Edit task" : "New task"} tone="dusk" onClose={() => setModal(null)}>
          <TaskForm
            brothers={brotherList}
            roles={roles}
            minDate={activeSemester?.startDate}
            maxDate={activeSemester?.endDate}
            submitLabel={modal.kind === "edit" ? "Save changes" : "Create task"}
            error={formError}
            initial={modal.kind === "edit" ? {
              title: modal.task.title,
              dueDate: modal.task.dueDate ?? "",
              notes: modal.task.notes ?? "",
              brotherIds: modal.task.assignments.filter(a => a.brotherId != null).map(a => a.brotherId!),
              roleIds: modal.task.assignments.filter(a => a.roleId != null).map(a => a.roleId!),
            } : undefined}
            onSubmit={submitForm}
          />
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

      {pollModal && (
        <Modal title={pollModal.kind === "edit" ? "Edit poll" : "New poll"} tone="dusk" onClose={() => setPollModal(null)}>
          <PollForm
            brothers={brotherList}
            roles={roles}
            minDate={activeSemester?.startDate}
            maxDate={activeSemester?.endDate}
            submitLabel={pollModal.kind === "edit" ? "Save changes" : "Create poll"}
            error={pollFormError}
            optionsLocked={pollModal.kind === "edit" && pollModal.poll.totalVotes > 0}
            initial={pollModal.kind === "edit" ? {
              question: pollModal.poll.question,
              closeDate: pollModal.poll.closeDate ?? "",
              options: pollModal.poll.options.map(o => o.label),
              brotherIds: pollModal.poll.assignments.filter(a => a.brotherId != null).map(a => a.brotherId!),
              roleIds: pollModal.poll.assignments.filter(a => a.roleId != null).map(a => a.roleId!),
            } : undefined}
            onSubmit={submitPollForm}
          />
        </Modal>
      )}

      {confirmDeletePoll && (
        <ConfirmDialog
          title="Delete poll"
          message={`Delete "${confirmDeletePoll.title}"? This deletes its votes too and can't be undone.`}
          tone="slate"
          onConfirm={() => doDeletePoll(confirmDeletePoll.id)}
          onCancel={() => setConfirmDeletePoll(null)}
        />
      )}

      {pollView && (
        <Modal title="Poll" tone="dusk" maxWidthClass="max-w-lg" onClose={() => setPollViewId(null)}>
          <PollCard poll={pollView} today={today} canManage={canManagePolls} canVote={canVote(pollView)}
            onVote={(optionId) => vote(pollView, optionId)}
            onClose={() => setPollStatus(pollView, "closed")} onReopen={() => setPollStatus(pollView, "open")}
            onEdit={() => { setPollViewId(null); openEditPoll(pollView); }}
            onDelete={() => { setPollViewId(null); setConfirmDeletePoll({ id: pollView.id, title: pollView.question }); }} />
        </Modal>
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

function PollRow({ poll, today, canManage, canVote, onOpen, onEdit, onClose, onReopen, onDelete }: {
  poll: Poll;
  today: Date;
  canManage: boolean;
  canVote: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const closed = poll.status === "closed";
  const total = poll.totalVotes;
  const dateLabel = closed
    ? (poll.closeDate ? `Closed · ${fmtDate(poll.closeDate)}` : "Closed")
    : relWhen(poll.closeDate, today).txt;
  const dateCls = closed ? "" : relWhen(poll.closeDate, today).cls;
  const awaitsMine = !closed && canVote && poll.myVoteOptionId == null;
  // Right-edge hint: open polls awaiting your vote say "Vote", everything else "View".
  const hint = awaitsMine ? "Vote" : closed ? "Results" : "View";

  return (
    <div className={`tk-row pl-row${closed ? " done" : ""}${awaitsMine ? " awaits" : ""}`}>
      <button className="pl-row-open" onClick={onOpen} aria-label={`Open poll: ${poll.question}`}>
        <span className="pl-row-glyph" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17V9m4 8V5m4 12v-6" /></svg>
        </span>
        <span className="tk-row-main">
          <span className="tk-row-title">{poll.question}</span>
          <span className="tk-row-meta">
            <span className={`pl-status ${closed ? "closed" : "open"}`}>{closed ? "Closed" : "Open"}</span>
            <span className="tk-sep">·</span>
            <span className={`tk-when ${dateCls}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" /></svg>
              {dateLabel}
            </span>
            <span className="tk-sep">·</span>
            <span className="pl-votes">{total} {total === 1 ? "vote" : "votes"}</span>
            {poll.assignments.length > 0 && (
              <>
                <span className="tk-sep">·</span>
                <span className="tk-chips">
                  {poll.assignments.map(a => a.role ? (
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
          </span>
        </span>
        <span className={`pl-row-hint${awaitsMine ? " on" : ""}`}>
          {hint}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" /></svg>
        </span>
      </button>

      {canManage && (
        <div className="tk-row-acts">
          <button className="tk-act" title="Edit" onClick={onEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.2 5.2l3.6 3.6M16.7 3.7a2.5 2.5 0 113.6 3.6L7 20.5l-4 1 1-4z" /></svg>
          </button>
          {closed ? (
            <button className="tk-act" title="Reopen" onClick={onReopen}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006 5.3M4 15a8 8 0 0014 3.7" /></svg>
            </button>
          ) : (
            <button className="tk-act" title="Close poll" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="5" y="11" width="14" height="9" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 018 0v4" /></svg>
            </button>
          )}
          <button className="tk-act danger" title="Delete" onClick={onDelete}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0l-.7 12.1A2 2 0 0114.4 21H9.6a2 2 0 01-2-1.9L7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function PollCard({ poll, today, canManage, canVote, onVote, onClose, onReopen, onEdit, onDelete }: {
  poll: Poll;
  today: Date;
  canManage: boolean;
  canVote: boolean;
  onVote: (optionId: number) => void;
  onClose: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const closed = poll.status === "closed";
  const total = poll.totalVotes;
  // Close-date label: closed polls show a neutral past note; open ones a relative due.
  const dateLabel = closed
    ? (poll.closeDate ? `Closed · ${fmtDate(poll.closeDate)}` : "Closed")
    : relWhen(poll.closeDate, today).txt;
  const dateCls = closed ? "" : relWhen(poll.closeDate, today).cls;
  const votable = canVote && !closed;

  return (
    <div className={`pl-card${closed ? " closed" : ""}`}>
      <div className="pl-card-head">
        <div className="pl-card-titles">
          <p className="pl-card-question">{poll.question}</p>
        </div>
        <span className={`pl-status ${closed ? "closed" : "open"}`}>{closed ? "Closed" : "Open"}</span>
      </div>

      <div className="pl-bars">
        {poll.options.map(o => {
          const pct = total > 0 ? Math.round((o.voteCount / total) * 100) : 0;
          const mine = poll.myVoteOptionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className={`pl-bar${mine ? " mine" : ""}${votable ? " votable" : ""}`}
              disabled={!votable}
              aria-pressed={mine}
              title={votable ? (mine ? "Your vote" : "Vote for this") : undefined}
              onClick={() => votable && onVote(o.id)}
            >
              <span className="pl-bar-fill" style={{ width: `${pct}%` }} />
              <span className="pl-bar-label">
                {mine && (
                  <svg className="pl-bar-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
                {o.label}
              </span>
              <span className="pl-bar-count">{o.voteCount} · {pct}%</span>
            </button>
          );
        })}
      </div>

      <div className="pl-card-meta">
        <span className={`tk-when ${dateCls}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" /></svg>
          {dateLabel}
        </span>
        <span className="tk-sep">·</span>
        <span className="pl-votes">{total} {total === 1 ? "vote" : "votes"}</span>
        {poll.assignments.length > 0 && (
          <>
            <span className="tk-sep">·</span>
            <span className="tk-chips">
              {poll.assignments.map(a => a.role ? (
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
        {!canVote && !closed && <><span className="tk-sep">·</span><span className="tk-opt">Not assigned to you</span></>}
      </div>

      {canManage && (
        <div className="pl-card-acts">
          <button className="tk-act" title="Edit" onClick={onEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.2 5.2l3.6 3.6M16.7 3.7a2.5 2.5 0 113.6 3.6L7 20.5l-4 1 1-4z" /></svg>
          </button>
          {closed ? (
            <button className="tk-act" title="Reopen" onClick={onReopen}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006 5.3M4 15a8 8 0 0014 3.7" /></svg>
            </button>
          ) : (
            <button className="tk-act" title="Close poll" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="5" y="11" width="14" height="9" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 018 0v4" /></svg>
            </button>
          )}
          <button className="tk-act danger" title="Delete" onClick={onDelete}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0l-.7 12.1A2 2 0 0114.4 21H9.6a2 2 0 01-2-1.9L7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
