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
// We flatten the include into a dumb client shape. The Editorial Ballot is a
// BLIND ballot: per-option `voteCount` is withheld (null) until the viewer is
// entitled to the tally. `totalVotes` (how many have voted) is always shipped —
// it's the "N SEALED" count on the row — and `myVoteOptionId` (the caller's own
// pick) is never secret. The raw per-voter list is never shipped; managers get a
// derived `pendingVoters` roster (who hasn't voted) instead.
export interface PollOptionDTO { id: number; label: string; position: number; voteCount: number | null; }
export interface PollAssignmentDTO {
  id: number;
  brotherId: number | null;
  roleId: number | null;
  brother: { id: number; name: string; avatarUrl: string | null } | null;
  role: { id: number; name: string; color: string | null } | null;
}
export interface PollPendingVoterDTO { brotherId: number; name: string; avatarUrl: string | null; }
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
  /** Number of members who can vote (direct assignees ∪ current role holders). */
  assigneeCount: number;
  myVoteOptionId: number | null;
  /** True when per-option counts are withheld from this viewer (blind ballot). */
  sealed: boolean;
  /** Manager-only (MANAGE_POLLS): assignees who have not voted yet. Undefined otherwise. */
  pendingVoters?: PollPendingVoterDTO[];
}

// Org-local display name (Membership.name) for each assignee, same fallback
// rule as the roster. Without this, a member who renamed themselves in this
// org would still show their stale name on poll assignee chips.
async function withResolvedAssignees(ctx: RequestContext, dtos: PollDTO[]): Promise<PollDTO[]> {
  const brothers = dtos.flatMap(d => d.assignments.map(a => a.brother)).filter((b): b is NonNullable<PollAssignmentDTO["brother"]> => b != null);
  if (brothers.length === 0) return dtos;
  const nameByBrotherId = await ctx.db.membership.resolveNames(brothers);
  return dtos.map(d => ({
    ...d,
    assignments: d.assignments.map(a => a.brother
      ? { ...a, brother: { ...a.brother, name: nameByBrotherId.get(a.brother.id) ?? a.brother.name } }
      : a),
  }));
}

/**
 * Build client DTOs, enforcing the blind-ballot seal per viewer.
 *
 * A viewer sees per-option counts only when the poll is closed, they've voted,
 * or they can manage polls. Managers (MANAGE_POLLS) additionally get the
 * `pendingVoters` roster — the assignees, with roles expanded to their current
 * holders, who have not voted yet — on EVERY poll, even ones they didn't assign.
 * All name/holder lookups are batched across the whole `rows` set to avoid N+1.
 */
async function buildDTOs(ctx: RequestContext, rows: PollRow[]): Promise<PollDTO[]> {
  const iManage = canManage(ctx);

  // Expand every assigned role to its current holders in one query (role targets
  // resolve to holders at read time, mirroring isAssignee), then reuse per poll.
  const allRoleIds = [...new Set(rows.flatMap(r =>
    r.assignments.map(a => a.roleId).filter((x): x is number => x != null)))];
  const holdersByRole = new Map<number, number[]>();
  if (allRoleIds.length) {
    const holders = await ctx.db.brotherRole.findMany({
      where: { roleId: { in: allRoleIds } },
      select: { roleId: true, brotherId: true },
    });
    for (const h of holders) {
      const list = holdersByRole.get(h.roleId);
      if (list) list.push(h.brotherId);
      else holdersByRole.set(h.roleId, [h.brotherId]);
    }
  }

  // The concrete set of members who can vote on a poll.
  const assigneeIdsOf = (row: PollRow): Set<number> => {
    const ids = new Set<number>();
    for (const a of row.assignments) {
      if (a.brotherId != null) ids.add(a.brotherId);
      if (a.roleId != null) for (const b of holdersByRole.get(a.roleId) ?? []) ids.add(b);
    }
    return ids;
  };

  // Manager-only: gather every non-voter id across all polls, then resolve their
  // names/avatars in one batch.
  const pendingIdsByPoll = new Map<number, number[]>();
  let brotherById = new Map<number, { id: number; name: string; avatarUrl: string | null }>();
  let nameById = new Map<number, string>();
  if (iManage) {
    const allPendingIds = new Set<number>();
    for (const row of rows) {
      const voters = new Set(row.votes.map(v => v.brotherId));
      const pending = [...assigneeIdsOf(row)].filter(id => !voters.has(id));
      pendingIdsByPoll.set(row.id, pending);
      for (const id of pending) allPendingIds.add(id);
    }
    if (allPendingIds.size) {
      const brothers = await ctx.db.brother.findMany({
        where: { id: { in: [...allPendingIds] }, isGhost: false },
        select: { id: true, name: true, avatarUrl: true },
      });
      brotherById = new Map(brothers.map(b => [b.id, b]));
      nameById = await ctx.db.membership.resolveNames(brothers.map(b => ({ id: b.id, name: b.name })));
    }
  }

  const dtos: PollDTO[] = rows.map(row => {
    const closed = row.status === PollStatus.Closed;
    const myVote = row.votes.find(v => v.brotherId === ctx.actorId);
    const revealed = closed || myVote != null || iManage;
    return {
      id:          row.id,
      question:    row.question,
      closeDate:   row.closeDate,
      status:      row.status,
      createdById: row.createdById,
      closedById:  row.closedById,
      closedAt:    row.closedAt ? row.closedAt.toISOString() : null,
      createdAt:   row.createdAt.toISOString(),
      options: row.options.map(o => ({
        id: o.id, label: o.label, position: o.position,
        voteCount: revealed ? o._count.votes : null,
      })),
      assignments: row.assignments.map(a => ({
        id: a.id, brotherId: a.brotherId, roleId: a.roleId, brother: a.brother, role: a.role,
      })),
      totalVotes:     row.votes.length,
      assigneeCount:  assigneeIdsOf(row).size,
      myVoteOptionId: myVote ? myVote.optionId : null,
      sealed:         !revealed,
      pendingVoters:  iManage
        ? (pendingIdsByPoll.get(row.id) ?? [])
            .map(id => brotherById.get(id))
            .filter((b): b is NonNullable<typeof b> => b != null)
            .map(b => ({ brotherId: b.id, name: nameById.get(b.id) ?? b.name, avatarUrl: b.avatarUrl }))
        : undefined,
    };
  });

  return withResolvedAssignees(ctx, dtos);
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
  if (!filter?.mine) return buildDTOs(ctx, rows);
  const held = await actorRoleIds(ctx);
  return buildDTOs(ctx, rows.filter(p => isAssignee(p, ctx.actorId, held)));
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
  const [dto] = await buildDTOs(ctx, [row]);
  return dto;
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
  const [dto] = await buildDTOs(ctx, [row]);
  return dto;
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
  const [dto] = await buildDTOs(ctx, [row]);
  return dto;
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
  const [dto] = await buildDTOs(ctx, [row]);
  return dto;
}

export async function deletePoll(ctx: RequestContext, id: number): Promise<void> {
  if (!canManage(ctx)) throw new ForbiddenError("You do not have permission to delete polls");
  const target = await ctx.db.poll.findUnique({ where: { id }, select: { question: true } });
  if (!target) throw new NotFoundError("Poll");
  await ctx.db.poll.delete({ where: { id } }); // options / assignments / votes cascade
  await emit(ctx, "poll.deleted", { type: "Poll", id }, { question: target.question });
}
