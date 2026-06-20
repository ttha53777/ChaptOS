/**
 * Unit tests for deriveNeedsAttention — the pure derivation behind the
 * dashboard's "Needs attention" queue. No DB; `today` is injected so the
 * day-late math is deterministic. (vitest's global setup still runs a
 * `prisma db push`, so `npm run test:db:up` must be running.)
 */

import { describe, expect, it } from "vitest";
import { deriveNeedsAttention, type Brother, type Task, type TaskAssignment } from "@/app/data";
import { DEFAULT_THRESHOLDS } from "@/lib/thresholds";

const TODAY = "2026-06-13";

function brother(over: Partial<Brother> & { id: number; name: string }): Brother {
  return { role: "", attendance: 95, gpa: 3.7, duesOwed: 0, serviceHours: 15, ...over };
}
// Assign to a single member, so taskAssigneeLabel renders their first name.
function memberAssignment(name: string): TaskAssignment {
  return { id: 1, brotherId: 1, roleId: null, brother: { id: 1, name, avatarUrl: null }, role: null };
}
function task(over: Partial<Task> & { id: number }): Task {
  return {
    title: "Task", dueDate: "2026-05-14", status: "open", notes: null,
    createdById: null, completedById: null, completedAt: null, createdAt: "2026-05-01",
    assignments: [], ...over,
  };
}

describe("deriveNeedsAttention", () => {
  it("flags incomplete, past-due tasks with correct days-late and skips done/future/undated", () => {
    const tasks = [
      task({ id: 1, title: "Academic Report", dueDate: "2026-05-14", status: "open", assignments: [memberAssignment("Rinchen Sherpalama")] }),
      task({ id: 2, title: "Future Task", dueDate: "2026-06-20", status: "open" }),  // future → skip
      task({ id: 3, title: "Done Task", dueDate: "2026-05-01", status: "done" }),    // done → skip
      task({ id: 4, title: "Undated", dueDate: null, status: "open" }),              // no date → skip
    ];
    const items = deriveNeedsAttention([], tasks, DEFAULT_THRESHOLDS, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "deadline-overdue", id: 1, daysLate: 30, assignees: "Rinchen" });
  });

  it("aggregates outstanding dues into one row, largest balance first", () => {
    const brothers = [
      brother({ id: 1, name: "Noah Kim", attendance: 82, gpa: 3.2, duesOwed: 75 }),
      brother({ id: 2, name: "Nathaniel B", attendance: 90, gpa: 3.3, duesOwed: 150 }),
      brother({ id: 3, name: "Paid Up", duesOwed: 0 }),
    ];
    const items = deriveNeedsAttention(brothers, [], DEFAULT_THRESHOLDS, TODAY);
    const dues = items.find((i) => i.kind === "dues");
    expect(dues).toBeDefined();
    if (dues?.kind !== "dues") throw new Error("expected dues item");
    expect(dues.total).toBe(225);
    expect(dues.brothers.map((b) => b.name)).toEqual(["Nathaniel B", "Noah Kim"]); // sorted desc by amount
  });

  it("flags at-risk members (below attendance or GPA cutoff)", () => {
    const brothers = [
      brother({ id: 1, name: "At Risk Att", attendance: 58, gpa: 3.3 }),   // attendance < 65
      brother({ id: 2, name: "At Risk Gpa", attendance: 90, gpa: 2.5 }),   // gpa < 2.7
      brother({ id: 3, name: "Fine", attendance: 90, gpa: 3.4 }),
    ];
    const risks = deriveNeedsAttention(brothers, [], DEFAULT_THRESHOLDS, TODAY).filter((i) => i.kind === "member-risk");
    expect(risks.map((r) => (r.kind === "member-risk" ? r.name : ""))).toEqual(["At Risk Att", "At Risk Gpa"]);
  });

  it("orders rows: overdue tasks, then dues, then at-risk members", () => {
    const brothers = [brother({ id: 1, name: "Risky", attendance: 50, gpa: 2.0, duesOwed: 100 })];
    const tasks = [task({ id: 9, dueDate: "2026-06-01", status: "open" })];
    const kinds = deriveNeedsAttention(brothers, tasks, DEFAULT_THRESHOLDS, TODAY).map((i) => i.kind);
    expect(kinds).toEqual(["deadline-overdue", "dues", "member-risk"]);
  });

  it("returns an empty queue when nothing needs attention", () => {
    const brothers = [brother({ id: 1, name: "All Good" })];
    const tasks = [task({ id: 1, dueDate: "2026-07-01", status: "open" })];
    expect(deriveNeedsAttention(brothers, tasks, DEFAULT_THRESHOLDS, TODAY)).toEqual([]);
  });
});
