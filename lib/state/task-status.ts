// Task completion status. Deliberately binary — a task is open until someone
// marks it done. "Urgency" (overdue / urgent / due soon / upcoming) is NOT a
// stored status; it's computed from the task's dueDate at render time. See
// taskUrgency() in @/lib/tasks/urgency.
export const TaskStatus = {
  Open: "open",
  Done: "done",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TASK_STATUSES: readonly TaskStatus[] = Object.values(TaskStatus);

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}
