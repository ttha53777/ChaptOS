// What the task and poll sheets (PaperTasks.tsx) take in and hand back. The
// caller owns the POST/PATCH and the optimistic list update, so each place that
// opens a sheet — the Tasks page, the dashboard's quick actions — keeps its own
// state in sync. Request bodies themselves are the Zod schemas in lib/validation.

export type RoleOption = { id: number; name: string; color: string | null };

// "any" = one person finishes it for the whole chapter; "each" = every member
// does it and ticks their own. Mirrors TaskEveryone in @/lib/state.
export type TaskEveryoneMode = "any" | "each";

export type TaskFormValue = {
  title: string;
  dueDate: string; // ISO YYYY-MM-DD or "" (no date)
  notes: string;
  assigneeBrotherIds: number[];
  assigneeRoleIds: number[];
  /** Set when assigned to Everyone (the ids are then empty): who has to finish it. */
  everyone: TaskEveryoneMode | null;
};

export type TaskFormInitial = {
  title: string;
  dueDate: string;
  notes: string;
  brotherIds: number[];
  roleIds: number[];
  everyone?: TaskEveryoneMode | null;
};

export type PollFormValue = {
  question: string;
  closeDate: string; // ISO YYYY-MM-DD or "" (no date)
  options: string[]; // 2-10 trimmed, non-empty labels
  assigneeBrotherIds: number[];
  assigneeRoleIds: number[];
};

export type PollFormInitial = {
  question: string;
  closeDate: string;
  options: string[];
  brotherIds: number[];
  roleIds: number[];
};
