"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "../../../components/Sidebar";
import { Modal, ConfirmDialog } from "../../../components/dashboard/primitives";
import { useToast } from "../../../components/dashboard/Toast";
import type { PollFormValue, RoleOption, TaskFormValue } from "./task-forms";
import { CREATE_EVENT } from "../../../components/MobileTabBar";
import { useChapter } from "../../../context/ChapterContext";
import { useActiveSemester } from "../../../hooks/useActiveSemester";
import { PaperTasks, PaperBallot } from "./PaperTasks";
import { PaperTaskSheet, PaperPollSheet } from "./TaskSheets";
import { armTaskFlight } from "./task-fly";
import { TaskSpotlight } from "./TaskSpotlight";
import type { Task, Poll } from "../../../data";
import { requestJson } from "../../../lib/api";
import "../../../components/dashboard/dashboard-ledger.css";

type AssigneeFilter = "all" | "mine";

// ── Date helpers ──────────────────────────────────────────────────────────────
function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function TasksPage() {
  const { taskList, setTaskList, pollList, setPollList, brotherList, currentUser, can, loadedSections } = useChapter();
  const params = useSearchParams();
  const toast = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const canManage = can("MANAGE_TASKS");
  const canManagePolls = can("MANAGE_POLLS");
  const selfId = currentUser?.id ?? null;
  // Role ids the current user holds — used to resolve "Mine" (assigned directly
  // or via a held role) on the client, mirroring the server's isAssignee.
  const myRoleIds = useMemo(() => new Set((currentUser?.roles ?? []).map(r => r.id)), [currentUser]);

  // Today as a stable Date for all urgency / relative-time math this render.
  const today = useMemo(() => startOfToday(), []);

  const activeSemester = useActiveSemester();
  // The row a create/edit just saved — Paper scrolls to it and glows it once.
  const [freshId, setFreshId] = useState<number | null>(null);
  const markFresh = useCallback((id: number) => {
    setFreshId(id);
    window.setTimeout(() => setFreshId(f => f === id ? null : f), 2800);
  }, []);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The modal carries the task being edited (for the form's initial values), or
  // { kind: "add" } for a fresh create.
  const [modal, setModal] = useState<{ kind: "add" } | { kind: "edit"; task: Task; fromSpot?: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // A sheet's request is in flight: its buttons hold.
  const [saving, setSaving] = useState(false);
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

  const isMine = useCallback((t: Task) => t.everyone != null || t.assignments.some(a =>
    (a.brotherId != null && a.brotherId === selfId) || (a.roleId != null && myRoleIds.has(a.roleId)),
  ), [selfId, myRoleIds]);

  const openAdd = useCallback(() => { setFormError(null); setModal({ kind: "add" }); }, []);
  const openAddPoll = useCallback(() => { setPollFormError(null); setPollModal({ kind: "add" }); }, []);
  const openEditPoll = useCallback((p: Poll) => { setPollFormError(null); setPollModal({ kind: "edit", poll: p }); }, []);
  const openPollView = useCallback((p: Poll) => { setError(null); setPollViewId(p.id); }, []);

  // Whether the current user may vote on a poll: everyone can on a whole-chapter
  // poll; on an older targeted one, assigned directly or via a held role.
  const canVote = useCallback((p: Poll) => p.everyone || p.assignments.some(a =>
    (a.brotherId != null && a.brotherId === selfId) || (a.roleId != null && myRoleIds.has(a.roleId)),
  ), [selfId, myRoleIds]);

  // The task spotlight: a row tap or a ?task= link opens it, for every viewer.
  const [taskViewId, setTaskViewId] = useState<number | null>(null);
  const taskView = taskViewId == null ? null : taskList.find(t => t.id === taskViewId) ?? null;
  // A ?task=/?poll= link whose target isn't in the loaded list (deleted, or a
  // stale calendar entry). Said out loud rather than landing on an unmarked list.
  const [missingLink, setMissingLink] = useState<"task" | "poll" | null>(null);

  // Honor ?new=1 / ?task=<id> (tasks) and ?newPoll=1 / ?poll=<id> (polls) from
  // the dashboard, timeline and subscribed calendars. A calendar tap is a cold
  // load, so wait for the list to arrive rather than matching against the empty
  // initial state; the ref keys on the link so each one is handled exactly once.
  const tasksLoaded = loadedSections.has("deadlines");
  const pollsLoaded = loadedSections.has("polls");
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    const key = params.toString();
    // Permissions read false until the user loads; deciding earlier would hand a
    // poll manager the ballot instead of the editor.
    if (handledLink.current === key || !currentUser) return;
    if (params.get("newPoll") === "1") { handledLink.current = key; if (canManagePolls) openAddPoll(); return; }
    const pollParam = params.get("poll");
    if (pollParam) {
      if (!pollsLoaded) return;
      handledLink.current = key;
      const p = pollList.find(x => x.id === Number(pollParam));
      if (!p) setMissingLink("poll");
      else if (canManagePolls) openEditPoll(p);
      else openPollView(p);
      return;
    }
    if (params.get("new") === "1") { handledLink.current = key; if (canManage) openAdd(); return; }
    const taskParam = params.get("task");
    if (taskParam) {
      if (!tasksLoaded) return;
      handledLink.current = key;
      const t = taskList.find(x => x.id === Number(taskParam));
      if (!t) setMissingLink("task");
      else setTaskViewId(t.id);
    }
  }, [params, currentUser, tasksLoaded, pollsLoaded, taskList, pollList, canManage, canManagePolls, openAdd, openAddPoll, openEditPoll, openPollView]);

  // The phone tab bar's Create → Add task, while already on this page.
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ key?: string }>).detail?.key === "task" && canManage) openAdd();
    };
    window.addEventListener(CREATE_EVENT, on);
    return () => window.removeEventListener(CREATE_EVENT, on);
  }, [canManage, openAdd]);

  // ── Mutations (optimistic, mirroring the parties/dashboard pattern) ─────────
  // The sheet validates title, date and assignees; here we just persist.
  async function submitForm(value: TaskFormValue) {
    setFormError(null);
    setSaving(true);
    const base = {
      title: value.title,
      assigneeBrotherIds: value.assigneeBrotherIds,
      assigneeRoleIds: value.assigneeRoleIds,
    };

    try {
      if (modal?.kind === "edit") {
        // On edit, empties clear the field (null), not "leave unchanged" (undefined).
        // The date goes only when it changed: the server re-checks any date it's
        // sent against this semester, which would refuse a rename of a task that
        // keeps last term's date.
        const dateChanged = value.dueDate !== (modal.task.dueDate ?? "");
        const timeChanged = value.dueTime !== (modal.task.dueTime ?? "");
        const saved = await requestJson<Task>(`/api/tasks/${modal.task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...base, everyone: value.everyone,
            ...(dateChanged ? { dueDate: value.dueDate || null } : {}),
            ...(timeChanged && value.dueDate ? { dueTime: value.dueTime || null } : {}),
            notes: value.notes || null,
          }),
        });
        setTaskList(prev => prev.map(x => x.id === saved.id ? saved : x));
        markFresh(saved.id);
        if (modal.fromSpot) setTaskViewId(saved.id);
      } else {
        const saved = await requestJson<Task>("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...base, everyone: value.everyone ?? undefined,
            dueDate: value.dueDate || undefined, dueTime: value.dueDate && value.dueTime ? value.dueTime : undefined,
            notes: value.notes || undefined,
          }),
        });
        // The sheet is still up, so its preview row can take off from where it sits.
        armTaskFlight(saved.id);
        setTaskList(prev => [...prev, saved]);
        markFresh(saved.id);
      }
      setModal(null);
    } catch {
      setFormError("Could not save the task. Please try again.");
    } finally {
      setSaving(false);
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
    setSaving(true);
    // No audience: every new poll goes to the whole chapter, and an edit leaves
    // an older poll's audience as it was.
    const base = { question: value.question };
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
    } finally {
      setSaving(false);
    }
  }

  async function vote(poll: Poll, optionId: number) {
    // No optimistic tally: a sealed voter genuinely doesn't know the counts until
    // the server unseals them on their vote. We don't flip to fake 0% bars — the
    // card shows a "casting" state (see PollCard) and the real counts phase in from
    // this response, so the reveal animation plays once, on true data.
    const firstVote = poll.myVoteOptionId == null;
    try {
      const saved = await requestJson<Poll>(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      setPollList(prev => prev.map(p => p.id === saved.id ? saved : p));
      if (firstVote) toast.success("Your vote is in — here's how the room is leaning so far.");
    } catch {
      setError("Could not record your vote.");
      throw new Error("vote failed");
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

  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Tasks" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile toolbar */}
        <header className="toolbar-frosted dash-toolbar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.05)] px-4 sm:px-6 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)] lg:hidden"
            aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="truncate text-[13px] font-semibold text-[color:var(--ink)]">Tasks</span>
        </header>

        <main className="page-ambient flex-1 overflow-y-auto">
          <div className="dash dash-tasks">
            <div className="ptk-page">
              {error && <div className="ptk-notice bad" role="alert">{error}<button type="button" className="ptk-link" onClick={() => setError(null)}>Dismiss</button></div>}
              {missingLink && (
                <div className="ptk-notice" role="status">
                  {missingLink === "task"
                    ? "This deadline was removed. If you came from your calendar, it disappears there the next time your calendar refreshes."
                    : "This poll was removed."}
                  <button type="button" className="ptk-link" onClick={() => setMissingLink(null)}>Dismiss</button>
                </div>
              )}
              <PaperTasks
                taskList={taskList}
                pollList={pollList}
                today={today}
                me={{ selfId, myRoleIds }}
                semesterLabel={activeSemester?.label ?? null}
                canManage={canManage}
                canManagePolls={canManagePolls}
                assigneeFilter={assigneeFilter}
                setAssigneeFilter={setAssigneeFilter}
                showDone={showDone}
                setShowDone={setShowDone}
                freshId={freshId}
                isMine={isMine}
                canVote={canVote}
                canComplete={canCompleteTask}
                onNewTask={openAdd}
                onNewPoll={openAddPoll}
                onOpenTask={t => setTaskViewId(t.id)}
                onToggleTask={t => setStatus(t, t.status === "done" ? "open" : "done")}
                onOpenPoll={openPollView}
                onVote={vote}
                // Polls only hold the page back when there are no tasks to show (it
                // could be day one). A failed polls fetch stays unloaded, and it
                // mustn't keep the tasks themselves behind a skeleton.
                loading={!tasksLoaded || !currentUser || (!pollsLoaded && taskList.length === 0)}
              />
            </div>
          </div>
        </main>
      </div>

      {modal && (
        <Modal ariaLabel={modal.kind === "edit" ? "Edit task" : "New task"} hideHeader tone="dusk" maxWidthClass="max-w-[620px]" accent="butter" onClose={() => setModal(null)}>
          <PaperTaskSheet
            brothers={brotherList}
            roles={roles}
            selfId={selfId}
            today={today}
            minDate={activeSemester?.startDate}
            maxDate={activeSemester?.endDate}
            editing={modal.kind === "edit"}
            peopleLoading={!loadedSections.has("brothers")}
            error={formError}
            saving={saving}
            initial={modal.kind === "edit" ? {
              title: modal.task.title,
              dueDate: modal.task.dueDate ?? "",
              dueTime: modal.task.dueTime ?? "",
              notes: modal.task.notes ?? "",
              brotherIds: modal.task.assignments.filter(a => a.brotherId != null).map(a => a.brotherId!),
              roleIds: modal.task.assignments.filter(a => a.roleId != null).map(a => a.roleId!),
              everyone: modal.task.everyone,
            } : undefined}
            onSubmit={submitForm}
            onDelete={modal.kind === "edit" ? () => { const t = modal.task; setModal(null); setConfirmDelete({ id: t.id, title: t.title }); } : undefined}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {taskView && (
        <TaskSpotlight key={taskView.id} task={taskView} today={today} me={{ selfId, myRoleIds }} brothers={brotherList}
          canComplete={canCompleteTask(taskView)} canManage={canManage}
          onToggle={() => setStatus(taskView, taskView.status === "done" ? "open" : "done")}
          onEdit={() => { setTaskViewId(null); setFormError(null); setModal({ kind: "edit", task: taskView, fromSpot: true }); }}
          onDelete={() => { setTaskViewId(null); setConfirmDelete({ id: taskView.id, title: taskView.title }); }}
          onClose={() => setTaskViewId(null)} />
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
        <Modal ariaLabel={pollModal.kind === "edit" ? "Edit poll" : "New poll"} tone="dusk" hideHeader maxWidthClass="max-w-[620px]" accent="lilac" onClose={() => setPollModal(null)}>
          <PaperPollSheet
            brothers={brotherList}
            selfId={selfId}
            today={today}
            minDate={activeSemester?.startDate}
            maxDate={activeSemester?.endDate}
            editing={pollModal.kind === "edit"}
            error={pollFormError}
            saving={saving}
            optionsLocked={pollModal.kind === "edit" && pollModal.poll.totalVotes > 0}
            initial={pollModal.kind === "edit" ? {
              question: pollModal.poll.question,
              closeDate: pollModal.poll.closeDate ?? "",
              options: pollModal.poll.options.map(o => o.label),
              everyone: pollModal.poll.everyone,
              assigneeCount: pollModal.poll.assigneeCount,
            } : undefined}
            onSubmit={submitPollForm}
            onCancel={() => setPollModal(null)}
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
        <Modal ariaLabel="Poll" tone="dusk" hideHeader maxWidthClass="max-w-[600px]" accent="lilac" onClose={() => setPollViewId(null)}>
          <PaperBallot poll={pollView} today={today} brothers={brotherList} canManage={canManagePolls} canVote={canVote(pollView)}
            onVote={(optionId) => vote(pollView, optionId)}
            onClosePoll={() => setPollStatus(pollView, "closed")} onReopen={() => setPollStatus(pollView, "open")}
            onEdit={() => { setPollViewId(null); openEditPoll(pollView); }}
            onDelete={() => { setPollViewId(null); setConfirmDeletePoll({ id: pollView.id, title: pollView.question }); }}
            onDone={() => setPollViewId(null)} />
        </Modal>
      )}
    </div>
  );
}
