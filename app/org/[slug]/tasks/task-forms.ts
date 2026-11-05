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
  dueTime: string; // "HH:MM" 24h or "" (any time that day; always "" when undated)
  notes: string;
  assigneeBrotherIds: number[];
  assigneeRoleIds: number[];
  /** Set when assigned to Everyone (the ids are then empty): who has to finish it. */
  everyone: TaskEveryoneMode | null;
};

export type TaskFormInitial = {
  title: string;
  dueDate: string;
  dueTime?: string;
  notes: string;
  brotherIds: number[];
  roleIds: number[];
  everyone?: TaskEveryoneMode | null;
};

// Every poll goes to the whole chapter and everyone has to vote, so the form
// carries no audience. Editing an older targeted poll leaves its audience alone.
export type PollFormValue = {
  question: string;
  closeDate: string; // ISO YYYY-MM-DD or "" (no date)
  options: string[]; // 2-10 trimmed, non-empty labels
};

export type PollFormInitial = {
  question: string;
  closeDate: string;
  options: string[];
  /** false = an older poll addressed to picked people/roles. */
  everyone: boolean;
  /** Who can vote on it today (shown for older targeted polls). */
  assigneeCount: number;
};

/** "17:30" → "5:30 PM", "12:00" → "Noon", "09:00" → "9 AM". */
export function fmtDueTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (h === 12 && m === 0) return "Noon";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
