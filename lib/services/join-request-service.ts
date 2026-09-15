/**
 * The officer side of joining: reviewing the queue, and admitting or declining.
 *
 * The counterpart is lib/auth/join-request-submit.ts, which files the request
 * and runs pre-auth (the requester has no membership anywhere, so no ctx and no
 * org scoping exist yet). Everything here has a real RequestContext and is
 * org-scoped through ctx.db, because everything here is an officer acting inside
 * their own chapter.
 *
 * Approval is the ONLY path in this codebase that creates a roster spot. The
 * officer-typed one (createBrother / POST /api/brothers) was removed with the
 * flow this replaces — see 20260807000001_drop_accountless_members for why.
 */

import { Prisma } from "@/app/generated/prisma/client";
import { lockAdmissions, ADMISSION_TX_OPTIONS } from "@/lib/db/admission-lock";
import type { RequestContext } from "@/lib/context";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { deliverAdmissionEvents } from "@/lib/events/admission-delivery";
import { emit } from "@/lib/events";
import { ConflictError, ForbiddenError, NotFoundError, PaymentRequiredError } from "@/lib/errors";
import { canGrantRank } from "@/lib/permissions";
import { assertSeatAvailable, checkSeatAvailable } from "@/lib/billing/guard";
import { JoinRequestStatus } from "@/lib/state";
import type { ApproveJoinRequestInput, JoinRequestPageInput } from "@/lib/validation/join-request";

export interface JoinRequestDto {
  id:        number;
  name:      string;
  email:     string | null;
  avatarUrl: string | null;
  createdAt: string;
  /** The link they came through — "Fall rush" tells an officer a lot. */
  inviteLabel: string | null;
}

/** Everyone waiting on this org, oldest request first — a queue, not a feed. */
export async function listPendingRequests(ctx: RequestContext): Promise<JoinRequestDto[]> {
  const rows = await ctx.db.joinRequest.listPending(JoinRequestStatus.Pending);

  return rows.map(r => ({
    id:          r.id,
    name:        r.name,
    email:       r.email,
    avatarUrl:   r.avatarUrl,
    createdAt:   r.createdAt.toISOString(),
    inviteLabel: r.invite.label,
  }));
}

/** How many are waiting. Drives the sidebar badge via /api/auth/me. */
export async function countPendingRequests(ctx: RequestContext): Promise<number> {
  return ctx.db.joinRequest.count({ where: { status: JoinRequestStatus.Pending } });
}

export async function listPendingRequestPage(ctx: RequestContext, input: JoinRequestPageInput) {
  const where: Prisma.JoinRequestWhereInput = {
    status: JoinRequestStatus.Pending,
    ...(input.inviteId ? { inviteId: input.inviteId } : {}),
    ...(input.search ? { OR: [{ name: { contains: input.search, mode: "insensitive" } }, { email: { contains: input.search, mode: "insensitive" } }] } : {}),
  };
  const cursor = input.afterDate && input.afterId ? { OR: [
    { createdAt: { gt: new Date(input.afterDate) } },
    { createdAt: new Date(input.afterDate), id: { gt: input.afterId } },
  ] } : {};
  const [rows, total, pendingTotal, seats] = await Promise.all([
    ctx.db.joinRequest.listPage({ AND: [where, cursor] }, input.take + 1),
    ctx.db.joinRequest.count({ where }),
    ctx.db.joinRequest.count({ where: { status: JoinRequestStatus.Pending } }),
    checkSeatAvailable(ctx.db),
  ]);
  const page = rows.slice(0, input.take);
  const last = page.at(-1);
  return {
    rows: page.map(r => ({ id: r.id, name: r.name, email: r.email, avatarUrl: r.avatarUrl, createdAt: r.createdAt.toISOString(), inviteId: r.invite.id, inviteLabel: r.invite.label })),
    total, pendingTotal, seats,
    nextCursor: rows.length > input.take && last ? { afterDate: last.createdAt.toISOString(), afterId: last.id } : null,
  };
}

/**
 * Admit someone, optionally with a role.
 *
 * The seat check happens HERE rather than when the request was filed. That is
 * deliberate: a pending request costs nothing and occupies no seat, so an org at
 * its plan limit can still collect requests and decide who to make room for.
 * The person filing never learns anything about the org's billing state.
 */
export async function approveJoinRequest(
  ctx: RequestContext,
  id: number,
  input: ApproveJoinRequestInput,
) {
  // Bootstrap identity lookup stays outside the app transaction: a privileged
  // read must not wait for a pool held by submissions waiting on our org lock.
  const snapshot = await ctx.db.joinRequest.findUnique({ where: { id } });
  if (!snapshot) throw new NotFoundError("Join request");
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await findIdentityByAuthUserId(snapshot.authUserId);
    try {
      const result = await ctx.db.$transaction(async tx => {
        await lockAdmissions(tx, ctx.orgId);
        const requests = ctx.db.joinRequest.onTx(tx);
        const request = await requests.findUnique({ where: { id } });
        if (!request) throw new NotFoundError("Join request");
        if (request.status !== JoinRequestStatus.Pending) throw new ConflictError("This request has already been decided.", { code: "JOIN_REQUEST_DECIDED" });
        const member = ctx.db.member.onTx(tx);
        await assertSeatAvailable({ member, subscription: ctx.db.subscription.onTx(tx) });
        const role = input.roleId === null ? null : await tx.role.findFirst({
          where: { id: input.roleId, organizationId: ctx.orgId }, select: { id: true, name: true, rank: true },
        });
        if (input.roleId !== null && !role) throw new NotFoundError("Role");
        if (role && !canGrantRank(ctx.maxRank, role.rank)) throw new ForbiddenError("Cannot grant a role at or above your own rank");
        const invite = await ctx.db.orgInvite.onTx(tx).findUnique({ where: { id: request.inviteId } });
        if (!invite) throw new NotFoundError("Invite");
        // Existing reservations survive expiry/revoke. Legacy overbooked queues
        // may be reviewed, but must never admit beyond the actual link cap.
        const admitted = await tx.inviteRedemption.count({ where: { inviteId: invite.id } });
        if (invite.maxUses !== null && admitted >= invite.maxUses) {
          throw new ConflictError("This link's admission limit has been reached. Decline this request and send a replacement link.");
        }
        const identity = existing ?? await ctx.db.identity.onTx(tx).create({ data: {
          name: request.name, authUserId: request.authUserId, email: request.email,
          avatarUrl: request.avatarUrl, isAdmin: false, isGhost: false,
        } });
        const brotherId = identity.id;
        await member.create({ data: {
          brotherId, isOrgAdmin: false, name: request.name, role: "Member",
          attendance: 0, duesOwed: 0, gpa: 0, serviceHours: 0,
        } });
        if (role) await ctx.db.brotherRole.onTx(tx).create({ data: { brotherId, roleId: role.id } });
        await tx.inviteRedemption.upsert({
          where: { inviteId_brotherId: { inviteId: invite.id, brotherId } },
          create: { inviteId: invite.id, brotherId }, update: {},
        });
        const changed = await requests.decidePending(id, {
          status: JoinRequestStatus.Approved, decidedAt: new Date(), decidedById: ctx.actorId, brotherId,
        });
        if (changed.count !== 1) throw new ConflictError("This request has already been decided.", { code: "JOIN_REQUEST_DECIDED" });
        const result = { brotherId, name: request.name, roleId: role?.id ?? null, roleName: role?.name ?? null, reused: existing !== null };
        await emit(ctx, "join_request.approved", { type: "JoinRequest", id }, result, { transaction: tx });
        return result;
      }, ADMISSION_TX_OPTIONS);
      await deliverAdmissionEvents(ctx);
      return { brotherId: result.brotherId, name: result.name, roleName: result.roleName };
    } catch (e) {
      // A different org can mint this account while our transaction is in
      // flight. Roll back everything, re-read only its id, then retry normally.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      if (e instanceof PaymentRequiredError) {
        const d = e.details as { currentMembers: number; requiredTier: string; action: string };
        await emit(ctx, "billing.seats_blocked", { type: "Subscription", id: ctx.orgId }, {
          members: d.currentMembers, requiredTier: d.requiredTier, action: d.action,
        });
      }
      throw e;
    }
  }
  throw new ConflictError("Admission changed while you were reviewing it. Please refresh.");
}

export async function rejectJoinRequest(ctx: RequestContext, id: number) {
  await ctx.db.$transaction(async tx => {
    await lockAdmissions(tx, ctx.orgId);
    const requests = ctx.db.joinRequest.onTx(tx);
    const row = await requests.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Join request");
    const changed = await requests.decidePending(id, {
      status: JoinRequestStatus.Rejected, decidedAt: new Date(), decidedById: ctx.actorId,
    });
    if (changed.count !== 1) throw new ConflictError("This request has already been decided.", { code: "JOIN_REQUEST_DECIDED" });
    await emit(ctx, "join_request.rejected", { type: "JoinRequest", id }, { name: row.name }, { transaction: tx });
  }, ADMISSION_TX_OPTIONS);
  await deliverAdmissionEvents(ctx);
}

/**
 * Does this Google account already own a Brother, in ANY org?
 *
 * Deliberately privileged and deliberately cross-org — see the call site. The
 * same shape as brother-service's countMemberships, for the same reason.
 */
async function findIdentityByAuthUserId(authUserId: string): Promise<{ id: number } | null> {
  return prismaPrivileged.brother.findUnique({ // lint-direct-prisma:ignore cross-org by design; one account's own identity row
    where:  { authUserId },
    select: { id: true },
  });
}
