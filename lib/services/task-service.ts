import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { TaskEveryone, TaskStatus } from "@/lib/state";
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
  completions: { select: { brotherId: true, completedAt: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

/**
 * What the client gets. For an `everyone = "each"` task, `status` and
 * `completedAt` are the VIEWER'S: done once they've ticked their part (or the
 * whole task closed), so every surface that reads `status` — the board, the
 * dashboard, the Timeline — shows each member their own copy. `doneCount` of
 * `memberCount` is the chapter-wide progress; both are null on other tasks.
 */
export type TaskDTO = Omit<TaskRow, "completions"> & {
  doneCount:   number | null;
  memberCount: number | null;
};

/** Active roster (not ghosts, not archived) — who an Everyone task resolves to. */
function activeMemberIds(ctx: RequestContext): Promise<number[]> {
  return ctx.db.member.listIds({ archivedAt: null });
}

async function toDTOs(ctx: RequestContext, rows: TaskRow[]): Promise<TaskDTO[]> {
  const needsRoster = rows.some(r => r.everyone === TaskEveryone.Each);
  const active = needsRoster ? new Set(await activeMemberIds(ctx)) : null;
  return rows.map(({ completions, ...r }) => {
    if (r.everyone !== TaskEveryone.Each || !active) return { ...r, doneCount: null, memberCount: null };
    // Only current members count toward progress: someone archived after
    // ticking shouldn't hold the bar above what the roster can reach.
    const counted = completions.filter(c => active.has(c.brotherId));
    const mine = completions.find(c => c.brotherId === ctx.actorId);
    const allDone = r.status === TaskStatus.Done;
    return {
      ...r,
      status:      allDone || mine ? TaskStatus.Done : TaskStatus.Open,
      completedAt: mine?.completedAt ?? (allDone ? r.completedAt : null),
      doneCount:   counted.length,
      memberCount: active.size,
    };
  });
}

async function loadTasks(ctx: RequestContext, where?: { status?: string; ids?: number[] }): Promise<TaskRow[]> {
  const rows = await ctx.db.task.findMany({
    where: {
      ...(where?.status ? { status: where.status } : {}),
      ...(where?.ids ? { id: { in: where.ids } } : {}),
    },
    // Order by id; the UI buckets by computed urgency (lib/tasks/urgency), so a
    // DB-level dueDate sort (with its nulls-handling quirks) buys nothing here.
    orderBy: { id: "asc" },
    include: TASK_INCLUDE,
  }) as TaskRow[];
  return withResolvedAssignees(ctx, rows);
}

// Org-local display name (Membership.name) for each assignee, same fallback
// rule as the roster. Without this, a member who renamed themselves in this
// org would still show their stale name on task assignee chips. loadTasks is
// the sole read path for TaskRow, so patching it here covers every caller.
async function withResolvedAssignees(ctx: RequestContext, rows: TaskRow[]): Promise<TaskRow[]> {
  const brothers = rows.flatMap(r => r.assignments.map(a => a.brother)).filter((b): b is NonNullable<typeof b> => b != null);
  if (brothers.length === 0) return rows;
  const nameByBrotherId = await ctx.db.member.resolveNames(brothers);
  return rows.map(r => ({
    ...r,
    assignments: r.assignments.map(a => a.brother
      ? { ...a, brother: { ...a.brother, name: nameByBrotherId.get(a.brother.id) ?? a.brother.name } }
      : a),
  }));
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

/**
 * True when the actor is an assignee of `task` — directly or via a role they hold.
 *
 * Role targets resolve to CURRENT holders at read time. A consequence: a task
 * assigned only to a role that currently has no holders resolves to no one — it
 * stays `open` but is un-actionable until someone is granted the role. This is by
 * design (not a bug); removing a member from a role correctly drops the task from
 * their "mine" list without rewriting any TaskAssignment row.
 */
function isAssignee(task: TaskRow, actorId: number, heldRoleIds: Set<number>): boolean {
  // An Everyone task belongs to every member, including ones who joined after it.
  if (task.everyone != null) return true;
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
  if (!filter?.mine) return toDTOs(ctx, rows);
  const held = await actorRoleIds(ctx);
  return toDTOs(ctx, rows.filter(t => isAssignee(t, ctx.actorId, held)));
}

/** One task as the viewer sees it — the shape every mutation returns. */
async function loadOne(ctx: RequestContext, id: number): Promise<TaskDTO> {
  const [row] = await toDTOs(ctx, await loadTasks(ctx, { ids: [id] }));
  return row;
}

// Resolve + validate assignee ids against the current org (the tenant wrapper
// scopes by org, so cross-tenant ids resolve to nothing and are rejected here).
async function resolveAssignees(ctx: RequestContext, brotherIds: number[], roleIds: number[]) {
  const uniqBrothers = [...new Set(brotherIds)];
  const uniqRoles    = [...new Set(roleIds)];

  if (uniqBrothers.length) {
    // listIds excludes ghosts, so a ghost id fails this count check and is
    // rejected like any non-member id.
    const found = await ctx.db.member.listIds({ brotherId: { in: uniqBrothers } });
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

  // An Everyone task carries no assignment rows: it resolves to the roster live.
  const everyone = input.everyone ?? null;
  const { brotherIds, roleIds } = everyone
    ? { brotherIds: [], roleIds: [] }
    : await resolveAssignees(ctx, input.assigneeBrotherIds, input.assigneeRoleIds);

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
        everyone,
        status:      TaskStatus.Open,
        createdById: ctx.actorId,
      },
    });
    if (!everyone) {
      await tx.taskAssignment.createMany({
        data: [
          ...brotherIds.map(brotherId => ({ organizationId: orgId, taskId: task.id, brotherId, roleId: null })),
          ...roleIds.map(roleId => ({ organizationId: orgId, taskId: task.id, brotherId: null, roleId })),
        ],
      });
    }
    return task;
  });

  await emit(ctx, "task.created", { type: "Task", id: created.id }, {
    title: created.title,
    dueDate: created.dueDate,
    assigneeCount: everyone ? (await activeMemberIds(ctx)).length : brotherIds.length + roleIds.length,
  });

  return loadOne(ctx, created.id);
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
    input.assigneeRoleIds !== undefined ||
    input.everyone !== undefined;
  // Switching to Everyone drops the assignment rows; picking members or roles
  // (or `everyone: null`) turns an Everyone task back into a targeted one.
  const nextEveryone = input.everyone !== undefined
    ? input.everyone
    : input.assigneeBrotherIds !== undefined || input.assigneeRoleIds !== undefined ? null : existing.everyone;
  // An "each" task's status is per member, so a status in the payload is the
  // caller ticking their own part — handled after the field edits below.
  const perMember = existing.everyone === TaskEveryone.Each && nextEveryone === TaskEveryone.Each;
  const changesStatus = !perMember && input.status !== undefined && input.status !== existing.status;

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

  if (nextEveryone !== existing.everyone) {
    data.everyone = nextEveryone;
    changedFields.push("everyone");
  }

  // Resolve the new assignee set (when either array is present, or when leaving
  // Everyone) and assert the ≥1-assignee invariant BEFORE any write, so a wipe
  // can't be the first thing the transaction does. Assignee arrays, when present,
  // REPLACE that side of the set; an absent array keeps the existing rows.
  const reassigning = !nextEveryone && (
    input.assigneeBrotherIds !== undefined || input.assigneeRoleIds !== undefined || existing.everyone != null);
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

    // Per-member ticks only mean something on an "each" task.
    if (existing.everyone === TaskEveryone.Each && nextEveryone !== TaskEveryone.Each) {
      await tx.taskCompletion.deleteMany({ where: { taskId: id, organizationId: orgId } });
    }
    if (nextEveryone && existing.everyone == null) {
      await tx.taskAssignment.deleteMany({ where: { taskId: id, organizationId: orgId } });
      changedFields.push("assignees");
    }
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

  if (changedFields.length) await emit(ctx, "task.updated", { type: "Task", id }, { title: existing.title, changedFields });

  if (perMember && input.status !== undefined) {
    return setStatus(ctx, id, input.status);
  }
  return loadOne(ctx, id);
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

  if (existing.everyone === TaskEveryone.Each) {
    await setMyPart(ctx, existing, done);
    return loadOne(ctx, id);
  }

  await ctx.db.task.update({
    where: { id },
    data: {
      status,
      completedById: done ? ctx.actorId : null,
      completedAt:   done ? new Date() : null,
    },
  });

  await emit(ctx, done ? "task.completed" : "task.reopened", { type: "Task", id }, { title: existing.title });

  return loadOne(ctx, id);
}

/**
 * Tick (or untick) the actor's own part of an "each" task, then keep the shared
 * status honest: done once every current member has ticked, open again the
 * moment anyone unticks. Members who join later don't reopen a closed task.
 */
async function setMyPart(ctx: RequestContext, task: TaskRow, done: boolean) {
  const mineNow = task.completions.some(c => c.brotherId === ctx.actorId);
  if (done === mineNow && (done || task.status !== TaskStatus.Done)) return;

  if (done) await ctx.db.taskCompletion.createMany({ data: [{ taskId: task.id, brotherId: ctx.actorId }] });
  else      await ctx.db.taskCompletion.deleteMany({ where: { taskId: task.id, brotherId: ctx.actorId } });

  const [active, ticked] = await Promise.all([
    activeMemberIds(ctx),
    ctx.db.taskCompletion.findMany({ where: { taskId: task.id }, select: { brotherId: true } }),
  ]);
  const tickedIds = new Set(ticked.map(c => c.brotherId));
  const allDone = active.length > 0 && active.every(bid => tickedIds.has(bid));
  if (allDone !== (task.status === TaskStatus.Done)) {
    await ctx.db.task.update({
      where: { id: task.id },
      data: allDone
        ? { status: TaskStatus.Done, completedById: ctx.actorId, completedAt: new Date() }
        : { status: TaskStatus.Open, completedById: null, completedAt: null },
    });
  }

  await emit(ctx, done ? "task.completed" : "task.reopened", { type: "Task", id: task.id }, { title: task.title });
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
