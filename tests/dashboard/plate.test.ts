/**
 * Unit tests for derivePlate — the pure derivation behind the dashboard's
 * "On your plate" card (which replaced Needs attention). No DB; `today` is
 * injected. (vitest's global setup still runs a `prisma db push`, so the test
 * DB must be up.)
 */

import { describe, expect, it } from "vitest";
import { taskAssigneeLabel, type Brother, type Poll, type Reimbursement, type Task } from "@/app/data";
import { derivePlate, type PlateInput } from "@/app/components/dashboard/plate/derive-plate";

const TODAY = "2026-06-13";
const ME = 7;
const TREASURER_ROLE = 3;

function brother(over: Partial<Brother> & { id: number; name: string }): Brother {
  return { role: "", attendance: 95, gpa: 3.7, duesOwed: 0, serviceHours: 15, ...over };
}
function task(over: Partial<Task> & { id: number }): Task {
  return {
    title: "Task", dueDate: TODAY, status: "open", notes: null,
    createdById: null, completedById: null, completedAt: null, createdAt: "2026-05-01",
    assignments: [], everyone: null, doneCount: null, memberCount: null, ...over,
  };
}
const toMe = (id: number) => [{ id, brotherId: ME, roleId: null, brother: { id: ME, name: "Rob Chen", avatarUrl: null }, role: null }];
const toSomeone = (id: number) => [{ id, brotherId: 9, roleId: null, brother: { id: 9, name: "Ava Brooks", avatarUrl: null }, role: null }];
function poll(over: Partial<Poll> & { id: number }): Poll {
  return {
    question: "Partner?", closeDate: null, status: "open", createdById: null, closedById: null, closedAt: null,
    createdAt: "2026-06-01", options: [{ id: 2, label: "B", position: 1, voteCount: null }, { id: 1, label: "A", position: 0, voteCount: null }],
    assignments: [], totalVotes: 0, assigneeCount: 10, myVoteOptionId: null, sealed: true, ...over,
  };
}
function reimb(over: Partial<Reimbursement> & { id: number }): Reimbursement {
  return {
    brotherId: 9, brother: { id: 9, name: "Maya Patel", avatarUrl: null }, amount: 40, date: "2026-06-10",
    description: "Snacks", status: "pending", createdAt: "2026-06-10", updatedAt: "2026-06-10", ...over,
  };
}
function input(over: Partial<PlateInput> = {}): PlateInput {
  return {
    today: TODAY, selfId: ME, myRoleIds: new Set(), tasks: [], polls: [], wrapUps: [], reimbursements: [],
    brothers: [], duesLate: new Map(), tracked: { duesOwed: true },
    can: { tasks: false, treasury: false, events: false }, assigneeLabel: t => taskAssigneeLabel(t), ...over,
  };
}

describe("derivePlate", () => {
  it("lanes my tasks by due date and skips done ones and those more than a week out", () => {
    const items = derivePlate(input({ tasks: [
      task({ id: 1, dueDate: "2026-06-10", assignments: toMe(1) }),
      task({ id: 2, dueDate: TODAY, assignments: toMe(2) }),
      task({ id: 3, dueDate: "2026-06-18", assignments: toMe(3) }),
      task({ id: 4, dueDate: null, assignments: toMe(4) }),
      task({ id: 5, dueDate: "2026-06-30", assignments: toMe(5) }),
      task({ id: 6, dueDate: "2026-06-01", status: "done", assignments: toMe(6) }),
    ] }));
    expect(items.map(i => [i.key, i.lane])).toEqual([
      ["task-1", "late"], ["task-2", "today"], ["task-3", "soon"], ["task-4", "soon"],
    ]);
    expect(items[0]).toMatchObject({ kind: "task", daysLate: 3, mine: true });
  });

  it("counts tasks assigned to a role I hold, and Everyone tasks, as mine", () => {
    const items = derivePlate(input({
      myRoleIds: new Set([TREASURER_ROLE]),
      tasks: [
        task({ id: 1, assignments: [{ id: 1, brotherId: null, roleId: TREASURER_ROLE, brother: null, role: { id: TREASURER_ROLE, name: "Treasurer", color: null } }] }),
        task({ id: 2, everyone: "each" }),
      ],
    }));
    expect(items.map(i => i.mine)).toEqual([true, true]);
  });

  it("shows someone else's task only once it's late, and only to MANAGE_TASKS", () => {
    const tasks = [
      task({ id: 1, dueDate: "2026-06-01", assignments: toSomeone(1) }),
      task({ id: 2, dueDate: TODAY, assignments: toSomeone(2) }),
    ];
    expect(derivePlate(input({ tasks }))).toEqual([]);
    const items = derivePlate(input({ tasks, can: { tasks: true, treasury: false, events: false } }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "task-1", lane: "late", mine: false, as: "tasks", assignees: "Ava" });
  });

  it("lists unvoted open polls, options in order, closing today in Today", () => {
    const items = derivePlate(input({ polls: [
      poll({ id: 1, closeDate: TODAY }),
      poll({ id: 2, closeDate: "2026-06-20" }),
      poll({ id: 3, myVoteOptionId: 1 }),
      poll({ id: 4, status: "closed" }),
    ] }));
    expect(items.map(i => [i.key, i.lane])).toEqual([["poll-1", "today"], ["poll-2", "soon"]]);
    expect(items[0]).toMatchObject({ options: [{ id: 1, label: "A" }, { id: 2, label: "B" }] });
  });

  it("gates wrap-ups, reimbursements and the dues total on the permission that acts on them", () => {
    const base = {
      wrapUps: [{ id: 5, title: "Mixer", dueDate: "2026-06-11" }],
      reimbursements: [reimb({ id: 1 }), reimb({ id: 2, status: "approved" })],
      brothers: [brother({ id: 9, name: "Ava Brooks", duesOwed: 120 })],
    };
    expect(derivePlate(input(base))).toEqual([]);
    const items = derivePlate(input({ ...base, can: { tasks: false, treasury: true, events: true } }));
    expect(items.map(i => [i.kind, i.lane, i.as])).toEqual([
      ["wrap-up", "late", "events"], ["reimbursement", "soon", "treasury"], ["dues", "soon", "treasury"],
    ]);
    expect(items[0]).toMatchObject({ daysAgo: 2 });
    expect(items[1]).toMatchObject({ total: 40, requests: [{ id: 1, name: "Maya Patel", description: "Snacks" }] });
  });

  it("puts the dues total in Late when anyone is overdue, overdue members first", () => {
    const items = derivePlate(input({
      can: { tasks: false, treasury: true, events: false },
      brothers: [brother({ id: 1, name: "Big Owe", duesOwed: 300 }), brother({ id: 2, name: "Late Lou", duesOwed: 50 })],
      duesLate: new Map([[2, 12]]),
    }));
    expect(items[0]).toMatchObject({ kind: "dues", lane: "late", total: 350, count: 2, overdue: 1, top: [{ name: "Late Lou" }, { name: "Big Owe" }] });
  });

  it("shows my own dues to me, and nothing about dues when the org doesn't track them", () => {
    const brothers = [brother({ id: ME, name: "Rob Chen", duesOwed: 120 })];
    expect(derivePlate(input({ brothers, duesLate: new Map([[ME, 7]]) }))[0])
      .toMatchObject({ kind: "my-dues", lane: "late", amount: 120, lateDays: 7, mine: true });
    expect(derivePlate(input({ brothers, tracked: { duesOwed: false }, can: { tasks: false, treasury: true, events: false } }))).toEqual([]);
  });

  it("orders late, then today, then coming up", () => {
    const items = derivePlate(input({
      polls: [poll({ id: 1 })],
      tasks: [task({ id: 1, dueDate: TODAY, assignments: toMe(1) }), task({ id: 2, dueDate: "2026-06-12", assignments: toMe(2) })],
    }));
    expect(items.map(i => i.lane)).toEqual(["late", "today", "soon"]);
  });
});
