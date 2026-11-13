import { describe, expect, it } from "vitest";
import { deriveHomePlate } from "@/lib/home-plate";

const task = (id: number, dueDate: string | null, status = "open") => ({ id, status, dueDate });
const poll = (id: number, closeDate: string | null, myVoteOptionId: number | null = null, status = "open") =>
  ({ id, status, closeDate, myVoteOptionId });

describe("deriveHomePlate", () => {
  const today = "2026-11-17";

  it("lanes tasks like the web: late, today, the next week, undated", () => {
    const plate = deriveHomePlate({
      today, polls: [], dues: null,
      tasks: [task(1, "2026-11-14"), task(2, today), task(3, "2026-11-24"), task(4, "2026-11-25"), task(5, null), task(6, "2026-11-10", "done")],
    });
    expect(plate.map(i => i.kind === "task" && [i.task.id, i.lane, i.daysLate])).toEqual([
      [1, "late", 3], [2, "today", 0], [3, "soon", 0], [5, "soon", 0],
    ]);
  });

  it("keeps only open polls the member hasn't voted on; closing today is today", () => {
    const plate = deriveHomePlate({
      today, tasks: [], dues: null,
      polls: [poll(1, today), poll(2, null), poll(3, today, 9), poll(4, today, null, "closed")],
    });
    expect(plate.map(i => i.kind === "poll" && [i.poll.id, i.lane])).toEqual([[1, "today"], [2, "soon"]]);
  });

  it("adds the member's dues only when they owe, late when overdue, first in its lane", () => {
    const overdue = { owes: 120, standing: "overdue" };
    const plate = deriveHomePlate({ today, tasks: [task(1, "2026-11-01")], polls: [], dues: overdue });
    expect(plate.map(i => i.kind)).toEqual(["dues", "task"]);
    expect(plate[0]?.lane).toBe("late");
    expect(deriveHomePlate({ today, tasks: [], polls: [], dues: { owes: 0, standing: "paid" } })).toEqual([]);
  });
});
