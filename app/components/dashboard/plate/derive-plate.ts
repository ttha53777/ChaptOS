/**
 * "On your plate" — everything waiting on the viewer, in one list sorted by
 * when it's due. Replaces the old Needs attention queue (deriveNeedsAttention)
 * and folds in the viewer's own tasks and open votes.
 * _design/Plate + Attention Merge Mock.html.
 *
 * Pure: the dashboard passes in what it already loaded, so this never fetches.
 * Each row is either the viewer's own ("mine") or one they see because of a
 * permission (`as` names which one, so the card can say "as Treasurer").
 */
import type { Brother, Poll, Reimbursement, Task } from "@/app/data";
import type { TrackedMetrics } from "@/lib/tracked-metrics";

export type PlateLane = "late" | "today" | "soon";
export type PlatePerm = "tasks" | "treasury" | "events" | "fundraising";

/** How far ahead "Coming up" reaches for dated tasks. Undated to-dos always count. */
export const PLATE_SOON_DAYS = 7;

type Base = { key: string; lane: PlateLane; mine: boolean; as?: PlatePerm };

export type PlateItem = Base & (
  | { kind: "task"; id: number; title: string; dueDate: string | null; daysLate: number; assignees: string }
  | { kind: "poll"; id: number; question: string; closeDate: string | null; options: { id: number; label: string }[] }
  | { kind: "wrap-up"; id: number; title: string; dueDate: string | null; daysAgo: number | null }
  | { kind: "fundraiser"; id: number; name: string; date: string; daysAgo: number }
  | { kind: "reimbursement"; total: number; requests: { id: number; name: string; amount: number; description: string; date: string }[] }
  | { kind: "dues"; total: number; count: number; overdue: number; top: { name: string; amount: number }[] }
  | { kind: "my-dues"; amount: number; lateDays: number }
);

export interface PlateInput {
  today: string;
  selfId: number | null;
  myRoleIds: ReadonlySet<number>;
  tasks: Task[];
  /** Open polls assigned to the viewer that they haven't voted on yet. */
  polls: Poll[];
  wrapUps: { id: number; title: string; dueDate: string | null }[];
  /** Fundraisers whose day has come and nobody has counted (useFundraisersToWrap). */
  fundraisers?: { id: number; name: string; date: string }[];
  reimbursements: Reimbursement[];
  brothers: Brother[];
  duesLate: ReadonlyMap<number, number>;
  tracked: Pick<TrackedMetrics, "duesOwed">;
  can: Record<Exclude<PlatePerm, "fundraising">, boolean> & { fundraising?: boolean };
  assigneeLabel: (t: Task) => string;
}

/** Whole days from ISO `from` to ISO `to` (yyyy-mm-dd), via UTC to dodge DST. */
function days(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Same rule as /tasks' "Mine": Everyone tasks, or assigned to you or a role you hold. */
export function isMyTask(t: Task, selfId: number | null, myRoleIds: ReadonlySet<number>): boolean {
  return t.everyone != null || t.assignments.some(a =>
    (a.brotherId != null && a.brotherId === selfId) || (a.roleId != null && myRoleIds.has(a.roleId)),
  );
}

const LANE_ORDER: Record<PlateLane, number> = { late: 0, today: 1, soon: 2 };

export function derivePlate(i: PlateInput): PlateItem[] {
  const out: (PlateItem & { sort: string })[] = [];

  // Tasks. Yours: late, today, the next week, and undated to-dos. Someone else's
  // only once it's late, and only for MANAGE_TASKS — they can mark it done.
  for (const t of i.tasks) {
    if (t.status === "done") continue;
    const mine = isMyTask(t, i.selfId, i.myRoleIds);
    const d = t.dueDate == null ? null : days(i.today, t.dueDate);
    let lane: PlateLane | null = null;
    if (d != null && d < 0) lane = mine || i.can.tasks ? "late" : null;
    else if (!mine) lane = null;
    else if (d === 0) lane = "today";
    else if (d == null || d <= PLATE_SOON_DAYS) lane = "soon";
    if (!lane) continue;
    out.push({
      key: `task-${t.id}`, lane, mine, ...(mine ? {} : { as: "tasks" as const }),
      kind: "task", id: t.id, title: t.title, dueDate: t.dueDate, daysLate: d != null && d < 0 ? -d : 0,
      assignees: i.assigneeLabel(t),
      sort: t.dueDate ?? "9999",
    });
  }

  // Votes waiting on you. Closing today (or somehow past it while still open) is today.
  for (const p of i.polls) {
    if (p.status !== "open" || p.myVoteOptionId != null) continue;
    const lane: PlateLane = p.closeDate != null && p.closeDate <= i.today ? "today" : "soon";
    out.push({
      key: `poll-${p.id}`, lane, mine: true,
      kind: "poll", id: p.id, question: p.question, closeDate: p.closeDate,
      options: [...p.options].sort((a, b) => a.position - b.position).map(o => ({ id: o.id, label: o.label })),
      sort: p.closeDate ?? "9999",
    });
  }

  // Events that happened and haven't been wrapped up. useWrapUpsDue already
  // limits these to MANAGE_EVENTS.
  if (i.can.events) for (const e of i.wrapUps) {
    out.push({
      key: `wrap-${e.id}`, lane: "late", mine: false, as: "events",
      kind: "wrap-up", id: e.id, title: e.title, dueDate: e.dueDate,
      daysAgo: e.dueDate ? days(e.dueDate, i.today) : null,
      sort: e.dueDate ?? "0000",
    });
  }

  // Fundraisers waiting to be counted. Today's sale lands under Today; anything
  // older is late — the money is sitting in a cash box somewhere.
  if (i.can.fundraising) for (const f of i.fundraisers ?? []) {
    const ago = days(f.date, i.today);
    if (ago < 0) continue;
    out.push({
      key: `fund-${f.id}`, lane: ago === 0 ? "today" : "late", mine: false, as: "fundraising",
      kind: "fundraiser", id: f.id, name: f.name, date: f.date, daysAgo: ago,
      sort: f.date,
    });
  }

  if (i.can.treasury) {
    const pending = i.reimbursements
      .filter(r => r.status === "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (pending.length) out.push({
      key: "reimbursements", lane: "soon", mine: false, as: "treasury",
      kind: "reimbursement", total: pending.reduce((s, r) => s + r.amount, 0),
      requests: pending.map(r => ({ id: r.id, name: r.brother.name, amount: r.amount, description: r.description, date: r.date })),
      sort: "9999a",
    });
  }

  // Dues. The org-wide total is the treasurer's; your own balance is yours.
  // Neither shows when the org doesn't track dues (the column is then a stored 0).
  if (i.tracked.duesOwed) {
    const late = (b: Brother) => i.duesLate.get(b.id) ?? 0;
    if (i.can.treasury) {
      const owing = i.brothers.filter(b => b.duesOwed > 0).sort((a, b) => late(b) - late(a) || b.duesOwed - a.duesOwed);
      const overdue = owing.filter(b => late(b) > 0).length;
      if (owing.length) out.push({
        key: "dues", lane: overdue ? "late" : "soon", mine: false, as: "treasury",
        kind: "dues", total: owing.reduce((s, b) => s + b.duesOwed, 0), count: owing.length, overdue,
        top: owing.slice(0, 3).map(b => ({ name: b.name, amount: b.duesOwed })),
        sort: "9999b",
      });
    }
    const me = i.selfId == null ? undefined : i.brothers.find(b => b.id === i.selfId);
    if (me && me.duesOwed > 0) out.push({
      key: "my-dues", lane: late(me) > 0 ? "late" : "soon", mine: true,
      kind: "my-dues", amount: me.duesOwed, lateDays: late(me),
      sort: late(me) > 0 ? "0000" : "9999",
    });
  }

  return out
    .sort((a, b) => LANE_ORDER[a.lane] - LANE_ORDER[b.lane] || a.sort.localeCompare(b.sort))
    .map(({ sort: _sort, ...it }) => it as PlateItem);
}
