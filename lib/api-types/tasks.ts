// Task and poll wire shapes. Type-only: see lib/api-types/index.ts for the rules.

export type TaskStatus = "Upcoming" | "Due Soon" | "Urgent" | "Complete";

// A task assignee chip: either a member or a role. Mirrors the assignment join
// rows resolved server-side in task-service (loadTasks include).
export interface TaskAssigneeBrother { id: number; name: string; avatarUrl: string | null }
export interface TaskAssigneeRole    { id: number; name: string; color: string | null }
export interface TaskAssignment {
  id: number;
  brotherId: number | null;
  roleId: number | null;
  brother: TaskAssigneeBrother | null;
  role: TaskAssigneeRole | null;
}

// The unified task. A task WITH a dueDate is what the UI calls a "deadline" (it
// folds into the timeline). Status is just open/done — urgency is computed from
// dueDate (see lib/tasks/urgency), never stored.
/** GET /api/tasks, PATCH /api/tasks/[id]. */
export interface Task {
  id: number;
  title: string;
  dueDate: string | null;
  status: "open" | "done";
  notes: string | null;
  createdById: number | null;
  completedById: number | null;
  completedAt: string | null;
  createdAt: string;
  assignments: TaskAssignment[];
  /** Live "Everyone" target (no assignment rows): "any" = one person finishes it
   *  for the chapter, "each" = every member does their own. null = assignments. */
  everyone: "any" | "each" | null;
  /** "each" tasks only: members who've ticked their part, of the active roster.
   *  `status` is then the VIEWER's own part (see task-service toDTOs). */
  doneCount: number | null;
  memberCount: number | null;
}

// A poll is task-shaped (members/roles + optional date) with a question and 2-10
// options that attached members vote on. Single-choice. It's a BLIND ballot: the
// server withholds per-option `voteCount` (null) until the viewer has voted, the
// poll closes, or the viewer can manage polls — see poll-service buildDTOs. When
// sealed, `voteCount` is null but `totalVotes` (the "N sealed" count) still ships.
export interface PollOption { id: number; label: string; position: number; voteCount: number | null }
export interface PollAssignment {
  id: number;
  brotherId: number | null;
  roleId: number | null;
  brother: TaskAssigneeBrother | null;
  role: TaskAssigneeRole | null;
}
export interface PollPendingVoter { brotherId: number; name: string; avatarUrl: string | null }
/** GET /api/polls, POST /api/polls/[id]/vote. */
export interface Poll {
  id: number;
  question: string;
  closeDate: string | null;
  status: "open" | "closed";
  createdById: number | null;
  closedById: number | null;
  closedAt: string | null;
  createdAt: string;
  options: PollOption[];
  assignments: PollAssignment[];
  totalVotes: number;
  // Members who can vote (direct assignees ∪ current role holders).
  assigneeCount: number;
  myVoteOptionId: number | null;
  // True when per-option counts are withheld from this viewer (blind ballot).
  sealed: boolean;
  // Manager-only (MANAGE_POLLS): assignees who have not voted yet. Undefined otherwise.
  pendingVoters?: PollPendingVoter[];
}
