/**
 * Task urgency is COMPUTED from a task's due date, never stored. This replaces
 * the legacy Deadline.status values (Urgent / Due Soon / Upcoming) which mixed
 * urgency into the persisted status. The stored Task.status is only open/done.
 * There is no "urgent" band either: a task is past its date or it isn't.
 *
 * Pure functions over "YYYY-MM-DD" strings + a reference date — safe on client
 * and server. String comparison works because the format is zero-padded ISO.
 */

export type TaskUrgency = "overdue" | "upcoming" | "none";

// Measured from `today`:
//   < today      → overdue
//   today onward → upcoming (soonest first, so today and tomorrow lead the pile)
//   no due date  → none
// Deliberately three plain buckets — no "urgent" or "due soon" middle band.

function toISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole calendar days between two ISO dates (b - a). Negative when b < a. */
function daysBetween(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Bucket a task by how close its due date is. Undated tasks are "none".
 * `today` defaults to the current local date.
 */
export function taskUrgency(dueDate: string | null | undefined, today: Date = new Date()): TaskUrgency {
  if (!dueDate) return "none";
  const todayISO = toISO(today);
  const delta = daysBetween(todayISO, dueDate);
  return delta < 0 ? "overdue" : "upcoming";
}

// Sort order for grouping open tasks in the UI (most pressing first).
export const URGENCY_ORDER: readonly TaskUrgency[] = ["overdue", "upcoming", "none"];
