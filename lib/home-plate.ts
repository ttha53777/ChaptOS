/**
 * The member's own "On your plate" for GET /api/home — the subset of the web
 * dashboard's derivePlate (app/components/dashboard/plate/derive-plate.ts) that
 * is about the viewer alone: their tasks, their open votes, their dues. Officer
 * rows (wrap-ups, the treasurer's dues total, reimbursements) stay web-only.
 *
 * Pure, so it is tested without a database and both lanes rules stay readable
 * side by side with the web's.
 */
import type { HomePlateLane } from "@/lib/api-types";

/** How far ahead dated tasks count as "soon". Undated to-dos always count. Same as the web. */
export const HOME_PLATE_SOON_DAYS = 7;

const LANE_ORDER: Record<HomePlateLane, number> = { late: 0, today: 1, soon: 2 };

/** Whole days from `from` to `to` (YYYY-MM-DD), via UTC to dodge DST. */
function days(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

type TaskLike = { status: string; dueDate: string | null };
type PollLike = { status: string; closeDate: string | null; myVoteOptionId: number | null };
type DuesLike = { owes: number; standing: string };

/** Generic over the row types so it takes the services' values as they are (the
 *  wire HomePlateItem is checked in tests/contracts/api-types.contract.ts). */
export type PlateItemOf<T, P, D> =
  | { kind: "task"; lane: HomePlateLane; task: T; daysLate: number }
  | { kind: "poll"; lane: HomePlateLane; poll: P }
  | { kind: "dues"; lane: HomePlateLane; standing: D };

/**
 * `tasks` and `polls` must already be the viewer's own (listTasks/listPolls with
 * `mine`); `dues` is the viewer's standing, or null when there's no ledger.
 */
export function deriveHomePlate<T extends TaskLike, P extends PollLike, D extends DuesLike>(
  input: { today: string; tasks: T[]; polls: P[]; dues: D | null },
): PlateItemOf<T, P, D>[] {
  const out: { item: PlateItemOf<T, P, D>; sort: string }[] = [];

  for (const task of input.tasks) {
    if (task.status === "done") continue;
    const d = task.dueDate == null ? null : days(input.today, task.dueDate);
    const lane: HomePlateLane | null =
      d != null && d < 0 ? "late"
      : d === 0 ? "today"
      : d == null || d <= HOME_PLATE_SOON_DAYS ? "soon"
      : null;
    if (!lane) continue;
    out.push({ item: { kind: "task", lane, task, daysLate: d != null && d < 0 ? -d : 0 }, sort: task.dueDate ?? "9999" });
  }

  for (const poll of input.polls) {
    if (poll.status !== "open" || poll.myVoteOptionId != null) continue;
    // Closing today (or somehow past it while still open) is today.
    const lane: HomePlateLane = poll.closeDate != null && poll.closeDate <= input.today ? "today" : "soon";
    out.push({ item: { kind: "poll", lane, poll }, sort: poll.closeDate ?? "9999" });
  }

  if (input.dues && input.dues.owes > 0) {
    const late = input.dues.standing === "overdue";
    out.push({ item: { kind: "dues", lane: late ? "late" : "soon", standing: input.dues }, sort: late ? "0000" : "9999" });
  }

  return out
    .sort((a, b) => LANE_ORDER[a.item.lane] - LANE_ORDER[b.item.lane] || a.sort.localeCompare(b.sort))
    .map(({ item }) => item);
}
