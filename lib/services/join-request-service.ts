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

import type { RequestContext } from "@/lib/context";
import { prismaPrivileged } from "@/lib/prisma-privileged";
import { emit } from "@/lib/events";
import { ConflictError, ForbiddenError, NotFoundError, PaymentRequiredError } from "@/lib/errors";
import { canGrantRank } from "@/lib/permissions";
import { assertSeatAvailable } from "@/lib/billing/guard";
import { JoinRequestStatus } from "@/lib/state";
import type { ApproveJoinRequestInput } from "@/lib/validation/join-request";

export interface JoinRequestDto {
  id:        number;
  name:      string;
  email:     string | null;
  avatarUrl: string | null;
  createdAt: string;
  /** The link they came through — "Fall rush" tells an officer a lot. */
  inviteLabel: string | null;
}

/**
 * Seat gate, with the refusal recorded.
 *
 * Mirrors brother-service's gateSeat: assertSeatAvailable throws
 * PaymentRequiredError, and we emit billing.seats_blocked on the way out so an
 * admin whose queue has quietly stopped admitting people can explain it
 * afterwards. Duplicated rather than shared because cross-importing another
 * service is the thing this codebase forbids, and it is six lines.
 */
async function gateSeat(ctx: RequestContext): Promise<void> {
  try {
    await assertSeatAvailable(ctx.db);
  } catch (e) {
    if (e instanceof PaymentRequiredError) {
      const d = e.details as { currentMembers: number; requiredTier: string; action: string };
      await emit(ctx, "billing.seats_blocked", { type: "Subscription", id: ctx.orgId }, {
        members:      d.currentMembers,
        requiredTier: d.requiredTier,
        action:       d.action,
      });
    }
    throw e;
  }
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
  const request = await ctx.db.joinRequest.findUnique({ where: { id } });
  if (!request) throw new NotFoundError("Join request");
  if (request.status !== JoinRequestStatus.Pending) {
    throw new ConflictError("This request has already been decided.");
  }

  // Billable seat: reaching here means a NEW membership in this org.
  await gateSeat(ctx);

  // Rank guard. Same rule as granting a role on the roster (role-service), so an
  // officer can't use the approval dialog as a back door to mint a peer.
  let role: { id: number; name: string; rank: number } | null = null;
  if (input.roleId !== null) {
    role = await ctx.db.role.findUnique({
      where:  { id: input.roleId },
      select: { id: true, name: true, rank: true },
    });
    if (!role) throw new NotFoundError("Role");
    if (!canGrantRank(ctx.maxRank, role.rank)) {
      throw new ForbiddenError("Cannot grant a role at or above your own rank");
    }
  }

  // A Google account maps to one Brother globally (authUserId @unique). Someone
  // who already belongs to another chapter reuses that identity and gets a
  // SECOND Membership here — their own roster spot, with its own name, dues and
  // attendance, invisible to the other org. That is the Phase 2 split doing its
  // job; before it, this person got access but never appeared on the roster.
  //
  // Privileged and cross-org on purpose, the same posture as deleteBrother's
  // countMemberships: "does this account exist outside my chapter?" is a
  // question an org-scoped read structurally cannot answer — it would say no for
  // everyone, and answering no here mints a duplicate identity. Only an id
  // crosses the boundary; no other org's data is read.
  const existing = await findIdentityByAuthUserId(request.authUserId);
  const reused = existing !== null;

  const brotherId = await ctx.db.$transaction(async (tx) => {
    let bid: number;

    if (existing) {
      bid = existing.id;
    } else {
      const created = await ctx.db.identity.onTx(tx).create({
        data: {
          // The account-level canonical NAME, seeded from what they typed. From
          // here the two drift independently and only the Membership one renders.
          name:       request.name,
          authUserId: request.authUserId,
          email:      request.email,
          avatarUrl:  request.avatarUrl,
          isAdmin:    false,
          isGhost:    false,
        },
      });
      bid = created.id;
    }

    // The roster spot. Through the scoped delegate, never a hand-written write:
    // Membership carries organizationId, and omitting it is the money bug the
    // onTx header in lib/db/tenant.ts exists to prevent.
    await ctx.db.member.onTx(tx).create({
      data: {
        brotherId:  bid,
        isOrgAdmin: false,
        name:       request.name,
        // Membership.role is the free-text office label, and it only renders for
        // members holding no relational Role rows (roleTitle() in app/data.ts). The
        // authority the officer just granted lives in the BrotherRole below.
        role:         "Member",
        attendance:   0,
        duesOwed:     0,
        gpa:          0,
        serviceHours: 0,
      },
    });

    if (role) {
      await ctx.db.brotherRole.onTx(tx).create({ data: { brotherId: bid, roleId: role.id } });
    }

    // The redemption is written at APPROVAL, not at request time, so "who got in
    // through this link" and the maxUses tally both mean people actually admitted.
    await tx.inviteRedemption.upsert({
      where:  { inviteId_brotherId: { inviteId: request.inviteId, brotherId: bid } },
      create: { inviteId: request.inviteId, brotherId: bid },
      update: {},
    });

    await ctx.db.joinRequest.onTx(tx).update({
      where: { id },
      data:  {
        status:      JoinRequestStatus.Approved,
        decidedAt:   new Date(),
        decidedById: ctx.actorId,
        brotherId:   bid,
      },
    });

    return bid;
  });

  await emit(ctx, "join_request.approved", { type: "JoinRequest", id }, {
    name:     request.name,
    brotherId,
    roleId:   role?.id ?? null,
    roleName: role?.name ?? null,
    reused,
  });

  return { brotherId, name: request.name, roleName: role?.name ?? null };
}

/**
 * Decline someone.
 *
 * The row STAYS, as `rejected`. That is what makes the decision stick without a
 * blocklist: re-opening the same link is refused, while a different link an
 * officer chooses to send resets the row to pending. Rejection is per-person,
 * per-link — "you'd need a new link to try again" — and re-clicking can't put
 * them back in the queue. See lib/auth/join-request-submit.ts.
 *
 * Writes nothing else. A declined person never had a Brother, a Membership, or a
 * seat, so there is nothing to undo.
 */
export async function rejectJoinRequest(ctx: RequestContext, id: number) {
  const request = await ctx.db.joinRequest.findUnique({ where: { id } });
  if (!request) throw new NotFoundError("Join request");
  if (request.status !== JoinRequestStatus.Pending) {
    throw new ConflictError("This request has already been decided.");
  }

  await ctx.db.joinRequest.update({
    where: { id },
    data:  {
      status:      JoinRequestStatus.Rejected,
      decidedAt:   new Date(),
      decidedById: ctx.actorId,
    },
  });

  await emit(ctx, "join_request.rejected", { type: "JoinRequest", id }, { name: request.name });
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
