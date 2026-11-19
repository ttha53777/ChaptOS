/**
 * Tasks and polls: GET /api/tasks, GET /api/tasks/[id], GET /api/polls, plus the roster
 * (GET /api/brothers) for names in task history and the "each" crowd.
 *
 * The writes (PATCH /api/tasks/[id] { status }, POST /api/polls/[id]/vote) live here as
 * plain requests and cache edits; the choreography around them (optimistic order, undo,
 * toasts, refusals) is ~/tasks/tick.ts and ~/tasks/vote.ts, shared by Today and Tasks.
 *
 * Officer writes (MANAGE_TASKS, stage 6): POST /api/tasks, PATCH /api/tasks/[id] with any
 * editable field, DELETE /api/tasks/[id]. Each one refreshes the list, Today's plate and
 * the Timeline (a dated task is a deadline there).
 */
import type { Brother, Poll, Task, TaskDetail } from "@/lib/api-types";
import type { createTaskInput, updateTaskInput } from "@/lib/validation/task";
import type { castVoteInput } from "@/lib/validation/poll";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg, useActiveOrg } from "~/state/org";
import { calKeys } from "./calendar";
import { queryClient } from "./query";

export const taskKeys = {
  tasks: (slug: string | null) => ["tasks", slug] as const,
  detail: (slug: string | null, id: number) => ["taskDetail", slug, id] as const,
  polls: (slug: string | null) => ["polls", slug] as const,
  roster: (slug: string | null) => ["roster", slug] as const,
};

export function useTasks(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: taskKeys.tasks(slug), queryFn: () => api<Task[]>("/api/tasks", { org: slug }), enabled });
}

export function usePolls() {
  const { slug } = useActiveOrg();
  return useQuery({ queryKey: taskKeys.polls(slug), queryFn: () => api<Poll[]>("/api/polls", { org: slug }) });
}

export function useTaskDetail(id: number | null) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: taskKeys.detail(slug, id ?? 0),
    queryFn: () => api<TaskDetail>(`/api/tasks/${id}`, { org: slug }),
    enabled: id != null,
  });
}

/** Names and faces for ids (history actors, "each" parts). Changes rarely. */
export function useRoster(enabled = true) {
  const { slug } = useActiveOrg();
  return useQuery({
    queryKey: taskKeys.roster(slug),
    queryFn: () => api<Brother[]>("/api/brothers", { org: slug }),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/* ── requests ─────────────────────────────────────────────────────────────────── */

type TaskPatch = z.input<typeof updateTaskInput>;
export type NewTaskBody = z.input<typeof createTaskInput>;
export type TaskEdit = TaskPatch;
type VoteBody = z.input<typeof castVoteInput>;

/** A member ticks their own task (or their part of an Everyone · each task), or unticks it. */
export function setTaskDone(taskId: number, done: boolean): Promise<Task> {
  const body: TaskPatch = { status: done ? "done" : "open" };
  return api<Task>(`/api/tasks/${taskId}`, { method: "PATCH", body });
}

/** Everything a task touches: the list, Today's plate, the Timeline's deadlines. */
function taskWritten(id?: number) {
  const slug = slugNow();
  void queryClient.invalidateQueries({ queryKey: taskKeys.tasks(slug) });
  void queryClient.invalidateQueries({ queryKey: ["home", slug] });
  void queryClient.invalidateQueries({ queryKey: calKeys.events(slug) });
  if (id != null) void queryClient.invalidateQueries({ queryKey: taskKeys.detail(slug, id) });
}

/** Officers (MANAGE_TASKS): hand out a new task. The server's row joins the cached list at once. */
export async function createTask(body: NewTaskBody): Promise<Task> {
  const t = await api<Task>("/api/tasks", { method: "POST", body });
  queryClient.setQueryData<Task[]>(taskKeys.tasks(slugNow()), list => (list ? [...list, t] : list));
  taskWritten(t.id);
  return t;
}

/** Officers: change any editable field (title, due, note, who). */
export async function editTask(id: number, body: TaskEdit): Promise<Task> {
  const t = await api<Task>(`/api/tasks/${id}`, { method: "PATCH", body });
  patchTaskInCache(id, t);
  taskWritten(id);
  return t;
}

export async function deleteTask(id: number): Promise<void> {
  await api<void>(`/api/tasks/${id}`, { method: "DELETE" });
  queryClient.setQueryData<Task[]>(taskKeys.tasks(slugNow()), list => list?.filter(t => t.id !== id));
  taskWritten();
}

export function postVote(pollId: number, optionId: number): Promise<Poll> {
  const body: VoteBody = { optionId };
  return api<Poll>(`/api/polls/${pollId}/vote`, { method: "POST", body });
}

/* ── cache edits ──────────────────────────────────────────────────────────────── */

const slugNow = () => activeOrg.get().slug;

/** Replace (or patch) one task in the cached list. Returns a function that puts the old row back. */
export function patchTaskInCache(id: number, next: Task | ((t: Task) => Task)): () => void {
  const k = taskKeys.tasks(slugNow());
  const before = queryClient.getQueryData<Task[]>(k)?.find(t => t.id === id);
  queryClient.setQueryData<Task[]>(k, list => list?.map(t => (t.id === id ? (typeof next === "function" ? next(t) : next) : t)));
  return () => { if (before) queryClient.setQueryData<Task[]>(k, list => list?.map(t => (t.id === id ? before : t))); };
}

/** The tick as the server will answer it: an "each" task's status is the viewer's own part. */
export function tickedLocally(t: Task, done: boolean): Task {
  if ((t.status === "done") === done) return t;
  if (t.everyone === "each") {
    return { ...t, status: done ? "done" : "open", doneCount: Math.max(0, (t.doneCount ?? 0) + (done ? 1 : -1)) };
  }
  return { ...t, status: done ? "done" : "open", completedAt: done ? new Date().toISOString() : null };
}

export function patchPollInCache(id: number, next: Poll | ((p: Poll) => Poll)): () => void {
  const k = taskKeys.polls(slugNow());
  const before = queryClient.getQueryData<Poll[]>(k)?.find(p => p.id === id);
  queryClient.setQueryData<Poll[]>(k, list => list?.map(p => (p.id === id ? (typeof next === "function" ? next(p) : next) : p)));
  return () => { if (before) queryClient.setQueryData<Poll[]>(k, list => list?.map(p => (p.id === id ? before : p))); };
}

/**
 * A vote as far as the phone can know it before the server answers: my pick moves,
 * the "N sealed" count rises on a first vote, and counts I can already see shift by one.
 * Sealed counts stay null: only the server's answer reveals them.
 */
export function votedLocally(p: Poll, optionId: number): Poll {
  const prev = p.myVoteOptionId;
  if (prev === optionId) return p;
  return {
    ...p,
    myVoteOptionId: optionId,
    totalVotes: prev == null ? p.totalVotes + 1 : p.totalVotes,
    options: p.options.map(o => o.voteCount == null ? o : {
      ...o,
      voteCount: o.voteCount + (o.id === optionId ? 1 : 0) - (o.id === prev ? 1 : 0),
    }),
  };
}

export function refreshTasks(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: taskKeys.tasks(slugNow()) });
}

export function refreshTaskDetail(id: number): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: taskKeys.detail(slugNow(), id) });
}

export function refreshPolls(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: taskKeys.polls(slugNow()) });
}
