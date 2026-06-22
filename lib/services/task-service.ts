import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { TaskStatus } from "@/lib/state";
import { assertWithinActiveSemester } from "./semester-bounds";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validation/task";

// The include shape used everywhere we return a task to the client: the task
// plus its resolved assignees (member + role summaries). Role targets are NOT
// expanded to holders here — the UI shows "Role: Recruitment" as a single chip;
// holder expansion happens only when we answer "is this person an assignee?"
// (see isAssignee / the ?assignee=me list).
const TASK_INCLUDE = {
  assignments: {
    include: {
      brother: { select: { id: true, name: true, avatarUrl: true } },
      role:    { select: { id: true, name: true, color: true } },
    },
  },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

function loadTasks(ctx: RequestContext, where?: { status?: string; ids?: number[] }): Promise<TaskRow[]> {
  return ctx.db.task.findMany({
    where: {
      ...(where?.status ? { status: where.status } : {}),
      ...(where?.ids ? { id: { in: where.ids } } : {}),
    },
    // Order by id; the UI buckets by computed urgency (lib/tasks/urgency), so a
    // DB-level dueDate sort (with its nulls-handling quirks) buys nothing here.
    orderBy: { id: "asc" },
    include: TASK_INCLUDE,
  }) as Promise<TaskRow[]>;
}

/** Manager = can create/edit/assign/delete any task. */
function canManage(ctx: RequestContext): boolean {
  return ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_TASKS");
}

/** The set of role ids the actor currently holds in this org. */
async function actorRoleIds(ctx: RequestContext): Promise<Set<number>> {
  const rows = await ctx.db.brotherRole.findMany({
    where: { brotherId: ctx.actorId },
    select: { roleId: true },
  });
  return new Set(rows.map(r => r.roleId));
}

/** True when the actor is an assignee of `task` — directly or via a role they hold. */
function isAssignee(task: TaskRow, actorId: number, heldRoleIds: Set<number>): boolean {
  return task.assignments.some(a =>
    (a.brotherId != null && a.brotherId === actorId) ||
    (a.roleId != null && heldRoleIds.has(a.roleId)),
  );
}

/**
 * List tasks. `filter.mine` scopes to tasks assigned to the actor (directly or
 * via a held role). `filter.status` narrows by open/done. Any member may read;
 * the route does not gate list on MANAGE_TASKS.
 */
export async function listTasks(ctx: RequestContext, filter?: { mine?: boolean; status?: string }) {
  const rows = await loadTasks(ctx, { status: filter?.status });
  if (!filter?.mine) return rows;
  const held = await actorRoleIds(ctx);
  return rows.filter(t => isAssignee(t, ctx.actorId, held));
}

// Resolve + validate assignee ids against the current org (the tenant wrapper
// scopes by org, so cross-tenant ids resolve to nothing and are rejected here).
async function resolveAssignees(ctx: RequestContext, brotherIds: number[], roleIds: number[]) {
  const uniqBrothers = [...new Set(brotherIds)];
  const uniqRoles    = [...new Set(roleIds)];

  if (uniqBrothers.length) {
    // isGhost: false excludes placeholder/merged members — a ghost id then fails
    // this count check and is rejected like any non-member id.
    const found = await ctx.db.brother.findMany({ where: { id: { in: uniqBrothers }, isGhost: false }, select: { id: true } });
    if (found.length !== uniqBrothers.length) throw new ValidationError("One or more assigned members are not in this organization");
  }
  if (uniqRoles.length) {
    const found = await ctx.db.role.findMany({ where: { id: { in: uniqRoles } }, select: { id: true } });
    if (found.length !== uniqRoles.length) throw new ValidationError("One or more assigned roles are not in this organization");
  }
  return { brotherIds: uniqBrothers, roleIds: uniqRoles };
}

export async function createTask(ctx: RequestContext, input: CreateTaskInput) {
  if (!canManage(ctx)) throw new ForbiddenError("You do not have permission to create tasks");

  // Only dated tasks are bound to the active semester; undated to-dos are not.
  if (input.dueDate) await assertWithinActiveSemester(ctx, input.dueDate);

  const { brotherIds, roleIds } = await resolveAssignees(ctx, input.assigneeBrotherIds, input.assigneeRoleIds);

  // Use the raw `tx` client so the task row and its assignments commit
  // atomically. The tx client is NOT org-scoped (see lib/db/tenant.ts), so every
  // write inside must carry organizationId: orgId explicitly.
  const orgId = ctx.orgId;
  const created = await ctx.db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        organizationId: orgId,
        title:       input.title,
        dueDate:     input.dueDate ?? null,
        notes:       input.notes ?? null,
        status:      TaskStatus.Open,
        createdById: ctx.actorId,
      },
    });
    await tx.taskAssignment.createMany({
      data: [
        ...brotherIds.map(brotherId => ({ organizationId: orgId, taskId: task.id, brotherId, roleId: null })),
        ...roleIds.map(roleId => ({ organizationId: orgId, taskId: task.id, brotherId: null, roleId })),
      ],
    });
    return task;
  });

  await emit(ctx, "task.created", { type: "Task", id: created.id }, {
    title: created.title,
    dueDate: created.dueDate,
    assigneeCount: brotherIds.length + roleIds.length,
  });

  const [row] = await loadTasks(ctx, { ids: [created.id] });
  return row;
}

export async function updateTask(ctx: RequestContext, id: number, input: UpdateTaskInput) {
  const [existing] = await loadTasks(ctx, { ids: [id] });
  if (!existing) throw new NotFoundError("Task");

  const manage = canManage(ctx);

  // What is the caller actually trying to change?
  const editsFields =
    input.title !== undefined ||
    input.dueDate !== undefined ||
    input.notes !== undefined ||
    input.assigneeBrotherIds !== undefined ||
    input.assigneeRoleIds !== undefined;
  const changesStatus = input.status !== undefined && input.status !== existing.status;

  // Field edits + reassignment require MANAGE_TASKS. A plain status flip is
  // allowed for an assignee (so a member can mark their own task done) — see the
  // dedicated completeTask/reopenTask, but support it here too for the edit form.
  if (editsFields && !manage) {
    throw new ForbiddenError("You do not have permission to edit tasks");
  }
  if (changesStatus && !manage) {
    const held = await actorRoleIds(ctx);
    if (!isAssignee(existing, ctx.actorId, held)) {
      throw new ForbiddenError("You can only change the status of tasks assigned to you");
    }
  }

  // Re-validate the due date only when it's being set to a (non-null) value, so
  // editing other fields on a legacy out-of-range task isn't blocked.
  if (input.dueDate != null) await assertWithinActiveSemester(ctx, input.dueDate);

  const changedFields: string[] = [];
  const data: Record<string, unknown> = {};
  if (input.title !== undefined)   { data.title = input.title; changedFields.push("title"); }
  if (input.dueDate !== undefined) { data.dueDate = input.dueDate; changedFields.push("dueDate"); }
  if (input.notes !== undefined)   { data.notes = input.notes; changedFields.push("notes"); }
  if (changesStatus) {
    data.status = input.status;
    changedFields.push("status");
    if (input.status === TaskStatus.Done) { data.completedById = ctx.actorId; data.completedAt = new Date(); }
    else                                  { data.completedById = null; data.completedAt = null; }
  }

  // Resolve the new assignee set (when either array is present) and assert the
  // ≥1-assignee invariant BEFORE any write, so a wipe can't be the first thing
  // the transaction does. Assignee arrays, when present, REPLACE that side of
  // the set; an absent array keeps the existing rows for that side.
  const reassigning = input.assigneeBrotherIds !== undefined || input.assigneeRoleIds !== undefined;
  let nextAssignees: { brotherIds: number[]; roleIds: number[] } | null = null;
  if (reassigning) {
    nextAssignees = await resolveAssignees(
      ctx,
      input.assigneeBrotherIds ?? existing.assignments.filter(a => a.brotherId != null).map(a => a.brotherId!),
      input.assigneeRoleIds ?? existing.assignments.filter(a => a.roleId != null).map(a => a.roleId!),
    );
    if (nextAssignees.brotherIds.length + nextAssignees.roleIds.length === 0) {
      throw new ValidationError("A task needs at least one assignee");
    }
  }

  // Real transaction on the raw `tx` client so the field update and the
  // delete-then-recreate assignee swap commit atomically — a failure mid-swap
  // can no longer leave a task with its assignments deleted and not replaced.
  // The tx client is NOT org-scoped, so every write carries organizationId.
  const orgId = ctx.orgId;
  await ctx.db.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.task.update({ where: { id }, data });

    if (nextAssignees) {
      const { brotherIds, roleIds } = nextAssignees;
      await tx.taskAssignment.deleteMany({ where: { taskId: id, organizationId: orgId } });
      await tx.taskAssignment.createMany({
        data: [
          ...brotherIds.map(brotherId => ({ organizationId: orgId, taskId: id, brotherId, roleId: null })),
          ...roleIds.map(roleId => ({ organizationId: orgId, taskId: id, brotherId: null, roleId })),
        ],
      });
      changedFields.push("assignees");
    }
  });

  await emit(ctx, "task.updated", { type: "Task", id }, { title: existing.title, changedFields });

  const [row] = await loadTasks(ctx, { ids: [id] });
  return row;
}

// Status transitions an assignee is allowed to make on their own task, exposed
// as discrete service calls so the route can keep gating on "view" while the
// service enforces assignee-or-manager.
async function setStatus(ctx: RequestContext, id: number, status: string) {
  const [existing] = await loadTasks(ctx, { ids: [id] });
  if (!existing) throw new NotFoundError("Task");

  if (!canManage(ctx)) {
    const held = await actorRoleIds(ctx);
    if (!isAssignee(existing, ctx.actorId, held)) {
      throw new ForbiddenError("You can only change the status of tasks assigned to you");
    }
  }

  const done = status === TaskStatus.Done;
  await ctx.db.task.update({
    where: { id },
    data: {
      status,
      completedById: done ? ctx.actorId : null,
      completedAt:   done ? new Date() : null,
    },
  });

  await emit(ctx, done ? "task.completed" : "task.reopened", { type: "Task", id }, { title: existing.title });

  const [row] = await loadTasks(ctx, { ids: [id] });
  return row;
}

export function completeTask(ctx: RequestContext, id: number) {
  return setStatus(ctx, id, TaskStatus.Done);
}

export function reopenTask(ctx: RequestContext, id: number) {
  return setStatus(ctx, id, TaskStatus.Open);
}

export async function deleteTask(ctx: RequestContext, id: number) {
  if (!canManage(ctx)) throw new ForbiddenError("You do not have permission to delete tasks");
  const target = await ctx.db.task.findUnique({ where: { id }, select: { title: true } });
  if (!target) throw new NotFoundError("Task");
  await ctx.db.task.delete({ where: { id } }); // assignments cascade
  await emit(ctx, "task.deleted", { type: "Task", id }, { title: target.title });
}
