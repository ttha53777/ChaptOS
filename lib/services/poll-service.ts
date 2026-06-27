import type { Prisma } from "@/app/generated/prisma/client";
import type { RequestContext } from "@/lib/context";
import { emit } from "@/lib/events";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasPermission } from "@/lib/permissions";
import { PollStatus } from "@/lib/state";
import { assertWithinActiveSemester } from "./semester-bounds";
import type { CreatePollInput, UpdatePollInput } from "@/lib/validation/poll";

// The include shape used everywhere we load a poll. Options carry a vote tally
// via _count; assignments carry resolved member/role summaries (role targets are
// NOT expanded to holders here — the UI shows "Role: X" as one chip). The full
// votes list (just brotherId/optionId) lets us derive the caller's own pick.
const POLL_INCLUDE = {
  options: {
    orderBy: { position: "asc" },
    include: { _count: { select: { votes: true } } },
  },
  assignments: {
    include: {
      brother: { select: { id: true, name: true, avatarUrl: true } },
      role:    { select: { id: true, name: true, color: true } },
    },
  },
  votes: { select: { brotherId: true, optionId: true } },
} satisfies Prisma.PollInclude;

type PollRow = Prisma.PollGetPayload<{ include: typeof POLL_INCLUDE }>;

// ── Client DTO ────────────────────────────────────────────────────────────────
// We flatten the include into a dumb client shape: per-option voteCount, the
// caller's own pick (myVoteOptionId), and the total. The raw per-voter list is
// NOT shipped — results are public-but-aggregate, not itemized.
export interface PollOptionDTO { id: number; label: string; position: number; voteCount: number; }
export interface PollAssignmentDTO {
  id: number;
  brotherId: number | null;
  roleId: number | null;
  brother: { id: number; name: string; avatarUrl: string | null } | null;
  role: { id: number; name: string; color: string | null } | null;
}
export interface PollDTO {
  id: number;
  question: string;
  closeDate: string | null;
  status: string;
  createdById: number | null;
  closedById: number | null;
  closedAt: string | null;
  createdAt: string;
  options: PollOptionDTO[];
  assignments: PollAssignmentDTO[];
  totalVotes: number;
  myVoteOptionId: number | null;
}

function toDTO(row: PollRow, actorId: number): PollDTO {
  const myVote = row.votes.find(v => v.brotherId === actorId);
  return {
    id:          row.id,
    question:    row.question,
    closeDate:   row.closeDate,
    status:      row.status,
    createdById: row.createdById,
    closedById:  row.closedById,
    closedAt:    row.closedAt ? row.closedAt.toISOString() : null,
    createdAt:   row.createdAt.toISOString(),
    options: row.options.map(o => ({ id: o.id, label: o.label, position: o.position, voteCount: o._count.votes })),
    assignments: row.assignments.map(a => ({
      id: a.id, brotherId: a.brotherId, roleId: a.roleId, brother: a.brother, role: a.role,
    })),
    totalVotes:     row.votes.length,
    myVoteOptionId: myVote ? myVote.optionId : null,
  };
}

function loadPolls(ctx: RequestContext, where?: { status?: string; ids?: number[] }): Promise<PollRow[]> {
  return ctx.db.poll.findMany({
    where: {
      ...(where?.status ? { status: where.status } : {}),
      ...(where?.ids ? { id: { in: where.ids } } : {}),
    },
    orderBy: { id: "asc" },
    include: POLL_INCLUDE,
  }) as Promise<PollRow[]>;
}

/** Manager = can create/edit/assign/close/delete any poll. */
function canManage(ctx: RequestContext): boolean {
  return ctx.isPlatformAdmin || ctx.isOrgAdmin || hasPermission(ctx.permissions, "MANAGE_POLLS");
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
 * True when the actor is an assignee of `poll` — directly or via a role they
 * hold. Role targets resolve to CURRENT holders at read time (mirrors tasks):
 * granting someone a role gives them the vote on that role's open polls.
 */
function isAssignee(poll: PollRow, actorId: number, heldRoleIds: Set<number>): boolean {
  return poll.assignments.some(a =>
    (a.brotherId != null && a.brotherId === actorId) ||
    (a.roleId != null && heldRoleIds.has(a.roleId)),
  );
}

// Resolve + validate assignee ids against the current org (the tenant wrapper
// scopes by org, so cross-tenant ids resolve to nothing and are rejected here).
async function resolveAssignees(ctx: RequestContext, brotherIds: number[], roleIds: number[]) {
  const uniqBrothers = [...new Set(brotherIds)];
  const uniqRoles    = [...new Set(roleIds)];

  if (uniqBrothers.length) {
    const found = await ctx.db.brother.findMany({ where: { id: { in: uniqBrothers }, isGhost: false }, select: { id: true } });
    if (found.length !== uniqBrothers.length) throw new ValidationError("One or more assigned members are not in this organization");
  }
  if (uniqRoles.length) {
    const found = await ctx.db.role.findMany({ where: { id: { in: uniqRoles } }, select: { id: true } });
    if (found.length !== uniqRoles.length) throw new ValidationError("One or more assigned roles are not in this organization");
  }
  return { brotherIds: uniqBrothers, roleIds: uniqRoles };
}

/**
 * List polls. `filter.mine` scopes to polls the actor may vote on (assigned
 * directly or via a held role). `filter.status` narrows by open/closed. Any
 * member may read; the route does not gate list on MANAGE_POLLS.
 */
export async function listPolls(ctx: RequestContext, filter?: { mine?: boolean; status?: string }): Promise<PollDTO[]> {
  const rows = await loadPolls(ctx, { status: filter?.status });
  if (!filter?.mine) return rows.map(r => toDTO(r, ctx.actorId));
  const held = await actorRoleIds(ctx);
  return rows.filter(p => isAssignee(p, ctx.actorId, held)).map(r => toDTO(r, ctx.actorId));
}

export async function createPoll(ctx: RequestContext, input: CreatePollInput): Promise<PollDTO> {
  if (!canManage(ctx)) throw new ForbiddenError("You do not have permission to create polls");

  if (input.closeDate) await assertWithinActiveSemester(ctx, input.closeDate);

  const { brotherIds, roleIds } = await resolveAssignees(ctx, input.assigneeBrotherIds, input.assigneeRoleIds);

  // Raw `tx` client commits the poll, its options, and its assignments
  // atomically. The tx client is NOT org-scoped (see lib/db/tenant.ts), so
  // every write inside carries organizationId explicitly.
  const orgId = ctx.orgId;
  const created = await ctx.db.$transaction(async (tx) => {
    const poll = await tx.poll.create({
      data: {
        organizationId: orgId,
        question:    input.question,
        closeDate:   input.closeDate ?? null,
        status:      PollStatus.Open,
        createdById: ctx.actorId,
      },
    });
    await tx.pollOption.createMany({
      data: input.options.map((label, i) => ({ organizationId: orgId, pollId: poll.id, label, position: i })),
    });
    await tx.pollAssignment.createMany({
      data: [
        ...brotherIds.map(brotherId => ({ organizationId: orgId, pollId: poll.id, brotherId, roleId: null })),
        ...roleIds.map(roleId => ({ organizationId: orgId, pollId: poll.id, brotherId: null, roleId })),
      ],
    });
    return poll;
  });

  await emit(ctx, "poll.created", { type: "Poll", id: created.id }, {
    question: created.question,
    closeDate: created.closeDate,
    assigneeCount: brotherIds.length + roleIds.length,
  });

  const [row] = await loadPolls(ctx, { ids: [created.id] });
  return toDTO(row, ctx.actorId);
}

export async function updatePoll(ctx: RequestContext, id: number, input: UpdatePollInput): Promise<PollDTO> {
  const [existing] = await loadPolls(ctx, { ids: [id] });
  if (!existing) throw new NotFoundError("Poll");

  const manage = canManage(ctx);

  const editsFields =
    input.question !== undefined ||
    input.closeDate !== undefined ||
    input.options !== undefined ||
    input.assigneeBrotherIds !== undefined ||
    input.assigneeRoleIds !== undefined;
  const changesStatus = input.status !== undefined && input.status !== existing.status;

  // Both field edits AND status flips require MANAGE_POLLS — unlike tasks, a
  // voter cannot close/reopen a poll (they only cast votes via castVote).
  if ((editsFields || changesStatus) && !manage) {
    throw new ForbiddenError("You do not have permission to edit polls");
  }

  // Options can't change once anyone has voted: a delete-then-recreate would
  // orphan PollVote.optionId rows. Title/question/date/assignees stay editable.
  if (input.options !== undefined && existing.votes.length > 0) {
    throw new ValidationError("Can't change the options once voting has started");
  }

  // Re-validate closeDate only when set to a (non-null) value, so editing other
  // fields on a legacy out-of-range poll isn't blocked.
  if (input.closeDate != null) await assertWithinActiveSemester(ctx, input.closeDate);

  const changedFields: string[] = [];
  const data: Record<string, unknown> = {};
  if (input.question !== undefined)  { data.question = input.question; changedFields.push("question"); }
  if (input.closeDate !== undefined) { data.closeDate = input.closeDate; changedFields.push("closeDate"); }
  if (changesStatus) {
    data.status = input.status;
    changedFields.push("status");
    if (input.status === PollStatus.Closed) { data.closedById = ctx.actorId; data.closedAt = new Date(); }
    else                                    { data.closedById = null; data.closedAt = null; }
  }

  // Resolve the new assignee set (when either array is present) and assert the
  // >=1-assignee invariant BEFORE any write. Present array REPLACES that side;
  // absent array keeps the existing rows for that side.
  const reassigning = input.assigneeBrotherIds !== undefined || input.assigneeRoleIds !== undefined;
  let nextAssignees: { brotherIds: number[]; roleIds: number[] } | null = null;
  if (reassigning) {
    nextAssignees = await resolveAssignees(
      ctx,
      input.assigneeBrotherIds ?? existing.assignments.filter(a => a.brotherId != null).map(a => a.brotherId!),
      input.assigneeRoleIds ?? existing.assignments.filter(a => a.roleId != null).map(a => a.roleId!),
    );
    if (nextAssignees.brotherIds.length + nextAssignees.roleIds.length === 0) {
      throw new ValidationError("A poll needs at least one assignee");
    }
  }

  const orgId = ctx.orgId;
  await ctx.db.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.poll.update({ where: { id }, data });

    if (input.options !== undefined) {
      // Guarded above: only reachable when the poll has no votes.
      await tx.pollOption.deleteMany({ where: { pollId: id, organizationId: orgId } });
      await tx.pollOption.createMany({
        data: input.options.map((label, i) => ({ organizationId: orgId, pollId: id, label, position: i })),
      });
      changedFields.push("options");
    }

    if (nextAssignees) {
      const { brotherIds, roleIds } = nextAssignees;
      await tx.pollAssignment.deleteMany({ where: { pollId: id, organizationId: orgId } });
      await tx.pollAssignment.createMany({
        data: [
          ...brotherIds.map(brotherId => ({ organizationId: orgId, pollId: id, brotherId, roleId: null })),
          ...roleIds.map(roleId => ({ organizationId: orgId, pollId: id, brotherId: null, roleId })),
        ],
      });
      changedFields.push("assignees");
    }
  });

  await emit(ctx, "poll.updated", { type: "Poll", id }, { question: existing.question, changedFields });

  const [row] = await loadPolls(ctx, { ids: [id] });
  return toDTO(row, ctx.actorId);
}

// Manager-only status transitions, exposed as discrete calls so the route stays
// thin (gates on view; the service enforces manage).
async function setStatus(ctx: RequestContext, id: number, status: string): Promise<PollDTO> {
  const [existing] = await loadPolls(ctx, { ids: [id] });
  if (!existing) throw new NotFoundError("Poll");
  if (!canManage(ctx)) throw new ForbiddenError("You do not have permission to close or reopen polls");

  const closed = status === PollStatus.Closed;
  await ctx.db.poll.update({
    where: { id },
    data: {
      status,
      closedById: closed ? ctx.actorId : null,
      closedAt:   closed ? new Date() : null,
    },
  });

  await emit(ctx, closed ? "poll.closed" : "poll.reopened", { type: "Poll", id }, { question: existing.question });

  const [row] = await loadPolls(ctx, { ids: [id] });
  return toDTO(row, ctx.actorId);
}

export function closePoll(ctx: RequestContext, id: number) {
  return setStatus(ctx, id, PollStatus.Closed);
}

export function reopenPoll(ctx: RequestContext, id: number) {
  return setStatus(ctx, id, PollStatus.Open);
}

/**
 * Cast (or change) the actor's vote. Single-choice: an upsert on the
 * (pollId, brotherId) unique key, so re-voting moves the tally rather than
 * adding a second row. Only assignees (direct or via a held role) may vote, and
 * only while the poll is open. No event is emitted — emit() dual-writes an
 * ActivityLog row, and a vote-per-row feed would be noise.
 */
export async function castVote(ctx: RequestContext, pollId: number, optionId: number): Promise<PollDTO> {
  const [poll] = await loadPolls(ctx, { ids: [pollId] });
  if (!poll) throw new NotFoundError("Poll");
  if (poll.status !== PollStatus.Open) throw new ValidationError("This poll is closed");

  const held = await actorRoleIds(ctx);
  if (!isAssignee(poll, ctx.actorId, held)) {
    throw new ForbiddenError("You can only vote on polls assigned to you");
  }

  // The option must belong to THIS poll (a forged body could name any option id
  // in the org). poll.options is the resolved, org-scoped set.
  if (!poll.options.some(o => o.id === optionId)) {
    throw new ValidationError("That option does not belong to this poll");
  }

  await ctx.db.pollVote.upsert({
    where: { pollId_brotherId: { pollId, brotherId: ctx.actorId } },
    update: { optionId },
    create: { organizationId: ctx.orgId, pollId, optionId, brotherId: ctx.actorId },
  });

  const [row] = await loadPolls(ctx, { ids: [pollId] });
  return toDTO(row, ctx.actorId);
}

export async function deletePoll(ctx: RequestContext, id: number): Promise<void> {
  if (!canManage(ctx)) throw new ForbiddenError("You do not have permission to delete polls");
  const target = await ctx.db.poll.findUnique({ where: { id }, select: { question: true } });
  if (!target) throw new NotFoundError("Poll");
  await ctx.db.poll.delete({ where: { id } }); // options / assignments / votes cascade
  await emit(ctx, "poll.deleted", { type: "Poll", id }, { question: target.question });
}
