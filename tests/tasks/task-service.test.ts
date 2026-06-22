/**
 * Tests for the task service. Task + TaskAssignment superseded legacy Deadlines:
 * a task has an optional dueDate, status open|done, and is assigned to any mix of
 * members and/or roles (role holders resolve to current members at read time).
 *
 * Authority is split: creating / editing fields / reassigning / deleting requires
 * MANAGE_TASKS (or org/platform admin); a plain status flip is allowed for an
 * assignee (direct or via a held role). The route layer is thin — these tests
 * drive the service directly.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetDb } from "../setup/prisma";
import { createOrg, createBrother, createSemester } from "../setup/factories";
import { db } from "@/lib/db";
import {
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  reopenTask,
  listTasks,
} from "@/lib/services/task-service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/permissions";
import type { RequestContext } from "@/lib/context";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

/**
 * Build a context for an actor. Defaults to a plain member (no perms, not admin);
 * pass overrides to make an org admin or grant a permission bitfield.
 */
function ctxFor(orgId: number, actorId: number, over: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId:       randomUUID(),
    orgId,
    actorId,
    actorName:       "Tester",
    actorEmail:      null,
    authUserId:      "auth-test",
    membershipId:    null,
    permissions:     0,
    maxRank:         0,
    isOrgAdmin:      false,
    isPlatformAdmin: false,
    db:              db(orgId),
    ...over,
  };
}

/** Org + an active year-wide semester + an admin actor. */
async function seedOrg() {
  const org = await createOrg("Task Org", "task-org");
  const admin = await createBrother({ orgId: org.id, isOrgAdmin: true });
  await createSemester({ orgId: org.id, startDate: "2026-01-01", endDate: "2026-12-31" });
  return { org, admin, adminCtx: ctxFor(org.id, admin.id, { isOrgAdmin: true }) };
}

/** Seed a role in an org and return it. */
function createRole(orgId: number, name = "Recruitment") {
  return testPrisma.role.create({ data: { organizationId: orgId, name } });
}

/** Put a brother in a role. */
function grantRole(orgId: number, brotherId: number, roleId: number) {
  return testPrisma.brotherRole.create({ data: { organizationId: orgId, brotherId, roleId } });
}

/** Count assignment rows for a task (raw, cross-org, for assertions). */
function assignmentCount(taskId: number) {
  return testPrisma.taskAssignment.count({ where: { taskId } });
}

// ---------------------------------------------------------------------------
// Authority matrix
// ---------------------------------------------------------------------------

describe("authority", () => {
  it("org admin can create, edit fields, reassign, complete, reopen, delete", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, { title: "Plan retreat", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });

    const renamed = await updateTask(adminCtx, t.id, { title: "Plan fall retreat" });
    expect(renamed.title).toBe("Plan fall retreat");

    const other = await createBrother({ orgId: org.id });
    const reassigned = await updateTask(adminCtx, t.id, { assigneeBrotherIds: [other.id] });
    expect(reassigned.assignments.map(a => a.brotherId)).toEqual([other.id]);

    const done = await completeTask(adminCtx, t.id);
    expect(done.status).toBe("done");
    const reopened = await reopenTask(adminCtx, t.id);
    expect(reopened.status).toBe("open");

    await deleteTask(adminCtx, t.id);
    expect(await testPrisma.task.findUnique({ where: { id: t.id } })).toBeNull();
  });

  it("MANAGE_TASKS (non-admin) can create / edit / reassign / delete", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const mgr = await createBrother({ orgId: org.id });
    const mgrCtx = ctxFor(org.id, mgr.id, { permissions: PERMISSIONS.MANAGE_TASKS });

    const t = await createTask(mgrCtx, { title: "Order shirts", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });
    expect(t.title).toBe("Order shirts");
    const edited = await updateTask(mgrCtx, t.id, { title: "Order hoodies" });
    expect(edited.title).toBe("Order hoodies");
    await expect(deleteTask(mgrCtx, t.id)).resolves.toBeUndefined();
  });

  it("a direct assignee (no perm) may flip status but not edit fields", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const assignee = await createBrother({ orgId: org.id });
    const t = await createTask(adminCtx, { title: "Submit form", assigneeBrotherIds: [assignee.id], assigneeRoleIds: [] });

    const assigneeCtx = ctxFor(org.id, assignee.id);
    const done = await completeTask(assigneeCtx, t.id);
    expect(done.status).toBe("done");
    expect(done.completedById).toBe(assignee.id);

    await expect(updateTask(assigneeCtx, t.id, { title: "Hijack" })).rejects.toThrow(ForbiddenError);
    await expect(updateTask(assigneeCtx, t.id, { assigneeBrotherIds: [admin.id] })).rejects.toThrow(ForbiddenError);
  });

  it("a role assignee (no perm) may flip status via a held role", async () => {
    const { org, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    const role = await createRole(org.id);
    await grantRole(org.id, member.id, role.id);
    const t = await createTask(adminCtx, { title: "Tabling shift", assigneeBrotherIds: [], assigneeRoleIds: [role.id] });

    const memberCtx = ctxFor(org.id, member.id);
    const done = await completeTask(memberCtx, t.id);
    expect(done.status).toBe("done");
  });

  it("a non-assignee (no perm) may not flip status, create, or delete", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const outsider = await createBrother({ orgId: org.id });
    const t = await createTask(adminCtx, { title: "Private", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });

    const outCtx = ctxFor(org.id, outsider.id);
    await expect(completeTask(outCtx, t.id)).rejects.toThrow(ForbiddenError);
    await expect(updateTask(outCtx, t.id, { status: "done" })).rejects.toThrow(ForbiddenError);
    await expect(createTask(outCtx, { title: "x", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] })).rejects.toThrow(ForbiddenError);
    await expect(deleteTask(outCtx, t.id)).rejects.toThrow(ForbiddenError);
  });

  it("a manager (MANAGE_TASKS) may complete a task they are not assigned to", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const mgr = await createBrother({ orgId: org.id });
    const t = await createTask(adminCtx, { title: "Anyone's", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });

    const mgrCtx = ctxFor(org.id, mgr.id, { permissions: PERMISSIONS.MANAGE_TASKS });
    const done = await completeTask(mgrCtx, t.id);
    expect(done.status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Assignment edges
// ---------------------------------------------------------------------------

describe("assignment edges", () => {
  it("rejects cross-org member ids and writes no task", async () => {
    const { org, adminCtx } = await seedOrg();
    const otherOrg = await createOrg("Other", "other-org");
    const foreign = await createBrother({ orgId: otherOrg.id });

    await expect(
      createTask(adminCtx, { title: "x", assigneeBrotherIds: [foreign.id], assigneeRoleIds: [] }),
    ).rejects.toThrow(ValidationError);
    expect(await testPrisma.task.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("rejects cross-org role ids", async () => {
    const { adminCtx } = await seedOrg();
    const otherOrg = await createOrg("Other", "other-org");
    const foreignRole = await createRole(otherOrg.id);

    await expect(
      createTask(adminCtx, { title: "x", assigneeBrotherIds: [], assigneeRoleIds: [foreignRole.id] }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an isGhost member as an assignee", async () => {
    const { org, adminCtx } = await seedOrg();
    const ghost = await createBrother({ orgId: org.id, isGhost: true });
    await expect(
      createTask(adminCtx, { title: "x", assigneeBrotherIds: [ghost.id], assigneeRoleIds: [] }),
    ).rejects.toThrow(ValidationError);
  });

  it("dedupes repeated ids", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, {
      title: "Dupes", assigneeBrotherIds: [admin.id, admin.id], assigneeRoleIds: [],
    });
    expect(await assignmentCount(t.id)).toBe(1);
  });

  it("replaces only the brother side, leaving roles intact", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const role = await createRole(org.id);
    const other = await createBrother({ orgId: org.id });
    const t = await createTask(adminCtx, {
      title: "Mixed", assigneeBrotherIds: [admin.id], assigneeRoleIds: [role.id],
    });

    const updated = await updateTask(adminCtx, t.id, { assigneeBrotherIds: [other.id] });
    expect(updated.assignments.filter(a => a.brotherId != null).map(a => a.brotherId)).toEqual([other.id]);
    expect(updated.assignments.filter(a => a.roleId != null).map(a => a.roleId)).toEqual([role.id]);
  });

  it("replaces only the role side, leaving brothers intact", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const role1 = await createRole(org.id, "R1");
    const role2 = await createRole(org.id, "R2");
    const t = await createTask(adminCtx, {
      title: "Mixed", assigneeBrotherIds: [admin.id], assigneeRoleIds: [role1.id],
    });

    const updated = await updateTask(adminCtx, t.id, { assigneeRoleIds: [role2.id] });
    expect(updated.assignments.filter(a => a.brotherId != null).map(a => a.brotherId)).toEqual([admin.id]);
    expect(updated.assignments.filter(a => a.roleId != null).map(a => a.roleId)).toEqual([role2.id]);
  });
});

// ---------------------------------------------------------------------------
// P0: atomicity of the assignee swap
// ---------------------------------------------------------------------------

describe("atomicity (P0)", () => {
  it("rejects an empty-assignee update BEFORE touching the existing set", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, { title: "Keep me", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });
    expect(await assignmentCount(t.id)).toBe(1);

    // Clearing both sides must throw — and, because the guard now runs before the
    // delete, the original assignment must survive (no orphaned, assignee-less task).
    await expect(
      updateTask(adminCtx, t.id, { assigneeBrotherIds: [], assigneeRoleIds: [] }),
    ).rejects.toThrow(ValidationError);
    expect(await assignmentCount(t.id)).toBe(1);
    expect((await testPrisma.taskAssignment.findFirst({ where: { taskId: t.id } }))?.brotherId).toBe(admin.id);
  });

  it("a failed reassignment (cross-org id) leaves the original assignees intact", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, { title: "Keep me", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });
    const otherOrg = await createOrg("Other", "other-org");
    const foreign = await createBrother({ orgId: otherOrg.id });

    await expect(
      updateTask(adminCtx, t.id, { assigneeBrotherIds: [foreign.id] }),
    ).rejects.toThrow(ValidationError);
    // resolveAssignees rejects before the transaction, so the swap never starts.
    expect(await assignmentCount(t.id)).toBe(1);
    expect((await testPrisma.taskAssignment.findFirst({ where: { taskId: t.id } }))?.brotherId).toBe(admin.id);
  });

  it("created task + assignments are written atomically with the right org id", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const role = await createRole(org.id);
    const t = await createTask(adminCtx, {
      title: "Atomic", assigneeBrotherIds: [admin.id], assigneeRoleIds: [role.id],
    });

    const rows = await testPrisma.taskAssignment.findMany({ where: { taskId: t.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.organizationId === org.id)).toBe(true);
    expect((await testPrisma.task.findUnique({ where: { id: t.id } }))?.organizationId).toBe(org.id);
  });
});

// ---------------------------------------------------------------------------
// Tenancy & integrity
// ---------------------------------------------------------------------------

describe("tenancy & integrity", () => {
  it("update / delete / complete on a foreign task id throw NotFound", async () => {
    const { adminCtx } = await seedOrg();
    const otherOrg = await createOrg("Other", "other-org");
    const otherAdmin = await createBrother({ orgId: otherOrg.id, isOrgAdmin: true });
    await createSemester({ orgId: otherOrg.id, startDate: "2026-01-01", endDate: "2026-12-31" });
    const otherCtx = ctxFor(otherOrg.id, otherAdmin.id, { isOrgAdmin: true });
    const foreignTask = await createTask(otherCtx, { title: "Theirs", assigneeBrotherIds: [otherAdmin.id], assigneeRoleIds: [] });

    await expect(updateTask(adminCtx, foreignTask.id, { title: "x" })).rejects.toThrow(NotFoundError);
    await expect(completeTask(adminCtx, foreignTask.id)).rejects.toThrow(NotFoundError);
    await expect(deleteTask(adminCtx, foreignTask.id)).rejects.toThrow(NotFoundError);
  });

  it("deleting a task cascades its assignments", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, { title: "Doomed", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });
    expect(await assignmentCount(t.id)).toBe(1);

    await deleteTask(adminCtx, t.id);
    expect(await assignmentCount(t.id)).toBe(0);
  });

  it("updates a legacy task whose createdById is null", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const legacy = await testPrisma.task.create({
      data: { organizationId: org.id, title: "Old", dueDate: null, status: "open", createdById: null },
    });
    await testPrisma.taskAssignment.create({ data: { organizationId: org.id, taskId: legacy.id, brotherId: admin.id } });

    const updated = await updateTask(adminCtx, legacy.id, { title: "Renamed" });
    expect(updated.title).toBe("Renamed");
  });
});

// ---------------------------------------------------------------------------
// Status / completion
// ---------------------------------------------------------------------------

describe("status & completion", () => {
  it("completeTask stamps completedById/completedAt; reopenTask clears them", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, { title: "Track me", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });

    const done = await completeTask(adminCtx, t.id);
    expect(done.status).toBe("done");
    expect(done.completedById).toBe(admin.id);
    expect(done.completedAt).not.toBeNull();

    const reopened = await reopenTask(adminCtx, t.id);
    expect(reopened.status).toBe("open");
    expect(reopened.completedById).toBeNull();
    expect(reopened.completedAt).toBeNull();
  });

  it("updateTask {status:'done'} stamps completion fields (parity with completeTask)", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, { title: "Via patch", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });

    const done = await updateTask(adminCtx, t.id, { status: "done" });
    expect(done.status).toBe("done");
    expect(done.completedById).toBe(admin.id);
    expect(done.completedAt).not.toBeNull();
  });

  it("setting status to its current value is a no-op (no completion churn)", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const t = await createTask(adminCtx, { title: "Stay open", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });

    const same = await updateTask(adminCtx, t.id, { status: "open" });
    expect(same.status).toBe("open");
    expect(same.completedById).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Listing (mine / status)
// ---------------------------------------------------------------------------

describe("listTasks", () => {
  it("filter.mine returns tasks assigned directly or via a held role", async () => {
    const { org, admin, adminCtx } = await seedOrg();
    const member = await createBrother({ orgId: org.id });
    const role = await createRole(org.id);
    await grantRole(org.id, member.id, role.id);

    const direct = await createTask(adminCtx, { title: "Direct", assigneeBrotherIds: [member.id], assigneeRoleIds: [] });
    const viaRole = await createTask(adminCtx, { title: "Via role", assigneeBrotherIds: [], assigneeRoleIds: [role.id] });
    await createTask(adminCtx, { title: "Not mine", assigneeBrotherIds: [admin.id], assigneeRoleIds: [] });

    const memberCtx = ctxFor(org.id, member.id);
    const mine = await listTasks(memberCtx, { mine: true });
    expect(mine.map(t => t.id).sort()).toEqual([direct.id, viaRole.id].sort());
  });
});
