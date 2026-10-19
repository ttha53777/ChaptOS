/**
 * API contract: what the server actually returns must fit lib/api-types.
 *
 * Type-level only — never imported, never run. `tsc --noEmit` checks it like any
 * other file (tsconfig includes **\/*.ts) and vitest ignores it (not *.test.ts),
 * so a service whose return shape drifts from the shared wire type fails the
 * type check, naming the field.
 *
 * Each check models the trip over the wire:
 *   Wire<T>   — what JSON.stringify makes of the server value: Date → string,
 *               toJSON() honored, functions dropped.
 *   Widen<T>  — the shared type with literal unions relaxed to their primitive
 *               ("open" | "done" → string). Prisma hands back status columns as
 *               plain `string`; the DB's CHECK constraints (lib/state) are what
 *               pin the literal set. Everything else — field presence, null vs
 *               absent, primitive kind, nesting — is checked exactly.
 *
 * Routes that build their body inline are checked where they're written, with
 * `satisfies` (/api/auth/me, /api/treasury), and the chat stream's send() is
 * typed against ChatStreamEvents.
 */
import type {
  ActivityEntry, Brother, CalEventType, CalendarEvent, DuesBoard, LiveCheckIn, MemberDuesBook, MemberProfile,
  MyExcuseItem, OwnJoinRequest, Poll, Reimbursement, Task, Transaction, TransactionCategory,
} from "@/lib/api-types";
import type { listVisibleBrothers, getMemberProfile } from "@/lib/services/brother-service";
import type { publicBrother } from "@/lib/brother-avatar";
import type { listTasks, updateTask } from "@/lib/services/task-service";
import type { listPolls, castVote } from "@/lib/services/poll-service";
import type { listCalendar } from "@/lib/services/calendar-service";
import type { listEventTypes } from "@/lib/services/calendar-event-type-service";
import type { getLiveCheckIn, selfCheckIn, undoSelfCheckIn } from "@/lib/services/attendance-service";
import type { listMyExcuses } from "@/lib/services/excuse-service";
import type { listRecentActivity } from "@/lib/services/activity-service";
import type { listOwnJoinRequests } from "@/lib/auth/own-join-status";
import type { listTransactions } from "@/lib/services/transaction-service";
import type { listReimbursements } from "@/lib/services/reimbursement-service";
import type { listTransactionCategories } from "@/lib/services/transaction-category-service";
import type { getDuesBoard, getMemberDuesBook } from "@/lib/services/dues-charge-service";

type Fn = (...args: never[]) => unknown;

type Wire<T> =
  T extends Date ? string
  : T extends string | number | boolean | null | undefined ? T
  : T extends Fn ? never
  : T extends { toJSON(): infer J } ? Wire<J>
  : T extends readonly (infer U)[] ? Wire<U>[]
  : T extends object ? { [K in keyof T as T[K] extends Fn ? never : K]: Wire<T[K]> }
  : never;

type Widen<T> =
  T extends string ? string
  : T extends number ? number
  : T extends boolean ? boolean
  : T extends null | undefined ? T
  : T extends readonly (infer U)[] ? Widen<U>[]
  : T extends object ? { [K in keyof T]: Widen<T[K]> }
  : T;

/** The JSON a route answers when it returns `await fn(...)` verbatim. */
type Served<F extends Fn> = Wire<Awaited<ReturnType<F>>>;

declare function served<T>(): T;

// GET /api/brothers — listVisibleBrothers → hydrateBrotherAvatars (same rows) → publicBrother
type RosterRow = Awaited<ReturnType<typeof listVisibleBrothers>>[number];
export const brothers: Widen<Brother[]> = served<Wire<ReturnType<typeof publicBrother<RosterRow>>[]>>();
export const memberProfile: Widen<MemberProfile> = served<Served<typeof getMemberProfile>>();

export const tasks: Widen<Task[]> = served<Served<typeof listTasks>>();
export const taskUpdate: Widen<Task> = served<Served<typeof updateTask>>();

export const polls: Widen<Poll[]> = served<Served<typeof listPolls>>();
export const vote: Widen<Poll> = served<Served<typeof castVote>>();

export const calendar: Widen<CalendarEvent[]> = served<Served<typeof listCalendar>>();
export const eventTypes: Widen<CalEventType[]> = served<Served<typeof listEventTypes>>();

export const liveCheckIn: Widen<LiveCheckIn | null> = served<Served<typeof getLiveCheckIn>>();
export const checkIn: Widen<LiveCheckIn | null> = served<Served<typeof selfCheckIn>>();
export const undoCheckIn: Widen<LiveCheckIn | null> = served<Served<typeof undoSelfCheckIn>>();
export const myExcuses: Widen<MyExcuseItem[]> = served<Served<typeof listMyExcuses>>();

export const activity: Widen<ActivityEntry[]> = served<Served<typeof listRecentActivity>>();
export const ownJoinRequests: Widen<OwnJoinRequest[]> = served<Served<typeof listOwnJoinRequests>>();

export const transactions: Widen<Transaction[]> = served<Served<typeof listTransactions>>();
export const reimbursements: Widen<Reimbursement[]> = served<Served<typeof listReimbursements>>();
export const categories: Widen<TransactionCategory[]> = served<Served<typeof listTransactionCategories>>();

export const duesBoard: Widen<DuesBoard> = served<Served<typeof getDuesBoard>>();
export const memberDuesBook: Widen<MemberDuesBook> = served<Served<typeof getMemberDuesBook>>();
