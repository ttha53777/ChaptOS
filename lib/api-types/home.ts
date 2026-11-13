// Home screen wire shapes. Type-only: see lib/api-types/index.ts for the rules.
import type { CalendarEvent, LiveCheckIn } from "./calendar";
import type { MemberDuesStanding } from "./dues";
import type { Poll, Task } from "./tasks";

/** "late" sorts first, then "today", then "soon". */
export type HomePlateLane = "late" | "today" | "soon";

/**
 * One thing waiting on the signed-in member. Only their own: officer rows the
 * web dashboard adds (wrap-ups, the treasurer's dues total, reimbursements)
 * are not here. Unknown `kind`s may appear later; skip them.
 */
export type HomePlateItem =
  | { kind: "task"; lane: HomePlateLane; task: Task; /** 0 unless late. */ daysLate: number }
  | { kind: "poll"; lane: HomePlateLane; poll: Poll }
  | { kind: "dues"; lane: HomePlateLane; standing: MemberDuesStanding };

/**
 * GET /api/home?today=YYYY-MM-DD — the Today tab in one round trip: what's up
 * next, what's on the member's plate, and the live check-in if a window is open.
 * Send the phone's local date as `today`; without it the chapter's own date is used.
 */
export interface HomeResponse {
  /** The date lanes and "up next" were judged against. */
  today: string;
  /** The next few Timeline entries on or after `today`, soonest first (at most 3). */
  upNext: CalendarEvent[];
  /** Sorted by lane, then by due date. */
  plate: HomePlateItem[];
  liveCheckIn: LiveCheckIn | null;
}
