/**
 * "Everyone" tasks: a live target (not a roster snapshot) with a rule for who
 * finishes it. "any" = one person ticks it off for the chapter; "each" = every
 * member ticks their own, the viewer sees their own status, and the task closes
 * once all current members have. Plus the four urgency buckets (no "due soon").
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import { createTaskInput, updateTaskInput } from "@/lib/validation/task";
import { createTask, updateTask, completeTask, reopenTask, listTasks } from "@/lib/services/task-service";
import { deleteBrother } from "@/lib/services/brother-service";
import { taskUrgency } from "@/lib/tasks/urgency";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await testPrisma.$disconnect(); });

function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: randomUUID(), orgId, actorId, actorName: "Tester", actorEmail: null, authUserId: "auth-test",
    membershipId: null, permissions: 0, maxRank: 0, isOrgAdmin: false, isPlatformAdmin: false, db: db(orgId),
    ...over,
  };
}

async function seed() {
  const org = await createOrg("Everyone Org", "everyone-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  const a = await createBrother({ orgId: org.id });
  const b = await createBrother({ orgId: org.id });
  await createSemester({ orgId: org.id, startDate: "2026-01-01", endDate: "2026-12-31" });
  return { org, admin, a, b, adminCtx: ctxFor(org.id, admin.id, { isOrgAdmin: true }) };
}

describe("urgency buckets", () => {
  const today = new Date(2026, 9, 5); // Oct 5
  it("is overdue / urgent (today, tomorrow) / upcoming / none — no due-soon band", () => {
    expect(taskUrgency("2026-10-04", today)).toBe("overdue");
    expect(taskUrgency("2026-10-05", today)).toBe("urgent");
    expect(taskUrgency("2026-10-06", today)).toBe("urgent");
    expect(taskUrgency("2026-10-07", today)).toBe("upcoming");
    expect(taskUrgency("2026-10-12", today)).toBe("upcoming");
    expect(taskUrgency(null, today)).toBe("none");
  });
});

describe("validation", () => {
  it("accepts an Everyone task with no assignee ids, rejects an unknown mode", () => {
    expect(createTaskInput.safeParse({ title: "Sign bylaws", everyone: "each" }).success).toBe(true);
    expect(createTaskInput.safeParse({ title: "Sign bylaws" }).success).toBe(false);
    expect(createTaskInput.safeParse({ title: "Sign bylaws", everyone: "all" }).success).toBe(false);
    expect(updateTaskInput.safeParse({ everyone: null }).success).toBe(true);
  });
});

describe("everyone = any (one person for the chapter)", () => {
  it("writes no assignment rows, belongs to every member, and closes on the first tick", async () => {
    const { org, a, b, adminCtx } = await seed();
    const t = await createTask(adminCtx, { title: "Book the bus", everyone: "any", assigneeBrotherIds: [], assigneeRoleIds: [] });
    expect(t.everyone).toBe("any");
    expect(await testPrisma.taskAssignment.count({ where: { taskId: t.id } })).toBe(0);

    // A member who joins afterwards still has it on their "mine" list.
    const late = await createBrother({ orgId: org.id });
    expect((await listTasks(ctxFor(org.id, late.id), { mine: true })).map(x => x.id)).toEqual([t.id]);

    const done = await completeTask(ctxFor(org.id, a.id), t.id);
    expect(done.status).toBe("done");
    expect(done.completedById).toBe(a.id);
    const [seenByB] = await listTasks(ctxFor(org.id, b.id));
    expect(seenByB.status).toBe("done");
  });
});

describe("everyone = each (every member does it)", () => {
  it("shows each viewer their own part and chapter-wide progress", async () => {
    const { org, admin, a, b, adminCtx } = await seed();
    const t = await createTask(adminCtx, { title: "Sign the code of conduct", everyone: "each", assigneeBrotherIds: [], assigneeRoleIds: [] });
    expect(t).toMatchObject({ status: "open", doneCount: 0, memberCount: 3 });

    const mine = await completeTask(ctxFor(org.id, a.id), t.id);
    expect(mine).toMatchObject({ status: "done", doneCount: 1, memberCount: 3 });

    const [forB] = await listTasks(ctxFor(org.id, b.id));
    expect(forB).toMatchObject({ status: "open", doneCount: 1 });
    expect((await testPrisma.task.findUnique({ where: { id: t.id } }))!.status).toBe("open");

    // Ticking twice is a no-op, not a unique-constraint error.
    await expect(completeTask(ctxFor(org.id, a.id), t.id)).resolves.toMatchObject({ doneCount: 1 });

    await completeTask(ctxFor(org.id, b.id), t.id);
    const last = await completeTask(ctxFor(org.id, admin.id), t.id);
    expect(last).toMatchObject({ status: "done", doneCount: 3 });
    expect((await testPrisma.task.findUnique({ where: { id: t.id } }))!.status).toBe("done");

    // Unticking reopens the whole task, and only for the person who unticked.
    const undone = await reopenTask(ctxFor(org.id, b.id), t.id);
    expect(undone).toMatchObject({ status: "open", doneCount: 2 });
    expect((await testPrisma.task.findUnique({ where: { id: t.id } }))!.status).toBe("open");
    const [forA] = await listTasks(ctxFor(org.id, a.id));
    expect(forA.status).toBe("done");
  });

  it("a status PATCH from a plain member ticks their own part", async () => {
    const { org, a, adminCtx } = await seed();
    const t = await createTask(adminCtx, { title: "Pay the house fee", everyone: "each", assigneeBrotherIds: [], assigneeRoleIds: [] });
    const res = await updateTask(ctxFor(org.id, a.id), t.id, { status: "done" });
    expect(res).toMatchObject({ status: "done", doneCount: 1 });
    await expect(updateTask(ctxFor(org.id, a.id), t.id, { everyone: "any" })).rejects.toThrow(ForbiddenError);
  });

  it("archived members don't count toward the total", async () => {
    const { org, adminCtx } = await seed();
    await createBrother({ orgId: org.id, archivedAt: new Date() });
    const t = await createTask(adminCtx, { title: "Update your info", everyone: "each", assigneeBrotherIds: [], assigneeRoleIds: [] });
    expect(t.memberCount).toBe(3);
  });

  it("removing a member from the org drops their ticks", async () => {
    const { org, a, adminCtx } = await seed();
    const t = await createTask(adminCtx, { title: "Read the bylaws", everyone: "each", assigneeBrotherIds: [], assigneeRoleIds: [] });
    await completeTask(ctxFor(org.id, a.id), t.id);
    await deleteBrother(adminCtx, a.id);
    expect(await testPrisma.taskCompletion.count({ where: { taskId: t.id } })).toBe(0);
  });
});

describe("switching modes", () => {
  it("targeted → everyone drops the assignments; everyone → targeted needs assignees and clears ticks", async () => {
    const { org, a, b, adminCtx } = await seed();
    const t = await createTask(adminCtx, { title: "Clean the house", assigneeBrotherIds: [a.id], assigneeRoleIds: [] });

    const ev = await updateTask(adminCtx, t.id, { everyone: "each" });
    expect(ev.everyone).toBe("each");
    expect(ev.assignments).toEqual([]);
    await completeTask(ctxFor(org.id, a.id), t.id);

    await expect(updateTask(adminCtx, t.id, { everyone: null })).rejects.toThrow(ValidationError);

    const back = await updateTask(adminCtx, t.id, { assigneeBrotherIds: [b.id] });
    expect(back.everyone).toBeNull();
    expect(back.assignments.map(x => x.brotherId)).toEqual([b.id]);
    expect(await testPrisma.taskCompletion.count({ where: { taskId: t.id } })).toBe(0);
  });
});
