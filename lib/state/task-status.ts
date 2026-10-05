// Task completion status. Deliberately binary — a task is open until someone
// marks it done. "Urgency" (overdue / urgent / upcoming) is NOT a stored
// status; it's computed from the task's dueDate at render time. See
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

// How an "Everyone" task is finished (Task.everyone; null = not an Everyone task).
//   any  — one person does it for the whole chapter; the first tick closes it.
//   each — every member does it; each ticks their own, and it closes when all have.
export const TaskEveryone = {
  Any:  "any",
  Each: "each",
} as const;

export type TaskEveryone = (typeof TaskEveryone)[keyof typeof TaskEveryone];

export const TASK_EVERYONE_MODES: readonly TaskEveryone[] = Object.values(TaskEveryone);

export function isTaskEveryone(value: unknown): value is TaskEveryone {
  return typeof value === "string" && (TASK_EVERYONE_MODES as readonly string[]).includes(value);
}
